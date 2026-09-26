import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {createMatch,defaultLoadout,applyCommand,chooseBotCommand,getView,exampleOffers} from '../../src/game/index';
import type {Command,Loadout} from '../../src/game/types';
import {LocalBackend} from '../../src/local-backend';
import legacyRecord from '../fixtures/legacy-offer-record.json';
import type {MatchState} from '../../src/game/types';

const origin='https://players.example',password='long-test-password-2026';
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function fixture(vars:Record<string,string>={}){
 const directory=await mkdtemp(join(tmpdir(),'offer-workerd-'));
 const create=()=>new Miniflare({...convertV4MiniflareOptions({name:'offer-battle-test',modules:true,scriptPath:resolve('work/cloudflare-bundle/worker.js'),compatibilityDate:'2026-09-26',durableObjects:{ACCOUNTS:{className:'AccountRegistry',useSQLite:true},ROOMS:{className:'BattleRoom',useSQLite:true}},bindings:{ALLOWED_ORIGINS:origin,TURN_MS:'60000',SETUP_MS:'60000',...vars}}),resourcePersistencePath:directory,logRequests:false,unsafeInspectDurableObjects:true});
 let mf=create();
 async function api(path:string,token?:string,data?:unknown,method?:string,headers:Record<string,string>={}){
  const response=await mf.dispatchFetch('https://api.example'+path,{method:method??(data!==undefined?'POST':'GET'),headers:{'Content-Type':'application/json',Origin:origin,...(token?{Authorization:`Bearer ${token}`}:{ }),...headers},...(data===undefined?{}:{body:JSON.stringify(data)})});
  return {status:response.status,headers:response.headers,body:await response.json() as any};
 }
 async function register(username:string){const result=await api('/api/auth/register',undefined,{username,password,nickname:username});assert.equal(result.status,201,JSON.stringify(result.body));return result.body;}
 async function command(room:any,token:string,command:Command,commandId:string=crypto.randomUUID()) {return api(`/api/rooms/${room.room.id}/command`,token,{matchId:room.view.matchId,expectedStateVersion:room.view.version,commandId,type:command.type,payload:command});}
 async function friends(){const a=await register('alice'),b=await register('bravo');let room=(await api('/api/rooms',a.token,{mode:'friend'})).body;assert.match(room.room.id,/^cloud_/);await api('/api/rooms/join',b.token,{code:room.code});await api(`/api/rooms/${room.room.id}/ready`,a.token,{ready:true});room=(await api(`/api/rooms/${room.room.id}/ready`,b.token,{ready:true})).body;for(const type of ['SELECT_FLEX','MULLIGAN'])for(const token of [a.token,b.token]){room=(await api(`/api/rooms/${room.room.id}`,token)).body;const c=type==='SELECT_FLEX'?{type,flexIds:['F01','F04','F05']}:{type,cardIds:[]};const result=await command(room,token,c as Command);assert.equal(result.body.ok,true,JSON.stringify(result.body));}return {a,b,room:(await api(`/api/rooms/${room.room.id}`,a.token)).body};}
 return {get mf(){return mf;},api,register,command,friends,async restart(){await mf.dispose();mf=create();},async close(){await mf.dispose();await rm(directory,{recursive:true,force:true});}};
}

