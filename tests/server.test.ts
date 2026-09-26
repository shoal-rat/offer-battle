import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WebSocket} from 'ws';
import {startServer} from '../server/index.js';
import {chooseBotCommand,exampleOffers,compileOffer,applyCommand} from '../src/game/index.js';
import {AtomicStore} from '../server/storage.js';
import legacyRecord from './fixtures/legacy-offer-record.json';
import type {Command,MatchState} from '../src/game/types';

const pause=(ms=15)=>new Promise(r=>setTimeout(r,ms));
async function fixture(extra:Parameters<typeof startServer>[0]={}){
 const dataDir=await mkdtemp(join(tmpdir(),'offer-server-'));
 const app=await startServer({port:0,host:'127.0.0.1',dataDir,botDelayMs:2,tickMs:10,...extra});
 async function api(path:string,token?:string,method='GET',body?:unknown){const response=await fetch(app.url+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json() as any};}
 const session=async(name:string)=>(await api('/api/session',undefined,'POST',{nickname:name})).body;
 return {app,dataDir,api,session,async close(){await app.close();await rm(dataDir,{recursive:true,force:true});}};
}
async function friends(f:Awaited<ReturnType<typeof fixture>>){const a=await f.session('甲同学'),b=await f.session('乙同学');const create=(await f.api('/api/rooms',a.token,'POST',{mode:'friend'})).body;await f.api('/api/rooms/join',b.token,'POST',{code:create.code});await f.api(`/api/rooms/${create.roomId}/ready`,a.token,'POST',{ready:true});await f.api(`/api/rooms/${create.roomId}/ready`,b.token,'POST',{ready:true});return {a,b,roomId:create.roomId,code:create.code};}
async function setup(f:Awaited<ReturnType<typeof fixture>>,roomId:string,tokens:string[]){for(const type of ['SELECT_FLEX','MULLIGAN'])for(const token of tokens){const state=(await f.api(`/api/rooms/${roomId}`,token)).body;const command=type==='SELECT_FLEX'?{type,flexIds:['F01','F04','F05']}:{type,cardIds:[]};const result=await f.api(`/api/rooms/${roomId}/command`,token,'POST',{...command,expectedStateVersion:state.view.version,matchId:state.view.matchId,commandId:crypto.randomUUID()});assert.equal(result.body.ok,true,JSON.stringify(result.body));}}

test('friend HTTP: readiness, hidden setup, authenticated seats, stale versions, idempotence and replay',async()=>{const f=await fixture({turnMs:30000});try{
 const {a,b,roomId,code}=await friends(f),third=await f.session('第三人');
 assert.equal((await f.api('/api/rooms/join',third.token,'POST',{code})).status,409);
 assert.equal((await f.api(`/api/rooms/${roomId}`,third.token)).status,403);
 assert.equal((await f.api(`/api/rooms/${roomId}`)).status,401);
 await setup(f,roomId,[a.token,b.token]);
 const one=(await f.api(`/api/rooms/${roomId}`,a.token)).body,two=(await f.api(`/api/rooms/${roomId}`,b.token)).body;
 assert.equal(one.view.phase,'playing');assert.equal(one.view.players.find((p:any)=>p.id==='p2').hand.length,0);
 assert.equal(two.view.players.find((p:any)=>p.id==='p1').hand.length,0);assert.equal(one.view.rngState,undefined);
 const raw=JSON.parse(await readFile(join(f.dataDir,'server.json'),'utf8'));
 const hidden=raw.rooms[roomId].state.players.find((p:any)=>p.id==='p2').hand;
 for(const card of hidden)assert.equal(JSON.stringify(one).includes(card.id),false,`hidden card ${card.id} leaked`);
 const active=one.view.activePlayerId==='p1'?a:b;
 const command={type:'END_TURN',commandId:'same-command',matchId:one.view.matchId,expectedStateVersion:one.view.version,playerId:one.view.activePlayerId==='p1'?'p2':'p1'};
 const answers=await Promise.all([f.api(`/api/rooms/${roomId}/command`,active.token,'POST',command),f.api(`/api/rooms/${roomId}/command`,active.token,'POST',command)]);
 assert.equal(answers[0].body.ok,true);assert.equal(answers[1].body.duplicate,true);assert.equal(answers[0].body.view.version,answers[1].body.view.version);
 const reordered=await f.api(`/api/rooms/${roomId}/command`,active.token,'POST',{expectedStateVersion:command.expectedStateVersion,playerId:command.playerId,matchId:command.matchId,commandId:command.commandId,type:command.type});assert.equal(reordered.body.duplicate,true);
 const wrongMatch=await f.api(`/api/rooms/${roomId}/command`,active.token,'POST',{...command,commandId:'old-match',matchId:'match_previous'});assert.equal(wrongMatch.status,409);
 const stale=await f.api(`/api/rooms/${roomId}/command`,active.token,'POST',{...command,commandId:'new-id'});assert.equal(stale.body.errorCode,'STALE_VERSION');
 const forbidden=await f.api(`/api/rooms/${roomId}/command`,active.token,'POST',{type:'TIMEOUT',commandId:'spoof',expectedStateVersion:answers[0].body.view.version});assert.equal(forbidden.status,403);
 const replay=(await f.api(`/api/rooms/${roomId}/replay`,a.token)).body;assert.equal(replay.verified,true);assert.ok(replay.frames.length>=6);assert.equal(JSON.stringify(replay).includes('rngState'),false);
 }finally{await f.close();}});

