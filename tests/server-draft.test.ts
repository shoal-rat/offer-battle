import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startServer} from '../server/index';
import {defaultLoadout,exampleOffers} from '../src/game/index';
const pause=(ms=20)=>new Promise(resolve=>setTimeout(resolve,ms));
async function fixture(){const dataDir=await mkdtemp(join(tmpdir(),'offer-draft-')),app=await startServer({dataDir,port:0,host:'127.0.0.1',botDelayMs:999999});const session=await fetch(app.url+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nickname:'修订测试'})}).then(response=>response.json()) as any;
 const api=async(path:string,body?:unknown,method=body===undefined?'GET':'POST')=>{const response=await fetch(app.url+path,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.token}`},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json() as any}};return {api,url:app.url,async close(){await app.close();await rm(dataDir,{recursive:true,force:true})}};}
const body=(key:string,extra:any={})=>({profile:exampleOffers[0].profile,benefitId:null,idempotencyKey:key,draftRevision:1,characterSeed:'1234abcd',preferences:{tone:'witty',appearance:'formal',variation:1},...extra});

test('Node Offer transactions: concurrent retries, stable revision, frozen active match, copy, delete and restore',async()=>{
 const f=await fixture();try{
  const answers=await Promise.all([f.api('/api/offers',body('one-operation')),f.api('/api/offers',body('one-operation'))]);assert.deepEqual(answers.map(answer=>answer.status),[201,200]);const original=answers[0].body.offer;
  assert.equal((await f.api('/api/profile')).body.offers.length,1);assert.equal((await f.api('/api/offers',body('one-operation',{draftRevision:2}))).status,409);
  const loadout=defaultLoadout('p1','修订测试',5);loadout.offers[0]=original;await f.api('/api/profile',{loadout,expectedRevision:(await f.api('/api/profile')).body.revision},'PATCH');
  const room=(await f.api('/api/rooms',{mode:'bot',training:true,skipSetup:true,loadout})).body;
  const updated=await f.api(`/api/offers/${original.id}`,body('revision-operation',{profile:{...exampleOffers[0].profile,monthly_fixed_cny:11000},expectedDefinitionRevision:1,draftRevision:2}),'PATCH');assert.equal(updated.status,200);assert.equal(updated.body.offer.id,original.id);assert.equal(updated.body.offer.definitionRevision,2);
  const during=(await f.api(`/api/rooms/${room.room.id}`)).body;assert.equal(during.view.players[0].offerZone[0].definition.definitionRevision,1);assert.equal(during.view.players[0].offerZone[0].definition.annualPackage,original.annualPackage);
  assert.equal((await f.api(`/api/offers/${original.id}`,body('conflict-operation',{expectedDefinitionRevision:1}),'PATCH')).body.errorCode,'OFFER_REVISION_CONFLICT');
  const copied=await f.api('/api/offers',body('copy-operation',{intent:'copy',sourceOfferId:original.id}));assert.equal(copied.status,201);assert.notEqual(copied.body.offer.id,original.id);
  const deleted=await f.api(`/api/offers/${original.id}`,undefined,'DELETE');assert.equal(deleted.body.affectedLoadout,true);assert.equal(deleted.body.deletedOffer.offer.definitionRevision,2);
  assert.equal((await f.api(`/api/offers/${original.id}`,undefined,'DELETE')).body.duplicate,true);
  const restored=await f.api(`/api/offers/${original.id}/restore`,{});assert.equal(restored.body.offer.definitionRevision,2);assert.equal((await f.api(`/api/offers/${original.id}/restore`,{})).body.duplicate,true);
  const replay=(await f.api(`/api/rooms/${room.room.id}/replay`)).body;assert.equal(replay.verified,true);assert.equal(replay.frames[0].players[0].offerZone[0].definition.definitionRevision,1);
 }finally{await f.close()}
});

test('Node optional generation sends saved preferences and seed; late results cannot overwrite a revision',async()=>{
 const oldText=process.env.TEXT_PROVIDER_URL,oldExtract=process.env.EXTRACT_PROVIDER_URL;let release:(()=>void)|undefined,seen:any,arrived:()=>void;
 const arrival=new Promise<void>(resolve=>arrived=resolve);
 const provider=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;seen=JSON.parse(raw);if(req.url==='/extract'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({fields:{company_display_name:'识别公司',monthly_fixed_cny:18000}}));return}release=()=>{if(res.writableEnded)return;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({name:'不应改掉名称',description:'来自旧版本的描述',quote:'来自旧版本的台词'}))};arrived();});
 await new Promise<void>(resolve=>provider.listen(0,'127.0.0.1',resolve));const port=(provider.address() as any).port;process.env.TEXT_PROVIDER_URL=`http://127.0.0.1:${port}/text`;process.env.EXTRACT_PROVIDER_URL=`http://127.0.0.1:${port}/extract`;
 const f=await fixture();try{
  const capabilities=(await f.api('/api/capabilities')).body;assert.equal(capabilities.generation.text.provider,'remote');assert.equal(capabilities.extract,true);
  const offer=(await f.api('/api/offers',body('generation-save'))).body.offer;
  const started=await f.api(`/api/offers/${offer.id}/appearance`,{stage:'text',expectedDefinitionRevision:1});assert.equal(started.status,202);await arrival;assert.equal(seen.preferences.tone,'witty');assert.equal(seen.characterSeed,'1234abcd');
  const changed=await f.api(`/api/offers/${offer.id}`,body('revision-during-job',{profile:{...exampleOffers[0].profile,role_title:'新岗位'},expectedDefinitionRevision:1,draftRevision:2}),'PATCH');assert.equal(changed.status,200);release!();
  let job:any;for(let i=0;i<80;i++){job=(await f.api(`/api/generation/jobs/${started.body.job.id}`)).body.job;if(job.state==='stale')break;await pause()}
  assert.equal(job.state,'stale');const latest=(await f.api('/api/profile')).body.offers[0];assert.equal(latest.definitionRevision,2);assert.notEqual(latest.persona.quote,'来自旧版本的台词');assert.equal((await f.api(`/api/generation/jobs/${job.id}/retry`,{})).status,409);
  const extraction=await f.api('/api/extractions',{text:'公司：识别公司',draftRevision:8});assert.equal(extraction.status,200);assert.equal(extraction.body.draftRevision,8);assert.equal(extraction.body.fields.monthly_fixed_cny,18000);assert.equal(extraction.body.fields.annual_target_bonus_cny,undefined);
 }finally{release?.();await f.close();await new Promise<void>(resolve=>provider.close(()=>resolve()));if(oldText===undefined)delete process.env.TEXT_PROVIDER_URL;else process.env.TEXT_PROVIDER_URL=oldText;if(oldExtract===undefined)delete process.env.EXTRACT_PROVIDER_URL;else process.env.EXTRACT_PROVIDER_URL=oldExtract;}
});

