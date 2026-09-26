import type { HandCard, MatchState, MatchView, PlayerState, Unit } from '../types';
import type { BotKnowledge } from './types';
export function botRandom(seed:number):()=>number {let x=seed>>>0||1;return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296}}
const card=(id:string,definitionId:string):HandCard=>({id,definitionId,kind:'card',taxes:[],knownTo:[]});
export function possibleRetorts(view:MatchView):string[] {
  const enemy=view.players.find(p=>p.id!==view.selfId)!;
  const publicIds=[...enemy.discard,...enemy.knownHand].map(c=>c.definitionId);
  return ['F06','F04','N23'].filter(id=>publicIds.filter(x=>x===id).length<(id==='N23'?2:1));
}
/** Rebuild exclusively from an observation, never from a MatchState or battle RNG. */
export function sampleObservation(view:MatchView,knowledge:BotKnowledge|undefined,seed:number,sampleIndex=0):MatchState {
  const random=botRandom(seed+sampleIndex*104729),take=(pool:string[])=>pool.splice(Math.floor(random()*pool.length),1)[0]??'N01';
  const players:PlayerState[]=view.players.map(v=>{
    const self=v.id===view.selfId;
    const hand=structuredClone(self?v.hand:v.knownHand) as HandCard[];
    const board:Unit[]=v.board.map(u=>{
      const {attack,health,maxHealth,age,canAttack,canAttackHero,...unit}=structuredClone(u);
      if(unit.kind==='support')unit.card=card(`backing-${u.id}`,unit.definitionId);
      return unit;
    });
    const revealed=[...v.discard,...hand,...board.flatMap(u=>u.card?[u.card]:[])].map(c=>c.definitionId);
    const knownComposition=self&&knowledge?.ownBaseDeck.length===12;
    const retort=v.retort?card(`retort-${v.id}`,v.retort.definitionId??(possibleRetorts(view)[sampleIndex%Math.max(1,possibleRetorts(view).length)]??'N23')):null;
    const accounted=[...revealed,...(retort?[retort.definitionId]:[])];
    let pool:string[];
    if(knownComposition){
      pool=[...knowledge!.ownBaseDeck,...knowledge!.ownFlexDeck];
      for(const id of accounted){const i=pool.indexOf(id);if(i>=0)pool.splice(i,1)}
    }else{
      const base=Array.from({length:24},(_,i)=>`N${String(i+1).padStart(2,'0')}`).flatMap(id=>[id,id]),flex=['F01','F02','F03','F04','F05','F06'];
      for(const id of accounted){const source=id.startsWith('F')?flex:base,i=source.indexOf(id);if(i>=0)source.splice(i,1)}
      pool=[];
      for(let n=accounted.filter(id=>id.startsWith('N')).length;n<12;n++)pool.push(take(base));
      for(let n=accounted.filter(id=>id.startsWith('F')).length;n<3;n++)pool.push(take(flex));
    }
    // Public choice cards are legally obtained information, including taxed hand cards.
    if(!self&&view.pendingChoice?.kind==='tax')for(const o of view.pendingChoice.options)if(o.card&&!hand.some(c=>c.id===o.card!.id))hand.push(structuredClone(o.card));
    while(hand.length<v.handCount)hand.push(card(`unknown-${v.id}-${hand.length}`,take(pool)));
    const top=self?(knowledge?.knownTop??[]):[];
    const deck:HandCard[]=structuredClone(top).slice(0,v.deckCount);
    for(const c of deck){const i=pool.indexOf(c.definitionId);if(i>=0)pool.splice(i,1)}
    while(deck.length<v.deckCount)deck.push(card(`deck-${v.id}-${deck.length}`,take(pool)));
    return {id:v.id,name:v.name,mind:v.mind,timeRemaining:v.timeRemaining,ownTurn:v.ownTurn,hand,deck,discard:structuredClone(v.discard),offerZone:structuredClone(v.offerZone),board,retort,fatigue:v.fatigue,negotiationUsed:v.negotiationUsed,education:structuredClone(v.education),baseDeck:self?knowledge?.ownBaseDeck??[]:[],flexDeck:self?knowledge?.ownFlexDeck??[]:[],flexReady:v.flexReady,mulliganReady:v.mulliganReady,inactiveTurns:0,actedThisTurn:true};
  });
  return {rulesVersion:view.rulesVersion,matchId:view.matchId,version:view.version,round:view.round,activePlayerId:view.activePlayerId,firstPlayerId:view.firstPlayerId,phase:view.phase,players,topic:view.topic,rngState:(seed+sampleIndex*104729)>>>0||1,nextId:1000000,pendingChoice:structuredClone(view.pendingChoice),events:[],eventSequence:0,result:structuredClone(view.result),processedCommandIds:[]};
}
/** Full rule-state key: no omitted ages, attacks, notices, choices, RNG or deck hypotheses. */
export function stateKey(state:MatchState):string {const {events,eventSequence,processedCommandIds,version,...rules}=state;return JSON.stringify(rules)}