test('Cloudflare: account auth, recovery rotation, hashed credentials, CORS and guest rejection',async()=>{
 const f=await fixture();try{
  const health=await f.api('/healthz');assert.equal(health.body.rulesVersion,'2.0.0');assert.equal(health.body.offerCompilerVersion,'2.1.0');
  for(const path of ['/api/profile','/api/matches','/api/rooms/cloud_missing']){const result=await f.api(path);assert.equal(result.status,401);assert.equal(result.body.errorCode,'AUTH_REQUIRED');}
  const preflight=await f.mf.dispatchFetch('https://api.example/api/auth/register',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}});assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),origin);
  assert.equal((await f.api('/api/auth/register',undefined,{},undefined,{Origin:'https://players.example.evil'})).status,403);
  const a=await f.register('Case_User');assert.equal(a.account.username,'case_user');assert.ok(a.recoveryKey);assert.equal((await f.api('/api/auth/register',undefined,{username:'case_user',password})).status,409);
  assert.equal((await f.api('/api/auth/login',undefined,{username:'case_user',password:'incorrect-password'})).status,401);
  const login=await f.api('/api/auth/login',undefined,{username:'CASE_USER',password});assert.equal(login.status,200);assert.equal(login.body.recoveryKey,undefined);
  const store=await f.mf.unsafeGetDurableObjectStorage('offer-battle-test','AccountRegistry',{name:'registry'}),users=await store.exec('SELECT password_hash,recovery_hash FROM users');assert.notEqual(users[0].password_hash,password);assert.notEqual(users[0].recovery_hash,a.recoveryKey);assert.equal((await store.exec('SELECT hash FROM sessions')).some(row=>row.hash===a.token),false);
  const recovered=await f.api('/api/auth/recover',undefined,{username:'case_user',recoveryKey:a.recoveryKey,newPassword:'a-new-long-password'});assert.equal(recovered.status,200);assert.notEqual(recovered.body.recoveryKey,a.recoveryKey);assert.equal((await f.api('/api/profile',a.token)).status,401);assert.equal((await f.api('/api/auth/recover',undefined,{username:'case_user',recoveryKey:a.recoveryKey,newPassword:password})).status,401);
  assert.equal((await f.api('/api/auth/logout',recovered.body.token,{})).status,200);assert.equal((await f.api('/api/profile',recovered.body.token)).status,401);
  for(let i=0;i<11;i++)await f.api('/api/auth/login',undefined,{username:'missing_user',password});assert.equal((await f.api('/api/auth/login',undefined,{username:'missing_user',password})).status,429);
 }finally{await f.close();}
});

test('Cloudflare: two registered friends play to completion, private views, idempotence, saved replay and rematch',async()=>{
 const f=await fixture();try{
  const {a,b,room:initial}=await f.friends(),third=await f.register('charlie');let room=initial;
  assert.equal(room.view.phase,'playing');assert.equal(room.view.players[1].hand.length,0);assert.equal(room.view.rngState,undefined);assert.equal((await f.api(`/api/rooms/${room.room.id}`,third.token)).status,403);
  const token=room.view.activePlayerId==='p1'?a.token:b.token;room=(await f.api(`/api/rooms/${room.room.id}`,token)).body;const c={type:'END_TURN'} as Command;
  const answers=await Promise.all([f.command(room,token,c,'same'),f.command(room,token,c,'same')]);const first=answers.find(a=>!a.body.duplicate)!,second=answers.find(a=>a.body.duplicate)!;assert.equal(first.body.ok,true);assert.equal(second.body.duplicate,true);assert.equal(first.body.view.version,second.body.view.version);
  assert.equal((await f.command(room,token,{type:'CONCEDE'},'same')).status,409);
  assert.equal((await f.command(room,token,c,'new')).body.errorCode,'STALE_VERSION');
  room=(await f.api(`/api/rooms/${room.room.id}`,a.token)).body;
  for(let i=0;i<400&&room.view.phase!=='finished';i++){
   const token=room.view.activePlayerId==='p1'?a.token:b.token;room=(await f.api(`/api/rooms/${room.room.id}`,token)).body;const command=chooseBotCommand(room.view);const next=await f.command(room,token,command);assert.equal(next.body.ok,true,JSON.stringify(next.body));room=next.body;
  }
  assert.equal(room.view.phase,'finished');assert.ok(room.view.version>20);
  const replay=await f.api(`/api/rooms/${room.room.id}/replay`,a.token);assert.equal(replay.body.verified,true);assert.ok(replay.body.frames.length>20);assert.equal(replay.body.frames.every((v:any)=>v.players[1].hand.length===0),true);
  const saved=await f.api('/api/matches',a.token,{roomId:room.room.id});assert.equal(saved.status,201);assert.equal(saved.body.match.source,'friend');assert.equal((await f.api('/api/matches',a.token,{roomId:room.room.id})).body.duplicate,true);
  assert.equal((await f.api('/api/matches',third.token,{roomId:room.room.id})).status,403);assert.equal((await f.api(`/api/matches/${saved.body.match.id}`,third.token)).status,404);
  assert.equal((await f.api('/api/matches',a.token)).body.matches.length,1);assert.equal((await f.api(`/api/matches/${saved.body.match.id}`,a.token)).body.verified,true);
  const oldMatch=room.view.matchId;await f.api(`/api/rooms/${room.room.id}/rematch`,a.token,{});const ready=await f.api(`/api/rooms/${room.room.id}/ready`,b.token,{ready:true});assert.notEqual(ready.body.view.matchId,oldMatch);
  assert.equal((await f.api(`/api/rooms/${room.room.id}/replay?matchId=${oldMatch}`,a.token)).body.verified,true);
  await f.restart();assert.equal((await f.api(`/api/matches/${saved.body.match.id}`,a.token)).body.verified,true);assert.equal((await f.api(`/api/rooms/${room.room.id}`,a.token)).body.view.matchId,ready.body.view.matchId);
  assert.equal((await f.api(`/api/matches/${saved.body.match.id}`,a.token,undefined,'DELETE')).status,200);assert.equal((await f.api('/api/matches',a.token)).body.matches.length,0);
 }finally{await f.close();}
});

