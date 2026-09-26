import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LocalBackend,LocalBackendError,type LocalStorage} from '../src/local-backend';
import {applyCommand,chooseBotCommand,createMatch,defaultLoadout,exampleOffers,getView,showcaseCatalog} from '../src/game/index';
import {tutorialCatalog} from '../src/game/tutorial';
import type {Command,Loadout,OfferDefinition} from '../src/game/types';
import type {RoomResponse} from '../src/api';
import legacyRecord from './fixtures/legacy-offer-record.json';
class MemoryStorage implements LocalStorage {
  data=new Map<string,string>();getItem(key:string){return this.data.get(key)??null}setItem(key:string,value:string){this.data.set(key,value)}removeItem(key:string){this.data.delete(key)}
}
function fixture(){const persistentStorage=new MemoryStorage(),transientStorage=new MemoryStorage();let time=100_000;const make=()=>new LocalBackend({persistentStorage,transientStorage,now:()=>time,autoTick:false,botDelayMs:5,turnMs:30,setupMs:20});return {persistentStorage,transientStorage,make,advance(ms=10){time+=ms}}}
const envelope=(data:RoomResponse,command:Command,commandId:string=crypto.randomUUID())=>({matchId:data.view!.matchId,expectedStateVersion:data.view!.version,commandId,type:command.type,payload:command});
const command=(backend:LocalBackend,data:RoomResponse,value:Command,commandId?:string):any=>backend.request(`/api/rooms/${data.room.id}/command`,envelope(data,value,commandId),'POST');

for(const lesson of tutorialCatalog)test(`local guest ${lesson.id}: legal learner steps, mentor, duplicate protection and deterministic replay`,()=>{
  const f=fixture(),backend=f.make();try {
    let data=backend.request<RoomResponse>('/api/rooms',{mode:'bot',training:true,lessonId:lesson.id},'POST');
    const path=`/api/rooms/${data.room.id}`;let n=0;
    while(!data.room.tutorial!.completed){
      const wrong=command(backend,data,{type:'CONCEDE'});assert.equal(wrong.errorCode,'TUTORIAL_STEP');
      const input=envelope(data,data.view!.legalActions[0]);
      data=backend.request(path+'/command',input,'POST');assert.equal(data.ok,true);assert.equal(data.room.tutorial!.stepIndex,++n);
      const repeated=backend.request(path+'/command',input,'POST');assert.equal(repeated.duplicate,true);assert.equal(repeated.view.version,data.view!.version);
      f.advance(100);backend.tick();assert.equal(backend.request(path).view.version,data.view!.version,'generic bot timer cannot act during guided lessons');
    }
    const replay=backend.request(path+'/replay');assert.equal(replay.verified,true);assert.ok(replay.frames.length>n);
    assert.equal(f.transientStorage.getItem('offer-local-active-v1'),null,'completed tutorial does not become durable history');
    const restarted=backend.request(path+'/rematch',{},'POST');assert.equal(restarted.room.tutorial.stepIndex,0);assert.notEqual(restarted.view.matchId,data.view!.matchId);
    assert.throws(()=>backend.request(path+`/replay?matchId=${data.view!.matchId}`),/游客只保留当前对局/);
  }finally{backend.dispose()}
});

test('local bot plays a complete match with engine-only decisions, replay and reconstructible cloud-save seed',()=>{
  const f=fixture(),backend=f.make();try {
    const originalFetch=globalThis.fetch;globalThis.fetch=()=>{throw Error('guest play must not request a service')};
    try {
      let data=backend.request<RoomResponse>('/api/rooms',{mode:'bot',training:true,skipSetup:true,strategy:'control'},'POST');const path=`/api/rooms/${data.room.id}`;
      let steps=0;while(data.view!.phase!=='finished'&&steps++<1200){
        const bot=(data.view!.pendingChoice?.ownerId??data.view!.activePlayerId)==='p1'?chooseBotCommand(data.view!,'aggressive'):null;if(bot){const next=command(backend,data,bot);assert.equal(next.ok,true,next.rejection);data=next}
        f.advance();backend.tick();data=backend.request(path);
      }
      assert.equal(data.view!.phase,'finished');assert.ok(steps<1200);
      const record=backend.getReplay(data.room.id);assert.ok(record.journal.some(e=>e.actorId==='p2'));
      let state=createMatch(record.loadouts as [Loadout,Loadout],record.seed,{skipSetup:record.skipSetup,matchId:record.initialState.matchId});
      assert.deepEqual(state,record.initialState,'server can reconstruct the submitted initial state');
      for(const entry of record.journal){const next=applyCommand(state,entry.actorId,entry.command);assert.equal(next.error,undefined);state=next.state}
      assert.deepEqual(getView(state,'p1'),data.view);assert.equal(backend.request(path+'/replay').verified,true);
      assert.equal(f.transientStorage.getItem('offer-local-active-v1'),null);assert.equal([...f.persistentStorage.data.values()].some(value=>value.includes(record.initialState.matchId)),false);
      const reopened=f.make();assert.throws(()=>reopened.request(path),(error:unknown)=>error instanceof LocalBackendError&&error.status===404);reopened.dispose();
    }finally{globalThis.fetch=originalFetch}
  }finally{backend.dispose()}
});

