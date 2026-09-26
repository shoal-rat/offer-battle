import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyCommand,createMatch,defaultLoadout,getView} from '../src/game/index';
import {getStarterDecks} from '../src/game/starterDecks';
import type {MatchState} from '../src/game/types';

function assertPrivateSelection(state:MatchState){
 for(const player of state.players){
  const view=getView(state,player.id),own=view.players.find(p=>p.id===player.id)!,opponent=view.players.find(p=>p.id!==player.id)!;
  assert.deepEqual(own.flexSelection,player.flexDeck);
  assert.equal(Object.hasOwn(opponent,'flexSelection'),false,'opponent selection is omitted, not an empty or redacted list');
  assert.equal(Object.hasOwn(JSON.parse(JSON.stringify(opponent)),'flexSelection'),false);
 }
 const observer=getView(state,'observer',false);
 assert.ok(observer.players.every(p=>!Object.hasOwn(p,'flexSelection')));
}

test('full setup preserves every preset response-card selection only in its owner view',()=>{
 for(const deck of getStarterDecks(true)){
  const own={...deck.loadout,playerId:'a'},opponent=defaultLoadout('b','Other player');
  const state=createMatch([own,opponent],720,{matchId:'flex-selection-privacy'});
  assert.equal(state.phase,'flex');assertPrivateSelection(state);
  assert.deepEqual(getView(state,'a').players[0].flexSelection,deck.loadout.flexDeck);
 }
});

test('confirmed response-card selection survives snapshots and later setup phases without disclosure',()=>{
 let state=createMatch([defaultLoadout('a','First'),defaultLoadout('b','Second')],721);
 const change=applyCommand(state,'a',{type:'SELECT_FLEX',flexIds:['F02','F03','F06']});
 assert.equal(change.error,undefined);state=change.state;
 assert.deepEqual(state.players[0].flexDeck,['F02','F03','F06']);assertPrivateSelection(state);
 const other=applyCommand(state,'b',{type:'SELECT_FLEX',flexIds:['F01','F04','F05']});
 assert.equal(other.error,undefined);state=other.state;
 assert.equal(state.phase,'mulligan');assertPrivateSelection(state);
 for(const id of ['a','b']){const next=applyCommand(state,id,{type:'MULLIGAN',cardIds:[]});assert.equal(next.error,undefined);state=next.state}
 assert.equal(state.phase,'playing');assertPrivateSelection(state);
 assertPrivateSelection(JSON.parse(JSON.stringify(state)));
 const ended=applyCommand(state,'a',{type:'CONCEDE'});assert.equal(ended.error,undefined);assertPrivateSelection(ended.state);
});

test('client mutation of its exposed selection cannot alter authoritative or subsequent views',()=>{
 const state=createMatch([defaultLoadout('a','First'),defaultLoadout('b','Second')],722),before=structuredClone(state.players[0].flexDeck);
 const view=getView(state,'a');view.players[0].flexSelection!.splice(0,3,'F06');
 assert.deepEqual(state.players[0].flexDeck,before);
 assert.deepEqual(getView(state,'a').players[0].flexSelection,before);
 assertPrivateSelection(state);
});
