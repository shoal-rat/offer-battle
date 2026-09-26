import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exampleOffers,defaultLoadout} from '../src/game/offers';
import {projectOfferShare,projectLineupShare,projectBattleShare,PRIVATE_SHARE_DEFAULTS} from '../src/game/publicProjection';
import {createMatch,getView} from '../src/game';
test('share projection removes raw text, salary, names and id from every export field by default',()=>{
 const offer={...exampleOffers[0],id:'PRIVATE_ENTITY',name:'PRIVATE_CARD',role:'PRIVATE_ROLE',company:'PRIVATE_COMPANY',annualPackage:713579,profile:{...exampleOffers[0].profile!,city:'PRIVATE_CITY'}};
 const value=JSON.stringify(projectOfferShare(offer));for(const secret of ['PRIVATE_','713579','71.4','profile','annualPackage'])assert.ok(!value.includes(secret));
 const allowed=JSON.stringify(projectOfferShare(offer,{...PRIVATE_SHARE_DEFAULTS,role:true}));assert.ok(allowed.includes('PRIVATE_ROLE'));assert.ok(!allowed.includes('PRIVATE_COMPANY'));
});
test('lineup invitation has a stable neutral filename and no opponent/private school inference',()=>{
 const loadout={...defaultLoadout('p1','PRIVATE_NICK'),offers:[{...exampleOffers[0],company:'PRIVATE_COMPANY'}]};const value=projectLineupShare(loadout,PRIVATE_SHARE_DEFAULTS,'ABC123');
 assert.equal(value.filename,'offer-battle-invitation.png');assert.equal(value.roomCode,'ABC123');assert.ok(!JSON.stringify(value).includes('PRIVATE_'));assert.equal(value.schoolLabels,undefined);
});
test('battle report ignores raw event names and distinguishes expired notice from optimization',()=>{
 const state=createMatch([defaultLoadout('p1','PRIVATE_ME'),defaultLoadout('p2','PRIVATE_ENEMY')],2);const view=getView(state,'p1');view.events=[{sequence:1,type:'notice_expired',text:'PRIVATE_NAME 的通知失效',targetId:'secret'},{sequence:2,type:'covered',text:'PRIVATE_CARD',privateTo:'p2'}];
 const report=projectBattleShare(view);assert.ok(!JSON.stringify(report).includes('PRIVATE_'));assert.equal(report.highlights?.length,1);assert.equal(report.highlights?.[0].kind,'notice-expired');assert.ok(!report.highlights?.[0].text.includes('生效'));
});
