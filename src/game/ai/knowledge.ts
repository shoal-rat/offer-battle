import type { Command, Loadout, MatchView } from '../types';
import type { BotKnowledge } from './types';
export function createBotKnowledge(view:MatchView,loadout?:Pick<Loadout,'baseDeck'|'flexDeck'>):BotKnowledge {
  return {matchId:view.matchId,ownBaseDeck:[...(loadout?.baseDeck??[])],ownFlexDeck:[...(loadout?.flexDeck??[])],lastVersion:view.version,lastEventSequence:view.events.at(-1)?.sequence??0,knownTop:[],knownEnemyHand:[],publicPlayed:[]};
}
export function updateBotKnowledge(previous:BotKnowledge|undefined,view:MatchView,lastCommand?:Command):BotKnowledge {
  const k=previous?.matchId===view.matchId?structuredClone(previous):createBotKnowledge(view);
  const enemy=view.players.find(p=>p.id!==view.selfId)!;
  // The engine's current knownHand is authoritative: it naturally forgets cards
  // shuffled back by H09 and never promotes a new unknown draw to known.
  k.knownEnemyHand=structuredClone(enemy.knownHand);
  k.publicPlayed=view.events.filter(e=>e.type==='play'||e.type==='discard'||e.type==='retort').flatMap(e=>e.cardId?[e.cardId]:[]);
  if(lastCommand?.type==='SELECT_FLEX')k.ownFlexDeck=[...lastCommand.flexIds!];
  const newEvents=view.events.filter(e=>e.sequence>(k.lastEventSequence??0));
  if(view.version!==k.lastVersion){
    if(!newEvents.length||view.phase!=='playing'||newEvents.some(e=>e.actorId===view.selfId&&e.type==='education'&&e.cardId==='H09'))k.knownTop=[];
    else for(const e of newEvents)if(e.actorId===view.selfId&&e.type==='draw')k.knownTop.shift();
  }
  if(view.pendingChoice?.kind==='scry'||view.pendingChoice?.kind==='consult')k.knownTop=view.pendingChoice.options.flatMap(o=>o.card?[structuredClone(o.card)]:[]);
  if(lastCommand?.type==='RESOLVE_CHOICE'){
    if(view.pendingChoice?.kind==='scry')k.knownTop=k.knownTop.filter(c=>c.id===lastCommand.optionId);
    if(view.pendingChoice?.kind==='consult')k.knownTop=[]; // consult shuffles the remainder
  }
  k.lastVersion=view.version;k.lastEventSequence=view.events.at(-1)?.sequence??k.lastEventSequence;return k;
}
