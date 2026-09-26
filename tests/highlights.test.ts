import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMatch,defaultLoadout,exampleOffers,applyCommand,getView} from '../src/game/index';
import type {Command,MatchState} from '../src/game/types';
import {extractHighlights,matchLearning} from '../src/game/highlights';
import {projectBattleShare,projectOfferShare} from '../src/game/publicProjection';
function initial(){const a=defaultLoadout('a','PRIVATE_A'),b=defaultLoadout('b','PRIVATE_B');a.offers=structuredClone(exampleOffers.slice(0,3));b.offers=structuredClone(exampleOffers.slice(0,3));const s=createMatch([a,b],41,{skipSetup:true});s.round=6;s.topic='life';for(const p of s.players){p.timeRemaining=8;p.ownTurn=6;p.hand=[];p.retort=null;}s.events=[];s.eventSequence=0;return s}
function run(s:MatchState,actor:string,c:Command){s.activePlayerId=actor;const r=applyCommand(s,actor,c);assert.equal(r.error,undefined,JSON.stringify(c));return r.state}
let card=0;
function play(s:MatchState,actor:string,id:string,targetId?:string){const cardId=`test-${++card}`;s.players.find(p=>p.id===actor)!.hand.push({id:cardId,definitionId:id,kind:'card',taxes:[],knownTo:[]});return run(s,actor,{type:'PLAY_CARD',cardId,targetId})}
test('small action removal is sourced from real costs, retirement and extra mind loss without private log text',()=>{
 let s=initial();s=run(s,'b',{type:'DEPLOY_OFFER',offerId:'E01'});const target=s.players[1].board[0];target.damage=getView(s,'a').players[1].board[0].maxHealth-2;s=play(s,'a','N07',target.id);
 const view=getView(s,'a');for(const e of view.events)e.text='PRIVATE salary 987654321';const list=extractHighlights(view),h=list.find(h=>h.kind==='efficient-removal');assert.ok(h);assert.equal(h.outcome.removedIds[0],target.id);assert.equal(h.outcome.mindDelta.opponent,-2);assert.ok(h.eventSequences.length>=3);assert.ok(!JSON.stringify(projectBattleShare(view)).includes('PRIVATE'));assert.ok(!JSON.stringify(projectBattleShare(view)).includes('987654321'));
});
test('cancelled action is a revealed retort event and never a successful removal',()=>{
 let s=initial();s=run(s,'b',{type:'DEPLOY_OFFER',offerId:'E01'});s.players[1].retort={id:'contract',definitionId:'F04',kind:'card',taxes:[],knownTo:[]};const target=s.players[1].board[0];s=play(s,'a','N07',target.id);const list=extractHighlights(getView(s,'a'));assert.ok(list.some(h=>h.kind==='retort-cancel'&&h.outcome.cancelled));assert.ok(!list.some(h=>h.kind==='efficient-removal'));assert.ok(!list.some(h=>h.kind==='offer-retired'));
});
test('notice, management and expired inspection join only through the same real unit identity',()=>{
 let s=initial();s=run(s,'a',{type:'DEPLOY_OFFER',offerId:'E01'});const target=s.players[0].board[0];target.ageStage=3;s=play(s,'b','F01',target.id);s.players[0].timeRemaining=8;s=play(s,'a','F03',target.id);s=run(s,'a',{type:'END_TURN'});const view=getView(s,'a'),h=extractHighlights(view).find(h=>h.kind==='managed-notice');assert.ok(h);assert.equal(h.outcome.removedIds.length,0);assert.equal(h.eventSequences.length,3);assert.ok(!extractHighlights(view).some(h=>h.kind==='optimization'));
 const changed=structuredClone(view);changed.events.find(e=>e.type==='management')!.targetId='another-unit';assert.ok(!extractHighlights(changed).some(h=>h.kind==='managed-notice'));
});
test('two real successive area actions coalesce the shared deaths instead of one highlight per target',()=>{
 let s=initial();for(let i=0;i<2;i++)s=play(s,'b','N02');s.players[0].timeRemaining=8;s=play(s,'a','N18');s=play(s,'a','N18');const highlights=extractHighlights(getView(s,'a'));const combined=highlights.filter(h=>h.kind==='combined-clear');assert.equal(combined.length,1);assert.equal(combined[0].outcome.removedIds.length,2);assert.ok(combined[0].eventSequences.length>=6);
});
test('negotiation requires its actual deployment and result-only records get descriptive learning',()=>{
 let s=initial();s=run(s,'a',{type:'NEGOTIATE',sacrificeId:'E01',offerId:'E02'});const h=extractHighlights(getView(s,'a')).find(h=>h.kind==='negotiation');assert.ok(h);assert.equal(h.eventSequences.length,2);const view=getView(initial(),'a');view.events=[];view.phase='finished';view.result={winnerId:'a',reason:'test'};assert.equal(matchLearning(view).key,undefined);assert.match(matchLearning(view).learning,/没有足够/);
});
test('share art identity exposes a bounded public family without original art URL or persona text',()=>{
 const offer=structuredClone(exampleOffers[0]);offer.artId='/api/art/private-upload';offer.persona={version:1,seed:'12345678',preferences:{tone:'calm',appearance:'formal',variation:0},description:'PRIVATE',quote:'PRIVATE',lines:{summon:'PRIVATE',disrupt:'PRIVATE',counterFail:'PRIVATE',return:'PRIVATE',victory:'PRIVATE',defeat:'PRIVATE'}};const p=projectOfferShare(offer);assert.equal(p.offers[0].artKey,'public');assert.ok(!JSON.stringify(p).includes('PRIVATE'));assert.ok(!JSON.stringify(p).includes('/api/art'));
});