test('Cloudflare: hibernating sockets preserve seats, hidden views and reject revoked sessions',async()=>{
 const f=await fixture();try{
  const {a,b,room}=await f.friends();
  const response=await f.mf.dispatchFetch(`https://api.example/ws?roomId=${room.room.id}&token=${a.token}`,{headers:{Upgrade:'websocket',Origin:origin}});assert.equal(response.status,101);
  const ws=response.webSocket!;const messages:string[]=[];ws.addEventListener('message',event=>messages.push(String(event.data)));ws.accept();
  await pause(50);assert.ok(messages.some(m=>JSON.parse(m).playerId==='p1'));
  await f.mf.unsafeEvictDurableObject('offer-battle-test','BattleRoom',{name:room.room.id,webSockets:'hibernate'});
  ws.send('ping');await pause(50);assert.ok(messages.includes('pong'));
  ws.send(JSON.stringify({type:'reconnect'}));await pause(100);const state=JSON.parse(messages.filter(m=>m!=='pong').at(-1)!);assert.equal(state.playerId,'p1');assert.equal(state.view.players[1].hand.length,0);
  const closed=new Promise<number>(resolve=>ws.addEventListener('close',e=>resolve(e.code)));
  await f.api('/api/auth/logout',a.token,{});ws.send(JSON.stringify({type:'reconnect'}));assert.equal(await closed,1008);
  const denied=await f.mf.dispatchFetch(`https://api.example/ws?roomId=${room.room.id}&token=${b.token}`,{headers:{Upgrade:'websocket',Origin:'https://evil.invalid'}});assert.equal(denied.status,403);
 }finally{await f.close();}
});

test('Cloudflare: alarm advances idle turns and waiting rooms expire without polling',async()=>{
 const f=await fixture({SETUP_MS:'50',TURN_MS:'70',WAITING_RETENTION_MS:'100'});try{
  const a=await f.register('alarm_alice'),b=await f.register('alarm_bravo');let room=(await f.api('/api/rooms',a.token,{mode:'friend'})).body;
  await f.api('/api/rooms/join',b.token,{code:room.code});await f.api(`/api/rooms/${room.room.id}/ready`,a.token,{ready:true});await f.api(`/api/rooms/${room.room.id}/ready`,b.token,{ready:true});
  // A genuine workerd Alarm wakes the room without GETs or a JS interval.
  await pause(1600);room=(await f.api(`/api/rooms/${room.room.id}`,a.token)).body;assert.equal(room.view.phase,'finished');assert.match(room.view.result.reason,/两个回合/);
  const waiting=(await f.api('/api/rooms',a.token,{mode:'friend'})).body;await pause(800);assert.equal((await f.api(`/api/rooms/${waiting.room.id}`,a.token)).status,404);
 }finally{await f.close();}
});

