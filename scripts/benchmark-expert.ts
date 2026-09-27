/** Head-to-head check for a bot upgrade: the current production difficulty against the frozen 2.2.0 reference.
 * Mirrored loadouts per pair (drawn from the practice-opponent templates), seats exchanged, fixed node budgets.
 * Usage: npx tsx scripts/benchmark-expert.ts --pairs 40 --shard 0 --shards 8 --output work/bench/expert-0.json */
import {writeFileSync,mkdirSync} from 'node:fs';
import {createMatch,applyCommand,getView,decideBotCommand,createBotKnowledge,updateBotKnowledge} from '../src/game/index';
import {decideBotCommandV22} from '../src/game/ai/reference/search-2-2';
import {botOpponent,type BotStrategy} from '../src/game/botOpponents';
import type {BotDifficulty,BotKnowledge} from '../src/game/ai';
import type {Command,Loadout} from '../src/game/types';

const arg=(name:string,fallback:string)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1]};
const pairs=Number(arg('--pairs','20')),shard=Number(arg('--shard','0')),shards=Number(arg('--shards','1'));
const difficulty=arg('--difficulty','expert') as BotDifficulty,reference=arg('--reference','expert') as BotDifficulty;
const output=arg('--output',`work/bench/${difficulty}-vs-v22-${shard}.json`),seedBase=Number(arg('--seed','20260928'));
const styles:BotStrategy[]=['aggressive','control','growth'];
const records:{pair:number;swap:number;style:string;score:number;round:number;challengerFirst:boolean}[]=[];
const think={challenger:[] as number[],reference:[] as number[]};
for(let pair=shard;pair<pairs;pair+=shards){
 const style=styles[pair%3],seed=(seedBase+104729*(pair+1))>>>0;
 const base=botOpponent(styles[(pair*7+1)%3],seed^0x5bd1e995).loadout;
 const loadouts:[Loadout,Loadout]=[{...structuredClone(base),playerId:'a',name:'甲'},{...structuredClone(base),playerId:'b',name:'乙'}];
 for(let swap=0;swap<2;swap++){
  let state=createMatch(loadouts,seed,{matchId:`duel-${pair}-${swap}`});const knowledge:Record<string,BotKnowledge>={};
  const challengerId=swap===0?'a':'b';
  for(let step=0;!state.result&&step<700;step++){
   const actorId=state.phase==='flex'?state.players.find(p=>!p.flexReady)!.id:state.phase==='mulligan'?state.players.find(p=>!p.mulliganReady)!.id:state.pendingChoice?.ownerId??state.activePlayerId;
   const playerIndex=actorId==='a'?0:1,view=getView(state,actorId);
   knowledge[actorId]=updateBotKnowledge(knowledge[actorId]??createBotKnowledge(view,loadouts[playerIndex]),view);
   const request={view,knowledge:knowledge[actorId],style,botSeed:(0x98cd123+pair*997+playerIndex*37+state.version)>>>0,requestId:`duel-${pair}-${swap}-${step}`,budget:{maxMs:Infinity}};
   const started=performance.now();
   const challenger=actorId===challengerId;
   const decision=challenger?decideBotCommand({...request,difficulty}):decideBotCommandV22({...request,difficulty:reference});
   (challenger?think.challenger:think.reference).push(performance.now()-started);
   const command:Command=decision.command,result=applyCommand(state,actorId,command);
   if(result.error)throw Error(`${challenger?'challenger':'reference'} illegal at pair ${pair}: ${result.error}`);
   knowledge[actorId]=updateBotKnowledge(knowledge[actorId],view,command);state=result.state;
  }
  if(!state.result)throw Error(`pair ${pair} exceeded 700 commands`);
  const score=state.result.winnerId===challengerId?1:state.result.winnerId===null?.5:0;
  records.push({pair,swap,style,score,round:state.round,challengerFirst:state.firstPlayerId===challengerId});
  console.log(`shard ${shard} pair ${pair} swap ${swap}: ${score} (round ${state.round})`);
 }
}
const q=(xs:number[],p:number)=>{const s=[...xs].sort((a,b)=>a-b);return s[Math.floor((s.length-1)*p)]??null};
mkdirSync(output.split('/').slice(0,-1).join('/')||'.',{recursive:true});
writeFileSync(output,JSON.stringify({difficulty,reference,pairs,shard,shards,records,thinkMs:{challenger:{p50:q(think.challenger,.5),p95:q(think.challenger,.95)},reference:{p50:q(think.reference,.5),p95:q(think.reference,.95)}}},null,1));