test('local temporary resume keeps tutorial, receipts and current replay; expired cache is discarded',()=>{
  const f=fixture();let backend=f.make();try {
    let data=backend.request<RoomResponse>('/api/rooms',{mode:'bot',training:true,lessonId:'L02'},'POST');
    const path=`/api/rooms/${data.room.id}`,input=envelope(data,data.view!.legalActions[0]);data=backend.request(path+'/command',input,'POST');backend.dispose();backend=f.make();
    const resumed=backend.request(path);assert.equal(resumed.view.version,data.view!.version);assert.equal(resumed.room.tutorial.stepIndex,1);assert.equal(backend.request(path+'/command',input,'POST').duplicate,true);assert.equal(backend.request(path+'/replay').verified,true);
    backend.dispose();f.advance(12*60*60*1000+1);backend=f.make();assert.throws(()=>backend.request(path),(e:unknown)=>e instanceof LocalBackendError&&e.status===404);
  }finally{backend.dispose()}
});

test('local timer advances setup and turn deadlines, rejects forged TIMEOUT, and keeps training untimed',()=>{
  const f=fixture(),backend=f.make();try {
    let data=backend.request<RoomResponse>('/api/rooms',{mode:'bot',training:false},'POST');const path=`/api/rooms/${data.room.id}`;assert.equal(data.view!.phase,'flex');
    f.advance(21);backend.tick();data=backend.request(path);assert.equal(data.view!.phase,'mulligan');
    f.advance(21);backend.tick();data=backend.request(path);assert.equal(data.view!.phase,'playing');
    assert.throws(()=>command(backend,data,{type:'TIMEOUT'}),/超时由本地计时器/);
    f.advance(31);backend.tick();assert.ok(backend.getReplay(data.room.id).journal.some(e=>e.command.type==='TIMEOUT'));
    const training=backend.request('/api/rooms',{mode:'bot',training:true,skipSetup:true},'POST');assert.equal(training.room.deadline,null);
  }finally{backend.dispose()}
});

test('local command envelope rejects stale state, altered reuse and previous-match IDs without changing state',()=>{
  const f=fixture(),backend=f.make();try {
    const data=backend.request<RoomResponse>('/api/rooms',{mode:'bot',training:true,lessonId:'L01'},'POST'),path=`/api/rooms/${data.room.id}`;
    const input=envelope(data,data.view!.legalActions[0]);const next=backend.request(path+'/command',input,'POST');
    assert.equal(backend.request(path+'/command',envelope(data,data.view!.legalActions[0]),'POST').errorCode,'STALE_VERSION');
    assert.throws(()=>backend.request(path+'/command',{...input,payload:{type:'END_TURN'},type:'END_TURN'},'POST'),/commandId 已用于其他/);
    assert.throws(()=>backend.request(path+'/command',{...input,matchId:'previous'},'POST'),/旧对局指令/);
    assert.equal(backend.request(path).view.version,next.view.version);
  }finally{backend.dispose()}
});