test('Cloudflare: local records validate the full initial state and commands; custom Offers recompile',async()=>{
 const f=await fixture();try{
  const a=await f.register('local_alice'),loadouts=[defaultLoadout('p1','本地玩家',5),defaultLoadout('p2','练习对手',6)] as [Loadout,Loadout],seed=17,initialState=createMatch(loadouts,seed,{skipSetup:true,matchId:'local_verified'}),command={type:'CONCEDE',commandId:'local-concede'} as Command;
  const record={initialState,journal:[{actorId:'p1',command}],seed,loadouts,skipSetup:true};
  const saved=await f.api('/api/matches',a.token,{record});assert.equal(saved.status,201,JSON.stringify(saved.body));assert.equal(saved.body.match.source,'local');
  const tampered=structuredClone(record);tampered.initialState.players[0].mind=999;assert.equal((await f.api('/api/matches',a.token,{record:tampered})).status,400);
  const illegal=structuredClone(record);illegal.journal[0].command={type:'ATTACK',cardId:'not-a-card',targetId:'p2'};assert.equal((await f.api('/api/matches',a.token,{record:illegal})).status,400);
  const unfinished={...record,journal:[]};assert.equal((await f.api('/api/matches',a.token,{record:unfinished})).status,400);
  const custom=structuredClone(exampleOffers[0]);custom.id='local_custom';custom.baseAttack=999;custom.baseHealth=999;loadouts[0].offers[0]=custom;
  const created=await f.api('/api/rooms',a.token,{mode:'friend',loadout:loadouts[0]});assert.equal(created.status,201);
  const profile=(await f.api('/api/profile',a.token)).body;assert.equal(profile.offers[0].id,'local_custom');assert.notEqual(profile.offers[0].baseAttack,999);assert.notEqual(profile.offers[0].baseHealth,999);
  const memory=()=>{const values=new Map<string,string>();return {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};};
  const local=new LocalBackend({persistentStorage:memory(),transientStorage:memory(),autoTick:false});
  try{const offer=local.request('/api/offers',{profile:exampleOffers[0].profile},'POST').offer,loadout=defaultLoadout('p1','本地玩家',5);loadout.offers[0]=offer;
   let room=local.request('/api/rooms',{mode:'bot',training:true,skipSetup:true,loadout},'POST');
   room=local.request(`/api/rooms/${room.room.id}/command`,{type:'CONCEDE',commandId:'save-custom',matchId:room.view.matchId,expectedStateVersion:room.view.version},'POST');
   const saved=await f.api('/api/matches',a.token,{record:local.getReplay(room.room.id)});assert.equal(saved.status,201,JSON.stringify(saved.body));
  }finally{local.dispose();}
 }finally{await f.close();}
});

test('Cloudflare: concurrent readiness starts exactly one match and keeps its deadline',async()=>{
 const f=await fixture();try{
  const a=await f.register('concurrent_a'),b=await f.register('concurrent_b');const room=(await f.api('/api/rooms',a.token,{mode:'friend'})).body;await f.api('/api/rooms/join',b.token,{code:room.code});
  const results=await Promise.all([f.api(`/api/rooms/${room.room.id}/ready`,a.token,{ready:true}),f.api(`/api/rooms/${room.room.id}/ready`,b.token,{ready:true})]);assert.equal(results.every(r=>r.status===200),true);
  const latest=(await f.api(`/api/rooms/${room.room.id}`,a.token)).body;assert.equal(latest.room.status,'playing');assert.equal(latest.view.phase,'flex');assert.ok(latest.room.deadline>Date.now());assert.ok(latest.room.deadline<Date.now()+61000);
  const store=await f.mf.unsafeGetDurableObjectStorage('offer-battle-test','BattleRoom',{name:room.room.id});assert.equal((await store.exec('SELECT id FROM games')).length,1);
  await f.restart();assert.equal((await f.api(`/api/rooms/${room.room.id}`,b.token)).body.view.matchId,latest.view.matchId);
 }finally{await f.close();}
});

