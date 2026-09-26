import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getStarterDecks} from '../src/game/starterDecks';
import {exampleOffers,validateLoadout} from '../src/game/offers';
import {cardById} from '../src/game/catalog';
import {createMatch,applyCommand,getView,chooseLegacyBotCommand,stableHash} from '../src/game/index';
import type {Command} from '../src/game/types';

test('public starter selection has five complete exact education pairs and gates the sixth',()=>{
 const visible=getStarterDecks(false),all=getStarterDecks(true);
 assert.equal(visible.length,5);assert.equal(all.length,6);
 assert.deepEqual(visible.map(d=>[d.primaryId,d.secondaryId]),[['H05','S05'],['H05','S03'],['H04','S04'],['H03','S03'],['H01','S01']]);
 assert.deepEqual([all[5].primaryId,all[5].secondaryId],['H10','S07']);
 assert.ok(!JSON.stringify(visible).includes(all[5].id));assert.equal(new Set(all.map(d=>d.id)).size,6);
});
test('every starter is an ordinary legal complete deck with public cards and explicit tradeoffs',()=>{
 for(const d of getStarterDecks(true)){
  assert.doesNotThrow(()=>validateLoadout(d.loadout));assert.equal(d.loadout.offers.length,3);assert.equal(d.loadout.baseDeck.length,12);assert.equal(d.loadout.flexDeck.length,3);
  assert.equal(new Set(d.loadout.offers.map(o=>o.id)).size,3);assert.equal(new Set(d.loadout.flexDeck).size,3);
  for(const o of d.loadout.offers)assert.deepEqual(o,exampleOffers.find(p=>p.id===o.id));
  for(const id of new Set(d.loadout.baseDeck)){assert.ok(id.startsWith('N'));assert.ok(d.loadout.baseDeck.filter(c=>c===id).length<=2)}
  assert.ok(d.loadout.baseDeck.filter(id=>cardById[id].time_cost<=2).length>=5);
  assert.ok(d.description.length>20);assert.ok(d.strengths.length>=2);assert.ok(d.weakness.length>20);
 }
});
test('editing returned arrays and definitions cannot mutate another starter or the public catalog',()=>{
 const before=getStarterDecks(true),edited=getStarterDecks(true);edited[0].loadout.offers[0].baseAttack=999;edited[0].loadout.baseDeck.pop();edited[0].strengths.push('changed');
 assert.deepEqual(getStarterDecks(true),before);assert.ok(exampleOffers.every(o=>o.baseAttack<999));
});
test('all six starters can finish legal ordinary games and replay exactly without extra rules',()=>{
 const decks=getStarterDecks(true);
 for(let n=0;n<decks.length;n++){
  const a=structuredClone(decks[n].loadout),b=structuredClone(decks[(n+1)%decks.length].loadout);a.playerId='a';b.playerId='b';
  let state=createMatch([a,b],510+n,{skipSetup:true,matchId:`starter-regression-${n}`});const initial=structuredClone(state),journal:{actorId:string;command:Command}[]=[];
  for(let step=0;!state.result&&step<600;step++){const actorId=state.pendingChoice?.ownerId??state.activePlayerId,command=chooseLegacyBotCommand(getView(state,actorId),'control'),next=applyCommand(state,actorId,command);assert.equal(next.error,undefined);journal.push({actorId,command});state=next.state}
  assert.ok(state.result);let replay=initial;for(const e of journal){const next=applyCommand(replay,e.actorId,e.command);assert.equal(next.error,undefined);replay=next.state}assert.equal(stableHash(replay),stableHash(state));
 }
});