test('WebSocket: independent sessions receive private views, reconnect retains seat and deadline',async()=>{const f=await fixture();try{
 const {a,b,roomId}=await friends(f);await setup(f,roomId,[a.token,b.token]);
 const connect=(token:string)=>new Promise<{socket:WebSocket;state:any}>(resolve=>{const socket=new WebSocket(f.app.url.replace('http:','ws:')+`/ws?token=${token}&roomId=${roomId}`);socket.once('message',raw=>resolve({socket,state:JSON.parse(String(raw))}));});
 const first=await connect(a.token),second=await connect(b.token);assert.equal(first.state.playerId,'p1');assert.equal(second.state.playerId,'p2');assert.equal(first.state.view.players[1].hand.length,0);const deadline=first.state.room.deadline;first.socket.close();await pause(20);const again=await connect(a.token);assert.equal(again.state.playerId,'p1');assert.equal(again.state.room.deadline,deadline);again.socket.close();second.socket.close();
 }finally{await f.close();}});

test('zero-key Offer compilation and profile persistence, failed generation remains retryable',async()=>{const f=await fixture();try{
 const a=await f.session('收藏同学');const input=structuredClone(exampleOffers[0].profile!);input.company_display_name='<script>alert(1)</script>';
 const missing={...input,annual_equity_cny:null};assert.equal((await f.api('/api/offers',a.token,'POST',{profile:missing})).status,400);
 const created=await f.api('/api/offers',a.token,'POST',{profile:input,benefitId:null});assert.equal(created.status,201);assert.equal(created.body.offer.baseAttack,compileOffer(input).baseAttack);
 await pause(60);const profile=(await f.api('/api/profile',a.token)).body;assert.equal(profile.offers.length,1);assert.equal(profile.offers[0].company,input.company_display_name);
 const started=await f.api(`/api/offers/${created.body.offer.id}/appearance`,a.token,'POST',{stage:'image'});await pause(50);const job=(await f.api(`/api/generation/jobs/${started.body.job.id}`,a.token)).body.job;assert.equal(job.state,'failed');assert.match(job.error,/本地角色/);assert.equal((await f.api('/api/profile',a.token)).body.offers.length,1);
 assert.equal((await f.api(`/api/generation/jobs/${job.id}/retry`,a.token,'POST',{})).status,200);
 assert.equal((await f.api('/api/session',undefined,'POST',{token:a.token})).body.profile.offers.length,1);
 }finally{await f.close();}});

test('server restart restores snapshot, room membership and filtered replay',async()=>{const f=await fixture({turnMs:60000});let second:Awaited<ReturnType<typeof startServer>>|undefined;try{
 const {a,b,roomId}=await friends(f);await setup(f,roomId,[a.token,b.token]);const before=(await f.api(`/api/rooms/${roomId}`,a.token)).body;await f.app.close();
 second=await startServer({port:0,host:'127.0.0.1',dataDir:f.dataDir,turnMs:60000});const response=await fetch(`${second.url}/api/rooms/${roomId}`,{headers:{Authorization:`Bearer ${a.token}`}});const after=await response.json() as any;assert.equal(after.view.version,before.view.version);assert.equal(after.room.deadline,before.room.deadline);assert.equal(after.playerId,'p1');
 }finally{if(second)await second.close();await rm(f.dataDir,{recursive:true,force:true});}});