test('custom offers persist locally and loadouts use the compiled collection instead of client-forged attributes',()=>{
  const f=fixture();let backend=f.make();try {
    backend.request('/api/session',{nickname:'本地玩家'},'POST');
    const source={...exampleOffers[0].profile!,company_display_name:'自主选择的公司',card_display_name:'制造业研发',monthly_fixed_cny:18000};
    const {offer}=backend.request<{offer:OfferDefinition}>('/api/offers',{profile:source,benefitId:null},'POST');
    const loadout=defaultLoadout('p1','本地玩家',5);loadout.offers=[{...offer,baseAttack:999},...exampleOffers.filter(o=>o.id!==offer.id).slice(0,2)];
    backend.request('/api/profile',{loadout,expectedRevision:backend.request('/api/profile').revision},'PATCH');backend.dispose();backend=f.make();
    const profile=backend.request('/api/profile');assert.equal(profile.offers[0].name,'制造业研发');assert.notEqual(profile.loadout.offers[0].baseAttack,999);
    const room=backend.request('/api/rooms',{mode:'bot',training:true,skipSetup:true,loadout},'POST');assert.equal(room.view.players[0].offerZone[0].definition.baseAttack,offer.baseAttack);
    backend.request(`/api/offers/${offer.id}`,undefined,'DELETE');assert.equal(backend.request('/api/profile').offers.length,0);
  }finally{backend.dispose()}
});

test('all practice setups use existing showcase engine and remain marked as practice for cloud-save restrictions',()=>{
  const f=fixture(),backend=f.make();try{for(const scenario of showcaseCatalog){const data=backend.request('/api/rooms',{mode:'bot',training:true,practiceScenario:scenario.id},'POST');assert.equal(data.room.scenario.id,scenario.id);assert.equal(data.room.deadline,null);assert.equal(backend.getReplay(data.room.id).practiceScenario,scenario.id);assert.equal(backend.request(`/api/rooms/${data.room.id}/replay`).verified,true)}}finally{backend.dispose()}
});

test('local socket emits open/state updates and closes cleanly, with no remote connection',async()=>{
  const f=fixture(),backend=f.make();try {
    const data=backend.request<RoomResponse>('/api/rooms',{mode:'bot',training:true,lessonId:'L01'},'POST');const socket=backend.connect(data.room.id),messages:any[]=[];let opened=false,closed=false;
    socket.onopen=()=>opened=true;socket.onmessage=e=>messages.push(JSON.parse(e.data));socket.onclose=()=>closed=true;
    await new Promise<void>(resolve=>queueMicrotask(resolve));await new Promise<void>(resolve=>queueMicrotask(resolve));assert.equal(opened,true);assert.equal(messages[0].type,'state');
    command(backend,data,data.view!.legalActions[0]);await new Promise<void>(resolve=>queueMicrotask(resolve));assert.equal(messages.at(-1).view.version,1);
    socket.close();await new Promise<void>(resolve=>queueMicrotask(resolve));assert.equal(closed,true);assert.equal(socket.readyState,3);
    assert.throws(()=>backend.request('/api/rooms',{mode:'friend'},'POST'),(e:unknown)=>e instanceof LocalBackendError&&e.code==='AUTH_REQUIRED');
  }finally{backend.dispose()}
});

test('local persisted 2.0 collection upgrades while a resumed match stays frozen until rematch',()=>{
  const f=fixture();let backend=f.make();
  try{
    const started=backend.request('/api/rooms',{mode:'bot',training:true,skipSetup:true},'POST');backend.dispose();
    const saved=JSON.parse(f.transientStorage.getItem('offer-local-active-v1')!);
    saved.room.seats.forEach((seat:any,index:number)=>{seat.loadout=legacyRecord.loadouts[index]});
    saved.room.state=legacyRecord.initialState;saved.room.initialState=legacyRecord.initialState;saved.room.seed=legacyRecord.seed;saved.room.journal=[];saved.room.receipts={};
    f.transientStorage.setItem('offer-local-active-v1',JSON.stringify(saved));
    const profile=JSON.parse(f.persistentStorage.getItem('offer-local-profile-v1')!);
    profile.offers=[legacyRecord.loadouts[0].offers[0]];profile.loadout=legacyRecord.loadouts[0];
    f.persistentStorage.setItem('offer-local-profile-v1',JSON.stringify(profile));backend=f.make();
    const upgraded=backend.request('/api/profile');assert.equal(upgraded.offers[0].rulesVersion,'2.1.0');assert.equal(upgraded.loadout.offers.every((o:any)=>o.rulesVersion==='2.1.0'),true);
    const path=`/api/rooms/${started.room.id}`,resumed=backend.request(path);
    assert.equal(resumed.view.players[0].offerZone[0].definition.baseAttack,7);assert.equal(resumed.view.players[0].offerZone[0].definition.rulesVersion,'2.0.0');
    assert.deepEqual(backend.getReplay(started.room.id).initialState,legacyRecord.initialState);
    command(backend,resumed,{type:'CONCEDE'});assert.equal(backend.request(path+'/replay').verified,true);
    const rematch=backend.request(path+'/rematch',{},'POST');
    for(const player of rematch.view.players)assert.equal(player.offerZone.every((o:any)=>o.definition.rulesVersion==='2.1.0'),true);
    const fresh=backend.request('/api/rooms',{mode:'bot',training:true,skipSetup:true},'POST');
    assert.equal(fresh.view.players[0].offerZone[0].definition.rulesVersion,'2.1.0');
  }finally{backend.dispose()}
});

