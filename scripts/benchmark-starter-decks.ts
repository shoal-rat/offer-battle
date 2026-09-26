/** Small paired pilot of authored starting decks; not an optimal-deck or global-balance proof. */
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
import {getStarterDecks} from '../src/game/starterDecks';
import {createMatch,applyCommand,getView,stableHash,decideBotCommand,createBotKnowledge,updateBotKnowledge,BOT_VERSION} from '../src/game/index';
import {botRandom} from '../src/game/ai/belief';
import type {BotKnowledge,BotStyle} from '../src/game/ai';
import type {Command,Loadout} from '../src/game/types';
const arg=(key:string,fallback:string)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1]};
const seeds=Number(arg('--seeds','4')),seedBase=Number(arg('--seed','27092621')),output=arg('--output','reports/starter-decks-pilot.json');
if(!Number.isInteger(seeds)||seeds<1||seeds>20)throw Error('--seeds must be 1..20');
const styleOption=arg('--style','control');if(!['control','aggressive','growth','mixed'].includes(styleOption))throw Error('--style must be control, aggressive, growth or mixed');
const decks=getStarterDecks(true),records:{pair:number;seed:number;swap:number;style:BotStyle;left:number;right:number;first:number;winner:number|null;round:number;commands:number;replayVerified:boolean;stateHash:string}[]=[];
const timings:number[]=[],nodeCounts:number[]=[],start=performance.now();let errors=0;
const definitionHash=createHash('sha256').update(readFileSync('src/game/starterDecks.ts')).digest('hex');
const label=(i:number)=>i===5?'预设6（需解锁）':`预设${i+1} · ${decks[i].title}`;
const quantile=(xs:number[],q:number)=>[...xs].sort((a,b)=>a-b)[Math.floor((xs.length-1)*q)]??null;
function summary(){
 const rows=decks.map((deck,index)=>{
  const games=records.filter(r=>r.left===index||r.right===index),score=(r:typeof records[number])=>r.winner===index?1:r.winner===null?.5:0;
  const clusters=new Map<number,number[]>();for(const r of games){const values=clusters.get(r.pair)??[];values.push(score(r));clusters.set(r.pair,values)}
  const complete=[...clusters.values()].filter(x=>x.length===2).map(x=>(x[0]+x[1])/2),random=botRandom(612301+index);
  const bootstrap=complete.length?Array.from({length:2000},()=>complete.reduce(sum=>sum+complete[Math.floor(random()*complete.length)],0)/complete.length):[];
  const group=(rs:typeof games)=>({games:rs.length,wins:rs.filter(r=>r.winner===index).length,losses:rs.filter(r=>r.winner!==null&&r.winner!==index).length,draws:rs.filter(r=>r.winner===null).length,scoreRate:rs.length?rs.reduce((v,r)=>v+score(r),0)/rs.length:null});
  return {id:deck.id,label:label(index),...group(games),styles:Object.fromEntries(['control','aggressive','growth'].map(style=>[style,group(games.filter(r=>r.style===style))])),pairedBootstrap95:bootstrap.length?[quantile(bootstrap,.025),quantile(bootstrap,.975)]:null,first:group(games.filter(r=>r.first===index)),second:group(games.filter(r=>r.first!==index)),opponents:decks.flatMap((d,j)=>j===index?[]:[{id:d.id,label:label(j),...group(games.filter(r=>r.left===j||r.right===j))}])};
 });
 const data={schemaVersion:1,kind:'starter-deck-paired-pilot',generatedAt:new Date().toISOString(),definitionHash,botVersion:BOT_VERSION,battleRulesVersion:'2.0.0',offerCompilerVersion:'2.1.0',status:records.length===30*seeds?'completed':'running',requestedGames:30*seeds,completedGames:records.length,seedBase,seedsPerMatchup:seeds,command:['npx','tsx','scripts/benchmark-starter-decks.ts','--seeds',String(seeds),'--seed',String(seedBase),'--style',styleOption],styleOption,environment:{node:process.version,platform:process.platform,arch:process.arch},method:'All 15 pairings; same initialization seed twice while swapping whole preset loadouts between seats. Both use the same normal difficulty and selected style in each pair, with the production node budget, with wall-clock guard disabled for reproducibility. Full setup uses each preset default flex; normal AI chooses mulligan. Never changes firstPlayerId or any rule stat. 2000-resample seed/opponent pair-cluster bootstrap.',elapsedSeconds:(performance.now()-start)/1000,illegalCommands:errors,allReplaysMatch:records.every(r=>r.replayVerified),decisions:{count:timings.length,p95Ms:quantile(timings,.95),p95Nodes:quantile(nodeCounts,.95)},decks:rows,limits:['A small pilot among these six starting decks is not proof of global balance or that no stronger deck exists.','Both players use the same normal policy/style within each pair; style breakdown is reported. Human choices and improved builds can change rankings.','Confidence intervals treat both seats of the same seed/opponent as one cluster; sample size is still small.','Runtime timing is local Node computation, not browser/mobile performance.','The optional sixth preset is only identified by a neutral label in this public report.'],records};
 mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(data,null,2)+'\n');return data;
}
let pair=0;
for(let left=0;left<decks.length;left++)for(let right=left+1;right<decks.length;right++)for(let sample=0;sample<seeds;sample++,pair++){
 const seed=(seedBase+104729*(pair+1))>>>0,style=(styleOption==='mixed'?(['control','aggressive','growth'] as const)[pair%3]:styleOption) as BotStyle;
 for(let swap=0;swap<2;swap++){
  const indices=swap?[right,left]:[left,right],loadouts=indices.map((n,i)=>({...structuredClone(decks[n].loadout),playerId:i?'b':'a',name:i?'乙':'甲'})) as [Loadout,Loadout];
  let state=createMatch(loadouts,seed,{matchId:`starter-pilot-${pair}-${swap}`});const initial=structuredClone(state),journal:{actorId:string;command:Command}[]=[],knowledge:Record<string,BotKnowledge>={};
  for(let step=0;!state.result&&step<600;step++){
   const actorId=state.phase==='flex'?state.players.find(p=>!p.flexReady)!.id:state.phase==='mulligan'?state.players.find(p=>!p.mulliganReady)!.id:state.pendingChoice?.ownerId??state.activePlayerId,index=actorId==='a'?0:1,view=getView(state,actorId);
   knowledge[actorId]=updateBotKnowledge(knowledge[actorId]??createBotKnowledge(view,loadouts[index]),view);let command:Command;
   if(state.phase==='flex')command={type:'SELECT_FLEX',flexIds:loadouts[index].flexDeck};
   else{const began=performance.now(),decision=decideBotCommand({view,knowledge:knowledge[actorId],difficulty:'normal',style,botSeed:(1234567+pair*997+index*37+state.version)>>>0,requestId:`pilot-${pair}-${swap}-${step}`,budget:{maxMs:Infinity}});command=decision.command;timings.push(performance.now()-began);nodeCounts.push(decision.nodesVisited)}
   const next=applyCommand(state,actorId,command);if(next.error){errors++;summary();throw Error(`Preset pair ${pair} illegal command: ${next.error}`)}
   knowledge[actorId]=updateBotKnowledge(knowledge[actorId],view,command);journal.push({actorId,command});state=next.state;
  }
  if(!state.result){summary();throw Error(`Preset pair ${pair} exceeded command cap`)}
  let replay=initial;for(const e of journal){const next=applyCommand(replay,e.actorId,e.command);if(next.error)throw Error('Replay command rejected');replay=next.state}
  const replayVerified=stableHash(replay)===stableHash(state);if(!replayVerified)throw Error('Replay hash mismatch');
  records.push({pair,seed,swap,style,left,right,first:indices[state.firstPlayerId==='a'?0:1],winner:state.result.winnerId===null?null:indices[state.result.winnerId==='a'?0:1],round:state.round,commands:journal.length,replayVerified,stateHash:stableHash(state)});
 }
 const report=summary();console.log(`${report.completedGames}/${report.requestedGames} games · ${report.elapsedSeconds.toFixed(1)} s`);
}