test('Node image failure keeps the playable card; retry persists the current job and returns real art',async()=>{
 const oldImage=process.env.IMAGE_PROVIDER_URL;let attempts=0,seen:any;
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
 const provider=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;seen=JSON.parse(raw);res.setHeader('Content-Type','application/json');if(++attempts===1){res.statusCode=503;res.end(JSON.stringify({error:'temporary'}));return}res.end(JSON.stringify({mime:'image/png',base64:png}));});
 await new Promise<void>(resolve=>provider.listen(0,'127.0.0.1',resolve));process.env.IMAGE_PROVIDER_URL=`http://127.0.0.1:${(provider.address() as any).port}/image`;
 const f=await fixture();try{
  const original=(await f.api('/api/offers',body('image-operation'))).body.offer;
  const started=await f.api(`/api/offers/${original.id}/appearance`,{stage:'image',expectedDefinitionRevision:1});
  const terminal=async()=>{for(let n=0;n<100;n++){const job=(await f.api(`/api/generation/jobs/${started.body.job.id}`)).body.job;if(['failed','ready'].includes(job.state))return job;await pause()}throw Error('generation did not settle')};
  assert.equal((await terminal()).state,'failed');assert.equal((await f.api('/api/profile')).body.offers[0].artId,original.artId);
  assert.equal((await f.api('/api/generation/jobs')).body.jobs[0].state,'failed');assert.equal((await f.api(`/api/generation/jobs/${started.body.job.id}/retry`,{})).status,200);
  const ready=await terminal();assert.equal(ready.state,'ready');assert.equal(ready.phase,'保存完成');assert.equal(attempts,2);assert.equal(seen.preferences.appearance,'formal');assert.equal(seen.characterSeed,'1234abcd');
  const saved=(await f.api('/api/profile')).body.offers[0];assert.match(saved.artId,/^\/api\/art\//);assert.equal(saved.definitionRevision,1);assert.equal(saved.baseAttack,original.baseAttack);assert.equal(saved.name,original.name);
 }finally{await f.close();await new Promise<void>(resolve=>provider.close(()=>resolve()));if(oldImage===undefined)delete process.env.IMAGE_PROVIDER_URL;else process.env.IMAGE_PROVIDER_URL=oldImage;}
});