test('local Offer saves are durable and idempotent; revision and recycle operations preserve running definitions',()=>{
 const f=fixture(),backend=f.make();try{
  const input={profile:exampleOffers[0].profile,idempotencyKey:'local-save-first',draftRevision:3,preferences:{tone:'calm',appearance:'casual',variation:0}};
  const original=backend.request('/api/offers',input,'POST').offer;assert.equal(backend.request('/api/offers',input,'POST').duplicate,true);assert.equal(backend.request('/api/profile').offers.length,1);
  const loadout=defaultLoadout('p1','本地玩家',5);loadout.offers[0]=original;backend.request('/api/profile',{loadout,expectedRevision:backend.request('/api/profile').revision},'PATCH');
  const room=backend.request('/api/rooms',{mode:'bot',training:true,skipSetup:true,loadout},'POST');
  const revised=backend.request(`/api/offers/${original.id}`,{...input,idempotencyKey:'local-save-revise',draftRevision:4,expectedDefinitionRevision:1,profile:{...input.profile,monthly_fixed_cny:12000}},'PATCH');assert.equal(revised.offer.definitionRevision,2);
  assert.equal(backend.request(`/api/rooms/${room.room.id}`).view.players[0].offerZone[0].definition.definitionRevision,1);
  assert.equal(backend.request(`/api/offers/${original.id}`,undefined,'DELETE').affectedLoadout,true);assert.equal(backend.request('/api/profile').deletedOffers.length,1);
  assert.equal(backend.request(`/api/offers/${original.id}/restore`,{},'POST').offer.definitionRevision,2);assert.equal(backend.request(`/api/offers/${original.id}/restore`,{},'POST').duplicate,true);
  assert.equal(backend.request(`/api/rooms/${room.room.id}/replay`).verified,true);
  const setItem=f.persistentStorage.setItem;f.persistentStorage.setItem=()=>{throw Error('quota')};
  assert.throws(()=>backend.request('/api/offers',{...input,idempotencyKey:'local-storage-full'},'POST'),(error:unknown)=>error instanceof LocalBackendError&&error.code==='STORAGE_FULL');
  f.persistentStorage.setItem=setItem;assert.equal(backend.request('/api/profile').offers.length,1,'failed storage must not create a phantom in-memory entity');
  assert.equal(backend.request('/api/offers',{...input,idempotencyKey:'local-storage-full'},'POST').duplicate,false);
 }finally{backend.dispose()}
});

test('local profile revisions detect a second tab and preserve the draft on storage failure; migration preserves its source',()=>{
 const f=fixture(),first=f.make(),second=f.make();try{
  const initial=first.request('/api/profile');assert.equal(initial.revision,0);
  const updated=first.request('/api/profile',{nickname:'第一页',expectedRevision:0,idempotencyKey:'local-profile-once'},'PATCH');assert.equal(updated.revision,1);
  assert.throws(()=>second.request('/api/profile',{nickname:'过期页面',expectedRevision:0},'PATCH'),(e:unknown)=>e instanceof LocalBackendError&&e.status===409&&e.profile?.nickname==='第一页');
  assert.throws(()=>second.request('/api/profile',{nickname:'无版本'},'PATCH'),(e:unknown)=>e instanceof LocalBackendError&&e.status===428);
  const setter=f.persistentStorage.setItem.bind(f.persistentStorage);f.persistentStorage.setItem=()=>{throw Error('quota')};assert.throws(()=>first.request('/api/profile',{nickname:'未落盘',expectedRevision:1},'PATCH'),(e:unknown)=>e instanceof LocalBackendError&&e.code==='STORAGE_FULL');f.persistentStorage.setItem=setter;assert.equal(first.request('/api/profile').nickname,'第一页');
  const profile={...exampleOffers[0].profile!,company_display_name:'迁移原件'},offer={...exampleOffers[0],id:'external_local',profile},input={sourceId:'another-browser',offers:[offer],expectedRevision:1,idempotencyKey:'local-migration-once'};
  assert.equal(first.request('/api/migrations/preview',input,'POST').items[0].status,'new');const result=first.request('/api/migrations/commit',input,'POST');assert.equal(result.profile.offers.length,1);assert.notEqual(result.idMap.external_local,'external_local');assert.equal(first.request('/api/migrations/commit',input,'POST').duplicate,true);assert.equal(offer.id,'external_local');
 }finally{first.dispose();second.dispose()}
});

