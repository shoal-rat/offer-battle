import {writeFile,mkdir} from 'node:fs/promises';
import {defaultLoadout,stableHash} from '../src/game/offers';
import {applyCommand} from '../src/game/engine';
import {getView} from '../src/game/views';
import {chooseLegacyBotCommand} from '../src/game/ai/legacy';
import {createTempoTrial,replayTempo,experimentFlags} from '../src/game/experiments';
const count=process.argv.indexOf('--pairs'),pairs=count<0?6:Number(process.argv[count+1]);if(!Number.isInteger(pairs)||pairs<1||pairs>100)throw Error('--pairs must be 1–100');
const flags=experimentFlags({tempo:true}),runs:any[]=[];const started=performance.now();
for(const penalty of [0,1] as const)for(let pair=0;pair<pairs;pair++)for(const swap of [false,true]){
 const a=defaultLoadout('a','策略甲',5),b=defaultLoadout('b','策略乙',6),loadouts=(swap?[b,a]:[a,b]) as [typeof a,typeof b];const record=createTempoTrial(loadouts,220001+pair,{firstPlayerStartingMindPenalty:penalty},{baselinePairs:penalty?pairs:0,replaysVerified:penalty===1},flags);let state=structuredClone(record.initialState);
 for(let n=0;n<600&&!state.result;n++){const actorId=state.activePlayerId,command=chooseLegacyBotCommand(getView(state,actorId),actorId==='a'?'aggressive':'control');const result=applyCommand(state,actorId,command);if(result.error)throw Error(result.error);record.journal.push({actorId,command});state=result.state;}
 if(!state.result)throw Error('Experiment exceeded 600 commands');const replay=replayTempo(record);if(stableHash(replay)!==stableHash(state))throw Error('Experiment replay mismatch');runs.push({pair,swap,penalty,first:state.firstPlayerId,winner:state.result.winnerId,round:state.round,commands:record.journal.length,hash:stableHash(state),record});
}
const wilson=(score:number,n:number)=>{const z=1.959963984540054,p=score/n,d=1+z*z/n,center=(p+z*z/(2*n))/d,half=z*Math.sqrt((p*(1-p)+z*z/(4*n))/n)/d;return [center-half,center+half]};
const summary={source:'lab-simulation',version:'2.2.0-exp.1',baselineBattleRules:'2.0.0',offerCompiler:'2.1.0',bot:'legacy-public-view-heuristic',pairsPerVariant:pairs,games:runs.length,singleVariable:'firstPlayerStartingMindPenalty',values:[0,1],allReplaysVerified:true,elapsedMs:Math.round(performance.now()-started),variants:[0,1].map(penalty=>{const rows=runs.filter(r=>r.penalty===penalty),firstWins=rows.filter(r=>r.winner===r.first).length,draws=rows.filter(r=>r.winner===null).length,score=firstWins+draws/2;return {penalty,games:rows.length,firstWins,secondWins:rows.filter(r=>r.winner&&r.winner!==r.first).length,draws,firstScoreRate:score/rows.length,firstScoreWilson95: wilson(score,rows.length),timeoutActions:rows.reduce((n,r)=>n+r.record.journal.filter((e:any)=>e.command.type==='TIMEOUT').length,0),missedLethals:null,missedLethalMeasurement:'not measured by this pilot runner'}}),adoptedIntoStandardRules:false,realUserWinRate:null,interpretation:'Pilot only; per-game Wilson intervals do not account for paired-game correlation. Too few seeds and loadouts for a balance conclusion.'};
await mkdir('reports/experiments',{recursive:true});await writeFile('reports/experiments/tempo-pairs.json',JSON.stringify({summary,runs},null,2));console.log(JSON.stringify(summary,null,2));
