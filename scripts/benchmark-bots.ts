/** Paired, reproducible evaluations. Never changes game RNG or production budgets. */
import {mkdirSync,writeFileSync,readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createMatch,defaultLoadout,applyCommand,getView,education,stableHash,chooseLegacyBotCommand,decideBotCommand,createBotKnowledge,updateBotKnowledge,BOT_VERSION,BOT_BUDGETS} from '../src/game/index';
import {botRandom} from '../src/game/ai/belief';
import type {BotDifficulty,BotStyle,BotKnowledge} from '../src/game/ai';
import type {Command,Loadout} from '../src/game/types';
const arg=(name:string,fallback:string)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1]};
const pairs=Number(arg('--pairs','500')),startPair=Number(arg('--start-pair','0')),output=arg('--output','reports/ai-benchmark.json'),asymmetric=process.argv.includes('--asymmetric'),seedBase=Number(arg('--seed','19072091'));
if(!Number.isInteger(pairs)||pairs<1||pairs>5000)throw Error('--pairs must be 1..5000');
type Algorithm='legacy'|BotDifficulty;
const matchups:[Algorithm,Algorithm][]=[['hard','legacy'],['expert','normal'],['easy','legacy'],['normal','legacy'],['hard','normal']];
const records:any[]=[],timings:Record<string,number[]>={},nodes:Record<string,number[]>={},metrics:Record<string,{decisions:number;fallbacks:number;timeouts:number;skills:number;immediateSelfLoss:number;illegal:number;missedImmediatePublicWin:number;immediatePublicWinOpportunities:number}>={};
const begin=performance.now();
const implementationHash=createHash('sha256').update(readdirSync('src/game/ai').sort().map(file=>readFileSync('src/game/ai/'+file,'utf8')).join('\n')).digest('hex');
function recordMetric(id:string){return metrics[id]??=( {decisions:0,fallbacks:0,timeouts:0,skills:0,immediateSelfLoss:0,illegal:0,missedImmediatePublicWin:0,immediatePublicWinOpportunities:0})}
function quantile(xs:number[],p:number){const sorted=[...xs].sort((a,b)=>a-b);return sorted[Math.floor((sorted.length-1)*p)]??null}
function interval(scores:number[]){const random=botRandom(200201);const sampled=Array.from({length:2000},()=>scores.reduce(sum=>sum+scores[Math.floor(random()*scores.length)],0)/scores.length);return [quantile(sampled,0.025),quantile(sampled,0.975)]}
function report(){
 const comparisons=matchups.map(([a,b])=>{const rows=records.filter(r=>r.algorithms[0]===a&&r.algorithms[1]===b),grouped=new Map<number,number[]>();for(const r of rows){const xs=grouped.get(r.pair)??[];xs.push(r.score);grouped.set(r.pair,xs)}const scores=[...grouped.values()].filter(xs=>xs.length===2).map(xs=>(xs[0]+xs[1])/2);return {challenger:a,opponent:b,pairs:scores.length,games:rows.length,wins:rows.filter(r=>r.score===1).length,losses:rows.filter(r=>r.score===0).length,draws:rows.filter(r=>r.score===0.5).length,scoreRate:rows.length?rows.reduce((v,r)=>v+r.score,0)/rows.length:null,pairedBootstrap95:scores.length?interval(scores):null,firstPlayer:rows.filter(r=>r.challengerFirst).map(r=>r.score),secondPlayer:rows.filter(r=>!r.challengerFirst).map(r=>r.score),styles:Object.fromEntries(['aggressive','control','growth'].map(style=>{const rs=rows.filter(r=>r.style===style);return [style,{games:rs.length,scoreRate:rs.length?rs.reduce((v,r)=>v+r.score,0)/rs.length:null}]}))}});
 const data={schemaVersion:1,implementationHash,botVersion:BOT_VERSION,battleRulesVersion:'2.0.0',offerCompilerVersion:'2.1.0',generatedAt:new Date().toISOString(),environment:{node:process.version,platform:process.platform,arch:process.arch},command:process.argv.slice(1),method:(asymmetric?'Asymmetric exploratory loadouts. ':'Mirrored loadouts and education within each pair; varied across pairs. ')+'Same legal initialization seed and loadouts twice; exchange algorithm seats, never mutate firstPlayerId or dealt state. 2000-resample paired-cluster bootstrap. Deterministic production node budgets, time guard disabled for reproducibility.',status:records.length===pairs*2?'completed':'running',requestedPairs:pairs,startPair,samples:{timings,nodes},completedGames:records.length,elapsedSeconds:(performance.now()-begin)/1000,educationCombinationCoverage:new Set(records.map(r=>r.education)).size,allReplaysMatch:records.every(r=>r.replayVerified),comparisons,metrics:Object.fromEntries(Object.entries(metrics).map(([id,m])=>[id,{...m,thinkMs:{p50:quantile(timings[id]??[],.5),p95:quantile(timings[id]??[],.95)},nodes:{p50:quantile(nodes[id]??[],.5),p95:quantile(nodes[id]??[],.95)},fallbackRate:m.fallbacks/m.decisions}])),targets:{hardVsLegacy:.7,expertVsNormal:.6},limits:['Runtime timings are this Node host, not mobile/browser UI measurements.','Missed multi-command certain lethal has no exhaustive oracle; only public immediate-win opportunities are measured.','Confidence intervals are based on paired seed/loadout groups, not independent games.'],records};
 mkdirSync(output.split('/').slice(0,-1).join('/')||'.',{recursive:true});writeFileSync(output,JSON.stringify(data,null,2));return data;
}
for(let offset=0;offset<pairs;offset++){
 const pair=startPair+offset;
 const algorithms=matchups[pair%matchups.length],style=(['aggressive','control','growth'] as BotStyle[])[Math.floor(pair/matchups.length)%3],combo=pair%110;
 const a=defaultLoadout('a','甲',pair%10),b=defaultLoadout('b','乙',(pair*7+3)%10);a.primaryId=education.primary[Math.floor(combo/11)].id;a.secondaryId=education.secondary[combo%11].id;
 if(!asymmetric)Object.assign(b,structuredClone({...a,playerId:'b',name:'乙'}));
 const loadouts:[Loadout,Loadout]=[a,b],seed=(seedBase+104729*(pair+1))>>>0;
 for(let swap=0;swap<2;swap++){
  let state=createMatch(loadouts,seed,{matchId:`benchmark-${pair}-${swap}`});const initial=structuredClone(state),journal:{actorId:string;command:Command}[]=[],knowledge:Record<string,BotKnowledge>={};
  for(let step=0;!state.result&&step<600;step++){
   const actorId=state.phase==='flex'?state.players.find(p=>!p.flexReady)!.id:state.phase==='mulligan'?state.players.find(p=>!p.mulliganReady)!.id:state.pendingChoice?.ownerId??state.activePlayerId;
   const playerIndex=actorId==='a'?0:1,algorithm=algorithms[(playerIndex+swap)%2],m=recordMetric(algorithm),view=getView(state,actorId);knowledge[actorId]=updateBotKnowledge(knowledge[actorId]??createBotKnowledge(view,loadouts[playerIndex]),view);
   let command:Command;const started=performance.now();
   if(algorithm==='legacy'){command=view.phase==='flex'?{type:'SELECT_FLEX',flexIds:loadouts[playerIndex].flexDeck}:view.phase==='mulligan'?{type:'MULLIGAN',cardIds:[]}:chooseLegacyBotCommand(view,style)}
   else{const d=decideBotCommand({view,knowledge:knowledge[actorId],difficulty:algorithm,style,botSeed:(0x98cd123+pair*997+playerIndex*37+state.version)>>>0,requestId:`bench-${pair}-${swap}-${step}`,budget:{maxMs:Infinity}});command=d.command;(nodes[algorithm]??=[]).push(d.nodesVisited);if(d.fallbackReason)m.fallbacks++;if(d.fallbackReason==='time')m.timeouts++}
   (timings[algorithm]??=[]).push(performance.now()-started);m.decisions++;if(command.type==='USE_PRIMARY'||command.type==='USE_SECONDARY')m.skills++;
   const result=applyCommand(state,actorId,command);if(result.error){m.illegal++;throw Error(`${algorithm} pair${pair} ${result.error}`)}
   if(state.phase==='playing'&&!state.players.find(p=>p.id!==actorId)!.retort){
    const publicActions=view.legalActions.filter(c=>c.type==='ATTACK'||(c.type==='PLAY_CARD'&&view.players[playerIndex].hand.find(h=>h.id===c.cardId)?.definitionId==='N22'));
    const immediate=publicActions.some(c=>applyCommand(state,actorId,c).state.result?.winnerId===actorId);
    if(immediate){m.immediatePublicWinOpportunities++;if(result.state.result?.winnerId!==actorId)m.missedImmediatePublicWin++}
    if(result.state.result?.winnerId&&result.state.result.winnerId!==actorId&&view.legalActions.some(c=>!applyCommand(state,actorId,c).state.result))m.immediateSelfLoss++;
   }
   knowledge[actorId]=updateBotKnowledge(knowledge[actorId],view,command);state=result.state;journal.push({actorId,command});
  }
  if(!state.result)throw Error(`pair ${pair} exceeded 600 commands`);
  let replay=initial;for(const entry of journal){const result=applyCommand(replay,entry.actorId,entry.command);if(result.error)throw Error('Replay illegal');replay=result.state}
  const replayVerified=stableHash(replay)===stableHash(state);if(!replayVerified)throw Error('Replay mismatch');
  const challengerId=swap===0?'a':'b',score=state.result.winnerId===challengerId?1:state.result.winnerId===null?.5:0;
  records.push({pair,swap,seed,algorithms,style,education:`${a.primaryId}/${a.secondaryId}`,challengerFirst:state.firstPlayerId===challengerId,firstPlayerId:state.firstPlayerId,winnerId:state.result.winnerId,score,round:state.round,commands:journal.length,replayVerified,stateHash:stableHash(state)});
 }
 if((offset+1)%5===0||offset+1===pairs){const r=report();console.log(`${offset+1}/${pairs} pairs, ${r.completedGames} games, ${(r.elapsedSeconds).toFixed(1)}s`)}
}