test('server deadlines default hidden choices and two inactive turns lose',async()=>{const f=await fixture({turnMs:60,setupMs:30});try{
 const {a,roomId}=await friends(f);let state:any;for(let i=0;i<100;i++){await pause(15);state=(await f.api(`/api/rooms/${roomId}`,a.token)).body;if(state.room.status==='finished')break;}
 assert.equal(state.view.phase,'finished');assert.match(state.view.result.reason,/两个回合/);assert.equal(state.room.deadline,null);
 }finally{await f.close();}});

test('all three bot strategies finish a real zero-key HTTP match and replay verifies',async()=>{for(const strategy of ['aggressive','control','growth']){const f=await fixture({turnMs:60000});try{
 const a=await f.session('实战测试'),create=(await f.api('/api/rooms',a.token,'POST',{mode:'bot',strategy,skipSetup:true,training:true})).body;let state=create;
 for(let step=0;step<1200&&state.view.phase!=='finished';step++){
   if(state.view.activePlayerId==='p1'){const command=chooseBotCommand(state.view,'aggressive');if(command){const response=await f.api(`/api/rooms/${create.roomId}/command`,a.token,'POST',{...command,expectedStateVersion:state.view.version,matchId:state.view.matchId,commandId:crypto.randomUUID()});assert.equal(response.body.ok,true,response.body.rejection);state=response.body;continue;}}
   await pause(12);state=(await f.api(`/api/rooms/${create.roomId}`,a.token)).body;
 }
 assert.equal(state.view.phase,'finished',strategy);assert.ok(state.view.result);const replay=(await f.api(`/api/rooms/${create.roomId}/replay`,a.token)).body;assert.equal(replay.verified,true);assert.ok(replay.frames.length>20);
 }finally{await f.close();}}});

test('atomic storage recovers backup without silently resetting corrupt saves',async()=>{const dir=await mkdtemp(join(tmpdir(),'offer-storage-'));try{const store=new AtomicStore(dir,()=>({value:0}));await store.write({value:1});await store.write({value:2});await writeFile(join(dir,'server.json'),'{bad');assert.deepEqual(await store.read(),{value:1});await writeFile(join(dir,'server.json.bak'),'{bad');await assert.rejects(store.read(),/损坏/);}finally{await rm(dir,{recursive:true,force:true});}});

test('static hosting blocks private data, environment and server sources',async()=>{const f=await fixture();try{for(const path of ['/data/server.json','/.env','/server/index.ts','/spec/example_offers.json'])assert.equal((await fetch(f.app.url+path)).status,404);assert.equal((await f.api('/healthz')).body.ok,true);}finally{await f.close();}});

test('network trust boundary rejects cross-origin WebSockets and ignores forged Offer numbers',async()=>{const f=await fixture();try{
 const a=await f.session('边界测试');const forged=structuredClone(exampleOffers.slice(0,3));forged[0].baseAttack=999;forged[0].originalTime=0;
 const room=(await f.api('/api/rooms',a.token,'POST',{mode:'bot',skipSetup:true,training:true,loadout:{offers:forged}})).body;
 assert.equal(room.view.players[0].offerZone[0].definition.baseAttack,exampleOffers[0].baseAttack);assert.equal(room.view.players[0].offerZone[0].definition.originalTime,exampleOffers[0].originalTime);
 const rejection=await new Promise<number>((resolve,reject)=>{const socket=new WebSocket(f.app.url.replace('http:','ws:')+`/ws?token=${a.token}&roomId=${room.roomId}`,{origin:'https://untrusted.invalid'});socket.on('unexpected-response',(_req,res)=>{resolve(res.statusCode??0);res.resume();socket.terminate();});socket.on('open',()=>{socket.close();reject(Error('Cross-origin socket was accepted'));});socket.on('error',()=>{});});assert.equal(rejection,403);
 const response=await fetch(f.app.url+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:'null'});assert.equal(response.status,400);
 }finally{await f.close();}});