test('P2 local runtime: explicit challenge fixtures solve through commands, cosmetics persist, and replay is marked experimental',async()=>{
 const {createChallenge,experimentFlags}=await import('../src/game/experiments');const f=fixture(),backend=f.make();try{
  assert.throws(()=>backend.request('/api/rooms',{mode:'bot',training:true,experiment:{kind:'challenge',id:'CH01'}},'POST'),/明确启用/);assert.throws(()=>backend.request('/api/rooms',{mode:'bot',training:true,experiment:{kind:'challenge',id:'CH01',enabled:'false'}},'POST'),/明确启用/);
  for(const id of ['CH01','CH02','CH03','CH04','CH05']){let room=backend.request<RoomResponse>('/api/rooms',{mode:'bot',training:true,achievementsEnabled:true,experiment:{enabled:true,kind:'challenge',id}},'POST');assert.equal(room.room.experiment?.standard,false);const fixture=createChallenge(id,experimentFlags({challenges:true}));for(const step of fixture.solution){room=command(backend,room,step.command);assert.equal(room.ok,true);}assert.equal(room.room.experiment?.solved,true);const replay=backend.request(`/api/rooms/${room.room.id}/replay`);assert.equal(replay.verified,true);assert.equal(replay.experiment.kind,'challenge');assert.equal(backend.getReplay(room.room.id).experiment?.id,id);}
  const earned=backend.request('/api/profile').achievements;assert.ok(earned.some((e:any)=>e.id==='small-big'));assert.ok(earned.some((e:any)=>e.id==='notice-cleared'));
  const boss=backend.request<RoomResponse>('/api/rooms',{mode:'bot',training:true,experiment:{enabled:true,kind:'boss',id:'BOSS01'}},'POST');assert.equal(boss.view!.players[1].mind,30);assert.equal(boss.room.difficulty,'hard');
 }finally{backend.dispose()}
});
test('P2 local best of three: intermission survives reload, locks cards, accepts flex changes and stops after two wins',()=>{
 const f=fixture();let backend=f.make();try{
  let room=backend.request<RoomResponse>('/api/rooms',{mode:'bot',training:true,skipSetup:true,experiment:{kind:'series',enabled:true}},'POST');const original=room.view!.players[0].offerZone.map(o=>o.definition.id);assert.equal(room.room.series?.gameIndex,1);
  room=command(backend,room,{type:'CONCEDE'});assert.equal(room.room.series?.wins.p2,1);backend.dispose();backend=f.make();const resumed=backend.request(`/api/rooms/${room.room.id}`);assert.deepEqual(resumed.room.series,room.room.series);assert.equal(backend.request(`/api/rooms/${room.room.id}/replay`).verified,true);room=backend.request(`/api/rooms/${room.room.id}/rematch`,{flexDeck:['F02','F03','F06']},'POST');assert.equal(room.room.series?.gameIndex,2);assert.deepEqual(room.view!.players[0].offerZone.map(o=>o.definition.id),original);assert.deepEqual(backend.getReplay(room.room.id).loadouts[0].flexDeck,['F02','F03','F06']);room=command(backend,room,{type:'CONCEDE'});assert.equal(room.room.series?.status,'finished');assert.equal(room.room.series?.winnerId,'p2');assert.equal(f.transientStorage.getItem('offer-local-active-v1'),null);assert.throws(()=>backend.request(`/api/rooms/${room.room.id}/rematch`,{},'POST'),/不能开始/);
 }finally{backend.dispose()}
});
