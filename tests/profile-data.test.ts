import {test} from 'node:test';
import assert from 'node:assert/strict';
import {patchProfile,ProfileWriteError,profileRevision} from '../src/game/profile-sync';
import {previewMigration,commitMigration,type MigrationLibrary} from '../src/game/migration';
import {saveOffer} from '../src/game/draft-save';
import {defaultLoadout,exampleOffers} from '../src/game/offers';
import {invitationPreview,invitationCode} from '../src/game/invitation';
import {diagnosticEvent,sanitizedErrorReport,LocalDiagnosticLog} from '../src/game/diagnostics';
const local=()=>saveOffer({offers:[]},{profile:exampleOffers[0].profile,benefitId:null},{newId:()=> 'local_card'}).offer;
const cloud=():MigrationLibrary=>({id:'cloud',nickname:'玩家',offers:[],revision:0});
const loadout=(p:any,value:any)=>({...defaultLoadout('p1',p.nickname,5),...value});

test('profile: conditional writes reject stale or absent revisions, idempotent lost-response retries do not regress',()=>{
 const p=cloud();assert.throws(()=>patchProfile(p,{nickname:'新的'},loadout),(e:unknown)=>e instanceof ProfileWriteError&&e.status===428);
 const input={nickname:'新的',expectedRevision:0,idempotencyKey:'profile-operation'},next=patchProfile(p,input,loadout);assert.equal(next.revision,1);assert.equal(p.nickname,'玩家');
 const latest=patchProfile(next,{nickname:'第三版',expectedRevision:1},loadout);assert.equal(patchProfile(latest,input,loadout).nickname,'第三版');
 assert.throws(()=>patchProfile(latest,{nickname:'旧页面',expectedRevision:0},loadout),(e:unknown)=>e instanceof ProfileWriteError&&e.status===409&&e.profile?.nickname==='第三版');
 assert.throws(()=>patchProfile(latest,{...input,nickname:'篡改同键'},loadout),/标识/);
});
test('migration: read-only preview, authoritative compile, semantic dedup and explicit ID remapping preserve originals',()=>{
 const p=cloud(),offer=local(),raw={...offer,baseAttack:9999},input={sourceId:'local-device',offers:[raw],includeLoadout:true,loadout:{...defaultLoadout('p1','本机玩家',5),offers:[raw,...exampleOffers.slice(1,3)]},expectedRevision:0,idempotencyKey:'migration-operation'};
 assert.equal(previewMigration(p,input).items[0].status,'new');assert.deepEqual(p,cloud());const before=structuredClone(input);
 const result=commitMigration(p,input,()=> 'cloud_card');assert.equal(result.idMap.local_card,'cloud_card');assert.notEqual(result.profile.offers[0].baseAttack,9999);assert.equal(result.profile.loadout!.offers[0].id,'cloud_card');assert.deepEqual(input,before);assert.equal(p.offers.length,0);
 assert.equal(commitMigration(result.profile,input,()=> 'never').duplicate,true);
 assert.equal(previewMigration(result.profile,{sourceId:'second-device',offers:[{...offer,id:'different_local_id'}]}).items[0].status,'duplicate');
 const sameBatch=commitMigration(cloud(),{sourceId:'local',offers:[offer,{...offer,id:'same_semantics'}],expectedRevision:0,idempotencyKey:'two-local-cards'},()=> 'one_card');assert.equal(sameBatch.profile.offers.length,1);assert.equal(sameBatch.idMap.same_semantics,'one_card');
});
test('migration: conflicts never silently overwrite; cloud choice, keep both, revision guard and bounded payload',()=>{
 const p=cloud(),offer=local();p.offers=[offer];const changed={...offer,profile:{...offer.profile!,monthly_fixed_cny:10000}},input={sourceId:'local',offers:[changed],expectedRevision:0,idempotencyKey:'choose-conflict'};
 assert.equal(previewMigration(p,input).items[0].status,'conflict');assert.throws(()=>commitMigration(p,input,()=> 'new'),/选择/);
 const kept=commitMigration(p,{...input,choices:{local_card:'keep-both'}},()=> 'new');assert.equal(kept.profile.offers.length,2);assert.deepEqual(kept.profile.offers[0],offer);
 const cloudOnly=commitMigration(p,{...input,choices:{local_card:'use-cloud'}},()=> 'new');assert.equal(cloudOnly.profile.offers.length,1);assert.equal(cloudOnly.idMap.local_card,offer.id);
 assert.throws(()=>commitMigration(kept.profile,{...input,idempotencyKey:'fresh-stale-revision'},()=> 'new'),ProfileWriteError);assert.throws(()=>commitMigration(p,{...input,nickname:'x'.repeat(400001)},()=> 'new'),/分批/);
 for(const id of ['E01','__proto__'])assert.throws(()=>previewMigration(p,{sourceId:'local',offers:[{...offer,id}]}),/标识/);
});
test('invitation preview has enumerated states and no seat credentials or private offer values',()=>{
 const room={createdAt:0,expires:100,status:'waiting',seats:[{name:'邀请者',loadout:defaultLoadout('p1','玩家',5),token:'SECRET'}]};
 assert.deepEqual(invitationPreview(room,50),{status:'waiting',hostNickname:'邀请者'});const publicLineup=invitationPreview({...room,publishLineup:true},50);assert.deepEqual(Object.keys(publicLineup.offers![0]).sort(),['attack','cost','health','templateId']);assert.doesNotMatch(JSON.stringify(publicLineup),/SECRET|salary|annualPackage|profile|company|playerId/);
 assert.equal(invitationPreview({...room,seats:[...room.seats,...room.seats]},50).status,'full');assert.equal(invitationPreview({...room,status:'finished'},50).status,'ended');assert.equal(invitationPreview(room,100).status,'expired');assert.equal(invitationPreview(null).status,'not-found');assert.equal(invitationCode('https://example.com/offer-battle/?room=abc012'),'ABC012');assert.equal(invitationCode('abcdef?token=secret'),null);
});
test('diagnostic allowlist drops every raw private string, stack, token, URL and metric claim',()=>{
 const raw={company:'PRIVATE COMPANY',annualPackage:987654,token:'SECRET',url:'https://example.com/?token=SECRET',route:'battle',round:4,mode:'friend',message:'secret text'};
 const event=diagnosticEvent('match_started',raw),report=sanitizedErrorReport({name:'TypeError',message:'PRIVATE COMPANY',stack:'SECRET',code:'STORAGE_FULL',status:507},raw);assert.doesNotMatch(JSON.stringify([event,report]),/PRIVATE|SECRET|987654|https:|stack|message/);assert.equal(report.httpStatus,507);assert.equal(report.code,'STORAGE_FULL');assert.throws(()=>diagnosticEvent('arbitrary' as any,raw));
 const log=new LocalDiagnosticLog();for(let i=0;i<110;i++)log.record('app_open',raw);assert.equal(log.export().entries.length,100);assert.equal(log.export().realUserRetention,null);log.clear();assert.equal(log.export().entries.length,0);
});