test('explicit practice fixtures are isolated from friend matches and replay through normal commands',async()=>{const f=await fixture();try{
 const a=await f.session('场景练习');assert.equal((await f.api('/api/rooms',a.token,'POST',{mode:'friend',training:true,practiceScenario:'SC01'})).status,400);
 const created=await f.api('/api/rooms',a.token,'POST',{mode:'bot',training:true,practiceScenario:'SC01'});assert.equal(created.status,201);let room=created.body;assert.equal(room.room.scenario.id,'SC01');assert.equal(room.room.deadline,null);
 const primary=room.view.legalActions.find((c:any)=>c.type==='USE_PRIMARY');assert.ok(primary?.targetId);room=(await f.api(`/api/rooms/${room.room.id}/command`,a.token,'POST',{...primary,commandId:crypto.randomUUID(),expectedStateVersion:room.view.version,matchId:room.view.matchId})).body;assert.equal(room.ok,true);assert.equal(room.view.players[0].education.jluUltimateUsed,true);const replay=(await f.api(`/api/rooms/${room.room.id}/replay`,a.token)).body;assert.equal(replay.verified,true);
 }finally{await f.close();}});

test('custom job names and validated rule archetype overrides preserve future Offer support',async()=>{const f=await fixture();try{
 const a=await f.session('自定义岗位'),profile={...structuredClone(exampleOffers[0].profile!),card_display_name:'实验室AI顾问',role_title:'新兴职业测试岗',role_family:'unlisted_role',industry:'other'};
 const invalid=await f.api('/api/offers',a.token,'POST',{profile:{...profile,selected_template_id:'T99'}});assert.equal(invalid.status,400);assert.equal((await f.api('/api/profile',a.token)).body.offers.length,0);
 const automatic=await f.api('/api/offers',a.token,'POST',{profile});assert.equal(automatic.status,201);assert.equal(automatic.body.offer.templateId,'T00');assert.equal(automatic.body.offer.name,'实验室AI顾问');
 const explicit=await f.api('/api/offers',a.token,'POST',{profile:{...profile,selected_template_id:'T09'}});assert.equal(explicit.status,201);assert.equal(explicit.body.offer.templateId,'T09');assert.equal(explicit.body.offer.annualPackage,automatic.body.offer.annualPackage);
 }finally{await f.close();}});

test('Node restart upgrades 2.0 collections and both rematch seats while preserving archived replay',async()=>{
 const f=await fixture({turnMs:60000});let restarted:Awaited<ReturnType<typeof startServer>>|undefined;
 try{
  const {a,b,roomId}=await friends(f);await f.app.close();
  const db=JSON.parse(await readFile(join(f.dataDir,'server.json'),'utf8')),room=db.rooms[roomId];
  let state=structuredClone(legacyRecord.initialState) as MatchState;
  for(const entry of legacyRecord.journal)state=applyCommand(state,entry.actorId,entry.command as Command).state;
  room.seats.forEach((seat:any,i:number)=>seat.loadout=legacyRecord.loadouts[i]);
  Object.assign(room,{initialState:legacyRecord.initialState,state,journal:legacyRecord.journal,status:'finished',deadline:null,receipts:{}});
  db.profiles[a.profile.id].offers=[legacyRecord.loadouts[0].offers[0]];db.profiles[a.profile.id].loadout=legacyRecord.loadouts[0];
  await writeFile(join(f.dataDir,'server.json'),JSON.stringify(db));
  restarted=await startServer({port:0,host:'127.0.0.1',dataDir:f.dataDir,turnMs:60000});
  const api=async(path:string,token:string,body?:unknown)=>{const response=await fetch(restarted!.url+path,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});assert.equal(response.status,200);return response.json() as Promise<any>};
  const profile=await api('/api/profile',a.token);assert.equal(profile.offers[0].rulesVersion,'2.1.0');assert.equal(profile.loadout.offers.every((o:any)=>o.rulesVersion==='2.1.0'),true);
  const replay=await api(`/api/rooms/${roomId}/replay`,a.token);assert.equal(replay.verified,true);assert.equal(replay.frames[0].players[0].offerZone[0].definition.rulesVersion,'2.0.0');
  await api(`/api/rooms/${roomId}/rematch`,a.token,{});const rematch=await api(`/api/rooms/${roomId}/ready`,b.token,{ready:true});
  for(const player of rematch.view.players)assert.equal(player.offerZone.every((o:any)=>o.definition.rulesVersion==='2.1.0'),true);
  const archived=await api(`/api/rooms/${roomId}/replay?matchId=${legacyRecord.initialState.matchId}`,a.token);assert.equal(archived.verified,true);assert.deepEqual(archived.frames,replay.frames);
 }finally{if(restarted)await restarted.close();else await f.app.close();await rm(f.dataDir,{recursive:true,force:true});}
});
