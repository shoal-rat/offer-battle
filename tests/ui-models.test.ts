import {test} from 'node:test';import assert from 'node:assert/strict';
import {previewAction} from '../src/game/actionPreview';
import {deckHealth,overseasPrimary} from '../src/game/deckHealth';
import {contextualHint} from '../src/components/ContextHints';
import {applyCommand,defaultLoadout} from '../src/game/index';
import {arena,unit,hand,offer,observe} from './bot-fixtures';

test('ranking boundaries 50/51/100/101 and invalid values remain explicit',()=>{
 assert.deepEqual([50,51,100,101].map(overseasPrimary),['H07','H08','H08','H09']);
 for(const rank of [0,-1,1.5,NaN,Infinity])assert.throws(()=>overseasPrimary(rank));
});
test('deck checks report actual counts and incomplete slots without invented win odds',()=>{
 const l=defaultLoadout('a','甲');const health=deckHealth(l);assert.equal(health.support+health.action+health.retort,15);assert.equal(health.curve.reduce((n,b)=>n+b.count,0),15);
 assert.ok(deckHealth({...l,offers:l.offers.slice(0,2)}).warnings.some(w=>w.includes('1 张')));
});
test('preview matches engine combat and offer retirement mind penalty, never mutates input',()=>{
 const s=arena();const oid=offer(s,'T00',4,'b');s.players[1].offerZone[0].status='board';const attacker=unit(s,'a',5,6),target=unit(s,'b',2,3,{kind:'offer',templateId:'T00',offerId:oid});const view=observe(s),copy=structuredClone(view);
 const command=view.legalActions.find(c=>c.type==='ATTACK'&&c.cardId===attacker.id&&c.targetId===target.id)!;assert.ok(command);
 const result=applyCommand(s,'a',command),preview=previewAction(view,command);assert.equal(result.error,undefined);assert.equal(preview.available,true);assert.equal(preview.uncertain,false);
 assert.ok(preview.lines.some(l=>l.includes(`对方心态：30 → ${result.state.players[1].mind}`)));assert.ok(preview.lines.some(l=>l.includes('额外扣除 2 心态')));assert.deepEqual(view,copy);
});
test('preview self damage and fatigue use actual rules, stale commands do not become actions',()=>{
 const s=arena();s.players[0].mind=2;const target=unit(s,'a',3,6);const id=hand(s,'N15');const v=observe(s),command=v.legalActions.find(c=>c.type==='PLAY_CARD'&&c.cardId===id&&c.targetId===target.id)!;
 assert.ok(command);assert.ok(previewAction(v,command).lines.some(l=>l==='我方心态：2 → 0'));
 assert.equal(previewAction({...v,legalActions:[]},command).available,false);
});
test('hidden hand, retort identity and RNG changes cannot alter public previews',()=>{
 const s=arena();unit(s,'a',5,6);unit(s,'b',2,7);const id=hand(s,'N07');hand(s,'N10','b');s.players[1].retort={id:'secret',definitionId:'F04',kind:'card',taxes:[],knownTo:[]};
 const hidden=structuredClone(s);hidden.players[1].hand[0].definitionId='N21';hidden.players[1].retort!.definitionId='N23';hidden.players[0].deck.reverse();hidden.rngState=999;
 const a=observe(s),b=observe(hidden);assert.deepEqual(a,b);const command=a.legalActions.find(c=>c.type==='PLAY_CARD'&&c.cardId===id)!;assert.ok(command);
 const first=previewAction(a,command);assert.equal(first.uncertain,true);assert.deepEqual(first,previewAction(b,command));
});
test('hints are situational, dismissible and absent on opponent or finished turn',()=>{
 const s=arena();unit(s,'a',3,5,{notice:{by:'b',turn:4}});let v=observe(s);assert.equal(contextualHint(v,[])?.id,'notice');assert.notEqual(contextualHint(v,['notice'])?.id,'notice');
 assert.equal(contextualHint({...v,activePlayerId:'b'},[]),null);assert.equal(contextualHint({...v,phase:'finished'},[]),null);
});