test('Cloudflare: 2.0 history imports unchanged, persisted collections and both rematch seats upgrade to 2.1',async()=>{
 const f=await fixture();try{
  const a=await f.register('legacy_alice'),b=await f.register('legacy_bravo');
  const imported=await f.api('/api/matches',a.token,{record:legacyRecord});assert.equal(imported.status,201,JSON.stringify(imported.body));
  const importedReplay=(await f.api(`/api/matches/${imported.body.match.id}`,a.token)).body;
  assert.equal(importedReplay.verified,true);assert.equal(importedReplay.frames.length,49);assert.equal(importedReplay.frames[0].players[0].offerZone[0].definition.baseAttack,7);
  for(const version of ['999.0.0','2.1.0']){
   const bad=structuredClone(legacyRecord);bad.loadouts[0].offers[0].rulesVersion=version;
   assert.equal((await f.api('/api/matches',a.token,{record:bad})).status,400);
  }
  const combat=structuredClone(legacyRecord);combat.initialState.rulesVersion='999.0.0';assert.equal((await f.api('/api/matches',a.token,{record:combat})).status,400);
  const reserved=structuredClone(legacyRecord);reserved.loadouts[0].offers[0].id='E999';assert.equal((await f.api('/api/matches',a.token,{record:reserved})).status,400);
  const registry=await f.mf.unsafeGetDurableObjectStorage('offer-battle-test','AccountRegistry',{name:'registry'});
  const profileKey='profile:'+a.account.id,profile=JSON.parse((await registry.exec<{value:string}>('SELECT value FROM documents WHERE key=? ORDER BY part',profileKey)).map(row=>row.value).join(''));
  profile.offers=[legacyRecord.loadouts[0].offers[0]];profile.loadout=legacyRecord.loadouts[0];
  await registry.exec('DELETE FROM documents WHERE key=?',profileKey);await registry.exec('INSERT INTO documents VALUES (?,?,?)',profileKey,0,JSON.stringify(profile));
  const upgraded=(await f.api('/api/profile',a.token)).body;assert.equal(upgraded.offers[0].rulesVersion,'2.1.0');assert.equal(upgraded.loadout.offers.every((o:any)=>o.rulesVersion==='2.1.0'),true);
  const created=(await f.api('/api/rooms',a.token,{mode:'friend'})).body;await f.api('/api/rooms/join',b.token,{code:created.code});
  const store=await f.mf.unsafeGetDurableObjectStorage('offer-battle-test','BattleRoom',{name:created.room.id});
  const room=JSON.parse((await store.exec<{value:string}>('SELECT value FROM documents WHERE key=? ORDER BY part','room')).map(row=>row.value).join(''));
  room.seats.forEach((seat:any,i:number)=>seat.loadout=legacyRecord.loadouts[i]);
  const friendInitial=structuredClone(legacyRecord.initialState) as MatchState;friendInitial.matchId='cloud_legacy_golden';
  let state=friendInitial;
  for(const [index,entry]of legacyRecord.journal.entries()){
   state=applyCommand(state,entry.actorId,entry.command as Command).state;
   await store.exec('INSERT INTO journal VALUES (?,?,?)',state.matchId,index+1,JSON.stringify(entry));
  }
  Object.assign(room,{status:'finished',matchId:state.matchId,deadline:null});
  for(const [key,value]of [['room',room],['initial:'+state.matchId,friendInitial],['state:'+state.matchId,state]] as [string,unknown][]){await store.exec('DELETE FROM documents WHERE key=?',key);await store.exec('INSERT INTO documents VALUES (?,?,?)',key,0,JSON.stringify(value));}
  await store.exec('INSERT INTO games VALUES (?,?)',state.matchId,Date.now()-1000);
  const path=`/api/rooms/${room.id}`,before=(await f.api(path+'/replay',a.token)).body;
  assert.equal(before.verified,true);assert.equal(before.frames[0].players[0].offerZone[0].definition.rulesVersion,'2.0.0');
  const friendSaved=await f.api('/api/matches',a.token,{roomId:room.id});assert.equal(friendSaved.status,201);assert.equal(friendSaved.body.match.source,'friend');
  await f.api(path+'/rematch',a.token,{});const rematch=await f.api(path+'/ready',b.token,{ready:true});assert.equal(rematch.status,200);
  for(const player of rematch.body.view.players)assert.equal(player.offerZone.every((o:any)=>o.definition.rulesVersion==='2.1.0'),true);
  const old=(await f.api(path+'/replay?matchId='+state.matchId,a.token)).body;assert.equal(old.verified,true);assert.deepEqual(old.frames,before.frames);
  await f.restart();
  assert.deepEqual((await f.api(`/api/matches/${friendSaved.body.match.id}`,a.token)).body.frames,before.frames);
  assert.deepEqual((await f.api(`/api/matches/${imported.body.match.id}`,a.token)).body.frames,importedReplay.frames);
 }finally{await f.close();}
});