test('Node profile CAS, explicit migration and public invite projection share the service contract',async()=>{
 const f=await fixture();try{
  const initial=(await f.api('/api/profile')).body;assert.equal(initial.revision,0);assert.equal((await f.api('/api/profile',{nickname:'缺版本'},'PATCH')).status,428);
  const changed=await f.api('/api/profile',{nickname:'邀请者',expectedRevision:0,idempotencyKey:'node-profile-save'},'PATCH');assert.equal(changed.status,200);assert.equal(changed.body.revision,1);
  const conflict=await f.api('/api/profile',{nickname:'旧页面',expectedRevision:0},'PATCH');assert.equal(conflict.status,409);assert.equal(conflict.body.profile.nickname,'邀请者');assert.equal(conflict.body.errorCode,'PROFILE_REVISION_CONFLICT');
  const offer={...exampleOffers[0],id:'local_to_node',profile:{...exampleOffers[0].profile!,company_display_name:'PRIVATE MIGRATION'}},input={sourceId:'guest-device',offers:[offer],expectedRevision:1,idempotencyKey:'node-migration-once'};
  assert.equal((await f.api('/api/migrations/preview',input)).body.items[0].status,'new');const migrated=await f.api('/api/migrations/commit',input);assert.equal(migrated.status,200);assert.equal(migrated.body.profile.offers.length,1);assert.equal((await f.api('/api/migrations/commit',input)).body.duplicate,true);
  const room=(await f.api('/api/rooms',{mode:'friend',publishLineup:true})).body;const preview=await fetch(f.url+'/api/invitations/'+room.room.code).then(response=>response.json()) as any;assert.equal(preview.status,'waiting');assert.equal(preview.hostNickname,'邀请者');assert.deepEqual(Object.keys(preview.offers[0]).sort(),['attack','cost','health','templateId']);assert.doesNotMatch(JSON.stringify(preview),/session|token|PRIVATE|annualPackage|profile|playerId/);
 }finally{await f.close()}
});

test('P2 Node: server flags gate fixtures and series; legitimate experiments retain replay metadata',async()=>{
 const prior=process.env.ENABLE_EXPERIMENTS,seriesPrior=process.env.ENABLE_BEST_OF_THREE;delete process.env.ENABLE_EXPERIMENTS;delete process.env.ENABLE_BEST_OF_THREE;const f=await fixture();try{
  const request={mode:'bot',training:true,experiment:{enabled:true,kind:'challenge',id:'CH01'}};assert.equal((await f.api('/api/rooms',request)).status,400);assert.equal((await f.api('/api/rooms',{mode:'friend',variant:{firstPlayerStartingMindPenalty:1}})).status,400);
  process.env.ENABLE_EXPERIMENTS='true';assert.equal((await f.api('/api/rooms',{...request,experiment:{...request.experiment,id:'invalid'}})).status,400);const created=(await f.api('/api/rooms',request)).body;assert.equal(created.room.experiment.id,'CH01');const {createChallenge,experimentFlags}=await import('../src/game/experiments');const solution=createChallenge('CH01',experimentFlags({challenges:true})).solution[0].command;const result=await f.api(`/api/rooms/${created.room.id}/command`,{...solution,commandId:'challenge-command',matchId:created.view.matchId,expectedStateVersion:created.view.version});assert.equal(result.body.ok,true);assert.equal(result.body.room.experiment.solved,true);assert.equal((await f.api(`/api/rooms/${created.room.id}/replay`)).body.experiment.id,'CH01');
  process.env.ENABLE_BEST_OF_THREE='true';let series=(await f.api('/api/rooms',{mode:'bot',training:true,skipSetup:true,experiment:{enabled:true,kind:'series'}})).body;
  for(let i=1;i<=2;i++){series=(await f.api(`/api/rooms/${series.room.id}/command`,{type:'CONCEDE',commandId:'series-'+i,matchId:series.view.matchId,expectedStateVersion:series.view.version})).body;assert.equal(series.room.series.wins.p2,i);if(i===1){assert.equal((await f.api(`/api/rooms/${series.room.id}/rematch`,{loadout:{primaryId:'H01'}})).status,400);assert.equal((await f.api(`/api/rooms/${series.room.id}`)).body.room.series.status,'between');series=(await f.api(`/api/rooms/${series.room.id}/rematch`,{flexDeck:['F02','F03','F06']})).body;}}
  assert.equal(series.room.series.status,'finished');assert.equal((await f.api(`/api/rooms/${series.room.id}/rematch`,{})).status,409);
 }finally{await f.close();if(prior===undefined)delete process.env.ENABLE_EXPERIMENTS;else process.env.ENABLE_EXPERIMENTS=prior;if(seriesPrior===undefined)delete process.env.ENABLE_BEST_OF_THREE;else process.env.ENABLE_BEST_OF_THREE=seriesPrior}
});
