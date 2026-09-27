import { applyCommand, canAttack, handCost, offerCost } from '../../engine';
import { candidateActions, getView } from '../../views';
import { education } from '../../catalog';
import type { Command, MatchState } from '../../types';
import type { SearchBudget, BotDifficulty } from '../types';
/** The 2.2.0 production budgets, frozen with the algorithm. */
const BOT_BUDGETS:Record<BotDifficulty,SearchBudget>={easy:{beamWidth:4,maxNodes:80,maxMs:40,maxDepth:2,samples:1,responseDepth:0},normal:{beamWidth:8,maxNodes:300,maxMs:100,maxDepth:6,samples:1,responseDepth:0},hard:{beamWidth:16,maxNodes:1500,maxMs:300,maxDepth:6,samples:1,responseDepth:3},expert:{beamWidth:32,maxNodes:5000,maxMs:800,maxDepth:8,samples:4,responseDepth:4}};
const BOT_VERSION='2.2.0';
import { botRandom, sampleObservation, stateKey, possibleRetorts } from '../belief';
import { cardValue, evaluateState, WIN } from './evaluate-2-2';
import { setupScore } from '../setup';
import { updateBotKnowledge } from '../knowledge';
import type { BotDecision, BotDecisionRequest } from '../types';

interface Node {states:MatchState[];path:Command[];score:number;boundary:boolean}
/** Cheap rejection only. Every remaining transition is settled once by the rule engine. */
function candidates(s:MatchState,id:string):Command[] {
  const p=s.players.find(p=>p.id===id)!;
  return candidateActions(s,id).filter(c=>{
    if(c.type==='PLAY_CARD'){const h=p.hand.find(h=>h.id===c.cardId);return !!h&&handCost(p,h)<=p.timeRemaining}
    if(c.type==='DEPLOY_OFFER'){const o=p.offerZone.find(o=>o.id===c.offerId);return !!o&&p.board.length<4&&offerCost(p,o)<=p.timeRemaining}
    if(c.type==='NEGOTIATE'){const o=p.offerZone.find(o=>o.id===c.offerId);return !!o&&p.board.length<4&&Math.max(1,offerCost(p,o)-Math.floor((p.offerZone.find(x=>x.id===c.sacrificeId)?.definition.originalTime??0)/2))<=p.timeRemaining}
    if(c.type==='ATTACK'){const u=p.board.find(u=>u.id===c.cardId);return !!u&&canAttack(s,u,c.targetId!==undefined&&s.players.some(p=>p.id===c.targetId))}
    if(c.type==='USE_PRIMARY'||c.type==='USE_SECONDARY'){
      if(p.education.usedThisOwnTurn)return false;
      if(c.type==='USE_SECONDARY'&&(s.round<4||p.education.secondaryUsed))return false;
      const def=(c.type==='USE_PRIMARY'?education.primary:education.secondary).find(e=>e.id===(c.type==='USE_PRIMARY'?p.education.primaryId:p.education.secondaryId));
      return !!def&&def.time_cost<=p.timeRemaining;
    }
    return true;
  });
}
const aggregate=(values:number[])=>values.reduce((a,b)=>a+b,0)/values.length*0.7+Math.min(...values)*0.3;
/** Frozen 2.2.0 search. Benchmarks only; production uses ../search.ts. */
export function decideBotCommandV22(request:BotDecisionRequest):BotDecision {
  const started=performance.now(),{view,style,difficulty}=request;
  const budget={...BOT_BUDGETS[difficulty],...request.budget};
  const knowledge=updateBotKnowledge(request.knowledge,view);
  let nodes=0,reason:BotDecision['fallbackReason'];
  const remaining=()=>{
    if(nodes>=budget.maxNodes){reason='nodes';return false}
    if(performance.now()-started>=budget.maxMs){reason='time';return false}
    return true;
  };
  const settle=(s:MatchState,actor:string,c:Command)=>{if(!remaining())return undefined;nodes++;const r=applyCommand({...s,events:[],processedCommandIds:[]},actor,c);return r.error?undefined:r};
  const legal=view.legalActions;
  let best:Node={states:[],path:[legal.find(c=>c.type==='END_TURN')??legal[0]??{type:'END_TURN'}],score:-Infinity,boundary:true};
  const finish=(code:string):BotDecision=>({command:best.path[0],matchId:view.matchId,stateVersion:view.version,requestId:request.requestId,botVersion:BOT_VERSION,reasonCode:reason?'BUDGET_FALLBACK':code,nodesVisited:nodes,elapsedMs:performance.now()-started,fallbackReason:reason,principalVariation:best.path,sampleCount:best.states.length||1});
  if(view.phase==='flex'||view.phase==='mulligan'){
    best.path=[legal.slice().sort((a,b)=>setupScore(view,b,style)-setupScore(view,a,style))[0]??best.path[0]];
    return finish(view.phase==='flex'?'PUBLIC_OFFER_COUNTERS':'OPENING_CURVE');
  }
  if(!legal.length)return finish('NO_ACTION');
  const covered=!!view.players.find(p=>p.id!==view.selfId)?.retort;
  // All three possible retorts are represented before claiming a covered lethal.
  const count=covered?Math.max(possibleRetorts(view).length,budget.samples):budget.samples;
  const initial=Array.from({length:count},(_,i)=>sampleObservation(view,knowledge,request.botSeed,i));
  let beam:Node[]=[{states:initial,path:[],score:evaluateState(initial[0],view.selfId,style),boundary:false}],leaves:Node[]=[];
  let avoidedLoss=false;const rootNodes:Node[]=[];
  const isSafe=(n:Node)=>n.states.every(s=>!s.result||s.result.winnerId===null||s.result.winnerId===view.selfId);
  const cache=new Map<string,ReturnType<typeof applyCommand>>();
  const transition=(node:Node,c:Command):Node|undefined=>{
    const states:MatchState[]=[],values:number[]=[];let boundary=c.type==='END_TURN';
    for(const state of node.states){
      const key=stateKey(state)+JSON.stringify(c);let r=cache.get(key);
      if(!r){r=settle(state,view.selfId,c);if(r)cache.set(key,r)}
      if(!r)return;
      states.push(r.state);values.push(evaluateState(r.state,view.selfId,style));
      // Replan after newly revealed/drawn identities, returned cards and choices.
      if(r.events.some(e=>['draw','retort','reveal','bounce'].includes(e.type))||r.state.pendingChoice)boundary=true;
      if(c.type==='RESOLVE_CHOICE'&&view.pendingChoice?.kind==='scry'){
        const p=r.state.players.find(p=>p.id===view.selfId)!;
        if(p.deck[0])values[values.length-1]+=cardValue(r.state,p,p.deck[0])*0.6;
      }
      if(r.state.result)boundary=true;
    }
    return {states,path:[...node.path,c],score:aggregate(values),boundary};
  };
  const searchCap=Math.floor(budget.maxNodes*(budget.responseDepth?0.6:0.9));
  for(let depth=0;depth<budget.maxDepth&&beam.length&&remaining()&&nodes<searchCap;depth++){
    const next:Node[]=[],seen=new Set<string>();
    for(const node of beam){
      const commands=depth===0?legal:candidates(node.states[0],view.selfId);
      for(const command of commands){
        if(!remaining()||nodes>=searchCap)break;
        const child=transition(node,command);if(!child)continue;
        if(depth===0)rootNodes.push({...child});
        if(depth===0&&child.states.some(s=>s.result&&s.result.winnerId!==null&&s.result.winnerId!==view.selfId))avoidedLoss=true;
        if(child.states.every(s=>s.result?.winnerId===view.selfId)){best=child;return finish(child.path.length>1?'LETHAL_COMBO':'IMMEDIATE_WIN')}
        if(child.score>best.score||(child.score===best.score&&child.path.length<best.path.length))best=child;
        if(child.boundary){leaves.push(child);continue}
        const key=child.states.map(stateKey).join('|');if(seen.has(key))continue;seen.add(key);next.push(child);
      }
    }
    next.sort((a,b)=>b.score-a.score);
    // Preserve root diversity: a tactical target family cannot consume the whole beam.
    const roots=new Set<string>(),diverse:Node[]=[];
    for(const n of next){const k=JSON.stringify(n.path[0]);if(!roots.has(k)){roots.add(k);diverse.push(n)}}
    beam=[...diverse.slice(0,Math.ceil(budget.beamWidth/2)),...next.filter(n=>!diverse.slice(0,Math.ceil(budget.beamWidth/2)).includes(n))].slice(0,budget.beamWidth);
  }
  // Evaluate actual end-of-turn effects even for a depth-limited unfinished line.
  for(const node of beam){if(!remaining())break;const end=transition(node,{type:'END_TURN'});if(end)leaves.push(end)}
  // Information boundaries are valid leaves too: discarding them would suppress
  // all draw, return and reveal cards regardless of their actual value.
  const completed=leaves;
  if(completed.length&&remaining()){
    completed.sort((a,b)=>b.score-a.score);
    const finalists=completed.slice(0,Math.min(6,budget.beamWidth));
    // Compare every finalist at the same turn boundary. For a reveal/draw leaf,
    // this is valuation only: the recorded variation still stops at the reveal.
    // Choices use their stable first option, never a pre-reveal identity oracle.
    for(const n of finalists){
      const settled:MatchState[]=[];
      for(let s of n.states){
        if(!s.result&&s.activePlayerId===view.selfId){
          for(let i=0;i<2&&s.pendingChoice&&remaining();i++){
            const option=s.pendingChoice.options[0];if(!option)break;
            const r=settle(s,view.selfId,{type:'RESOLVE_CHOICE',choiceId:s.pendingChoice.id,optionId:option.id});if(!r)break;s=r.state;
          }
          if(!s.pendingChoice){const r=settle(s,view.selfId,{type:'END_TURN'});if(r)s=r.state}
        }
        settled.push(s);
      }
      n.states=settled;n.score=aggregate(settled.map(s=>evaluateState(s,view.selfId,style)));
    }
    finalists.sort((a,b)=>b.score-a.score);
    if(budget.responseDepth){
      let responseIndex=0;const responseStart=nodes;
      for(const n of finalists){
        const responseCap=responseStart+Math.floor((budget.maxNodes-responseStart)*(++responseIndex)/finalists.length);
        const values:number[]=[];
        for(const leaf of n.states){
          let s=leaf;const enemyId=s.players.find(p=>p.id!==view.selfId)!.id;
          // Opponent policy is rebuilt from its own observation, hiding our hand.
          // Hard considers only publicly known enemy cards; expert samples the rest.
          const known=new Set(view.players.find(p=>p.id===enemyId)!.knownHand.map(c=>c.id));
          for(let d=0;d<budget.responseDepth&&!s.result&&s.activePlayerId===enemyId&&remaining()&&nodes<responseCap;d++){
            const ev=getView(s,enemyId,false),masked=sampleObservation(ev,undefined,request.botSeed+77+d);
            if(difficulty==='hard')masked.players.find(p=>p.id===enemyId)!.hand=masked.players.find(p=>p.id===enemyId)!.hand.filter(c=>known.has(c.id));
            let reply:Command={type:'END_TURN'},score=-Infinity;
            for(const c of candidates(masked,enemyId)){
              if(nodes>=responseCap)break;
              const r=settle(masked,enemyId,c);if(!r)continue;
              const value=evaluateState(r.state,enemyId,'control');if(value>score){score=value;reply=c}
            }
            const actual=settle(s,enemyId,reply);if(!actual)break;s=actual.state;
            if(actual.events.some(e=>['draw','reveal','retort'].includes(e.type)))break;
          }
          // Starting our next turn settles notice, age, recovery and fatigue.
          if(!s.result&&s.activePlayerId===enemyId){const r=settle(s,enemyId,{type:'END_TURN'});if(r)s=r.state}
          values.push(evaluateState(s,view.selfId,style));
        }
        n.score=aggregate(values);
      }
      finalists.sort((a,b)=>b.score-a.score);best=finalists[0];
    }else best=finalists[0];
  }
  const safeRoots=rootNodes.filter(isSafe);
  if(safeRoots.length&&!safeRoots.some(n=>JSON.stringify(n.path[0])===JSON.stringify(best.path[0]))){best=safeRoots.sort((a,b)=>b.score-a.score)[0];avoidedLoss=true}
  if(difficulty==='easy'&&botRandom(request.botSeed)()<0.1){const safe=leaves.filter(n=>n.score>=best.score-1&&n.states.every(s=>!s.result||s.result.winnerId===view.selfId)&&safeRoots.some(root=>JSON.stringify(root.path[0])===JSON.stringify(n.path[0])));if(safe.length>1)best=safe[Math.floor(botRandom(request.botSeed+1)()*safe.length)]}
  const first=best.path[0];
  return finish(avoidedLoss?'AVOID_IMMEDIATE_LOSS':view.round===12?'ROUND12_MIND_ADVANTAGE':first.type==='NEGOTIATE'?'TEMPO_NEGOTIATION':first.type==='DEPLOY_OFFER'?'ENTER_EFFECT_VALUE':budget.responseDepth?'RESPONSE_SEARCH':'TURN_PLAN');
}
