import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pendingStatDeltas,statSlot} from '../src/components/stat-holds';
import {battlePresentationSettled,resetBattlePresentation,setBattlePresentationBusy} from '../src/motion/presentationGate';
import {LocalBackend} from '../src/local-backend';
import type {BattleCue} from '../src/game/types';

const cue=(sequence:number,changes:BattleCue['changes']):BattleCue=>({id:`c:${sequence}`,sequence,kind:'damage',changes});

test('queued changes add up per displayed number; max-health buffs move the shown health',()=>{
 const deltas=pendingStatDeltas([
  cue(1,[{targetId:'u1',playerId:'a',stat:'health',amount:-3},{targetId:'u2',playerId:'b',stat:'health',amount:-2}]),
  cue(2,[{targetId:'u1',playerId:'a',stat:'maxHealth',amount:2},{targetId:'u1',playerId:'a',stat:'attack',amount:1}]),
  cue(3,[{targetId:'a',playerId:'a',stat:'mind',amount:-1},{targetId:'u2',playerId:'b',stat:'health',amount:2}]),
 ]);
 assert.equal(deltas.get('u1\u0000health'),-1);
 assert.equal(deltas.get('u1\u0000attack'),1);
 assert.equal(deltas.get('a\u0000mind'),-1);
 // A hit and an equal heal cancel out: nothing to hold.
 assert.equal(deltas.has('u2\u0000health'),false);
 assert.equal(statSlot({targetId:'x',playerId:'a',stat:'maxHealth',amount:1}),'health');
});

test('the practice bot waits for the table to settle, but a stuck presentation never blocks it forever',async()=>{
 resetBattlePresentation();
 assert.equal(battlePresentationSettled(),true);
 setBattlePresentationBusy(true);
 assert.equal(battlePresentationSettled(),false);
 assert.equal(battlePresentationSettled(380,0),true);
 setBattlePresentationBusy(false);
 assert.equal(battlePresentationSettled(10_000),false);
 await new Promise(resolve=>setTimeout(resolve,25));
 assert.equal(battlePresentationSettled(20),true);
 resetBattlePresentation();
});

test('local bot turns hold while the previous move is still on screen',()=>{
 class Memory {values=new Map<string,string>();getItem(k:string){return this.values.get(k)??null}setItem(k:string,v:string){this.values.set(k,v)}removeItem(k:string){this.values.delete(k)}}
 let now=0,settled=false;
 const backend=new LocalBackend({persistentStorage:new Memory(),transientStorage:new Memory(),autoTick:false,botDelayMs:0,now:()=>now,presentationSettled:()=>settled});
 const created=backend.request('/api/rooms',{mode:'bot',difficulty:'easy',training:true,setupMode:'quick'},'POST');
 const roomId=created.room.id as string;
 const play=()=>backend.request(`/api/rooms/${roomId}`).view;
 // Hand the turn to the bot, then tick while the table is still animating.
 let view=play();
 if(view.activePlayerId===view.selfId){backend.request(`/api/rooms/${roomId}/command`,{command:{type:'END_TURN',commandId:'end-1',matchId:view.matchId,expectedStateVersion:view.version}},'POST');view=play()}
 assert.notEqual(view.activePlayerId,view.selfId);
 const version=view.version;now+=5000;backend.tick();
 assert.equal(play().version,version);
 settled=true;now+=5000;backend.tick();
 assert.ok(play().version>version);
 backend.dispose();
});
