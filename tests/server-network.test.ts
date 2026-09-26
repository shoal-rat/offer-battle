import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WebSocket,type ClientOptions} from 'ws';
import {startServer} from '../server/index.js';
import {networkPolicy} from '../server/network.js';

const origin='https://players.example';
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function fixture(extra:Parameters<typeof startServer>[0]={}) {
 const dataDir=await mkdtemp(join(tmpdir(),'offer-network-'));
 const app=await startServer({port:0,host:'127.0.0.1',dataDir,allowedOrigins:[origin],...extra});
 async function post(path:string,body:unknown={},token?:string,headers:Record<string,string>={}) {
  return fetch(app.url+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{ }),...headers},body:JSON.stringify(body)});
 }
 const session=async()=>(await (await post('/api/session',{nickname:'公网测试'})).json()) as {token:string};
 async function room(token:string){return await (await post('/api/rooms',{mode:'friend'},token)).json() as {roomId:string};}
 const wsUrl=(token:string,roomId:string)=>app.url.replace('http:','ws:')+`/ws?token=${encodeURIComponent(token)}&roomId=${roomId}`;
 return {app,dataDir,post,session,room,wsUrl,async close(){await app.close();await rm(dataDir,{recursive:true,force:true});}};
}
function connect(url:string,options:ClientOptions={}) {
 return new Promise<WebSocket>((resolve,reject)=>{const ws=new WebSocket(url,options);ws.once('message',()=>resolve(ws));ws.once('error',reject);});
}
function rejection(url:string,requestOrigin=origin) {
 return new Promise<number>((resolve,reject)=>{const ws=new WebSocket(url,{origin:requestOrigin});ws.on('unexpected-response',(_req,res)=>{resolve(res.statusCode??0);res.resume();ws.terminate();});ws.on('open',()=>{ws.close();reject(Error('Unexpected upgrade'));});ws.on('error',()=>{});});
}

test('network configuration rejects wildcard, malformed origin and invalid bounds',()=>{
 for(const value of ['*','null','https://players.example/','https://players.example/game','https://players.example?x=1'])assert.throws(()=>networkPolicy({allowedOrigins:[value]}),/exact/);
 assert.throws(()=>networkPolicy({sessionRateLimit:0}),/positive/);
 assert.throws(()=>networkPolicy({trustProxyHops:-1}),/nonnegative/);
});

test('Pages origin can preflight and authenticate; unknown origins and headers are rejected',async()=>{
 const f=await fixture();try{
  const headers={Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'Content-Type, Authorization'};
  const preflight=await fetch(f.app.url+'/api/session',{method:'OPTIONS',headers});
  assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),origin);assert.match(preflight.headers.get('access-control-allow-methods')!,/PATCH.*DELETE/);assert.equal(preflight.headers.get('access-control-allow-credentials'),null);
  const response=await f.post('/api/session',{nickname:'跨域访客'},undefined,{Origin:origin});assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),origin);const session=await response.json() as any;
  const profile=await fetch(f.app.url+'/api/profile',{headers:{Origin:origin,Authorization:`Bearer ${session.token}`}});assert.equal(profile.status,200);
  for(const denied of ['https://players.example.evil.test','http://players.example','null']){
   const response=await f.post('/api/session',{},undefined,{Origin:denied});assert.equal(response.status,403);assert.equal(response.headers.get('access-control-allow-origin'),null);
  }
  assert.equal((await fetch(f.app.url+'/api/profile',{method:'OPTIONS',headers:{...headers,'Access-Control-Request-Headers':'X-Arbitrary'}})).status,403);
  assert.equal((await f.post('/api/session',{},undefined,{Origin:f.app.url})).status,200,'local same-origin is retained');
 }finally{await f.close();}
});

test('generated art has cache-safe CORS for anonymous canvas export',async()=>{
 const f=await fixture();try{
  const name='job_00000000-0000-4000-8000-000000000001.png',bytes=Buffer.from([137,80,78,71,13,10,26,10]);
  await mkdir(join(f.dataDir,'generated'),{recursive:true});await writeFile(join(f.dataDir,'generated',name),bytes);
  const response=await fetch(`${f.app.url}/api/art/${name}`,{headers:{Origin:origin}});
  assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),origin);assert.equal(response.headers.get('vary'),'Origin');assert.equal(response.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
  const direct=await fetch(`${f.app.url}/api/art/${name}`);assert.equal(direct.headers.get('vary'),'Origin');assert.equal(direct.headers.get('access-control-allow-origin'),null);
 }finally{await f.close();}
});

test('WebSocket shares the HTTP origin policy and still authenticates the seat',async()=>{
 const f=await fixture();try{
  const {token}=await f.session(),room=await f.room(token),url=f.wsUrl(token,room.roomId);
  const ws=await connect(url,{origin});assert.equal(ws.readyState,WebSocket.OPEN);ws.close();
  assert.equal(await rejection(url,'https://players.example.attacker.invalid'),403);
  assert.equal(await rejection(f.wsUrl('invalid',room.roomId)),401);
 }finally{await f.close();}
});

test('entry quotas reject bursts, ignore untrusted forwarded IPs and recover after their window',async()=>{
 const f=await fixture({sessionRateLimit:2,roomRateLimit:1,rateWindowMs:120});try{
  const {token}=await f.session();assert.equal((await f.post('/api/session',{},undefined,{'X-Forwarded-For':'192.0.2.1'})).status,200);
  const denied=await f.post('/api/session',{},undefined,{'X-Forwarded-For':'192.0.2.2'});assert.equal(denied.status,429);assert.equal(denied.headers.get('retry-after'),'1');
  const room=await f.room(token);assert.ok(room.roomId);assert.equal((await f.post('/api/rooms',{mode:'friend'},token)).status,429);
  const ready=await f.post(`/api/rooms/${room.roomId}/ready`,{ready:true},token);assert.equal(ready.status,200,'normal play remains available after creation quota');
  await pause(130);assert.equal((await f.post('/api/session')).status,200);
 }finally{await f.close();}
});

test('WebSocket active connection and message quotas cannot bypass admission',async()=>{
 const f=await fixture({wsMaxPerSession:1,wsMessageRateLimit:2});try{
  const {token}=await f.session(),room=await f.room(token),url=f.wsUrl(token,room.roomId),ws=await connect(url,{origin});
  assert.equal(await rejection(url),429);
  const closed=new Promise<number>(resolve=>ws.once('close',code=>resolve(code)));
  ws.send(JSON.stringify({type:'ping'}));ws.send(JSON.stringify({type:'ping'}));ws.send(JSON.stringify({type:'ping'}));
  assert.equal(await closed,1008);
 }finally{await f.close();}
});

test('heartbeat preserves responsive players and removes half-open sockets',async()=>{
 const f=await fixture({heartbeatMs:35});try{
  const {token}=await f.session(),room=await f.room(token),url=f.wsUrl(token,room.roomId);
  const healthy=await connect(url,{origin}),silent=await connect(url,{origin,autoPong:false});
  const closed=new Promise<void>(resolve=>silent.once('close',()=>resolve()));
  await Promise.race([closed,pause(700).then(()=>{throw Error('Heartbeat did not clear stale socket');})]);
  assert.equal(healthy.readyState,WebSocket.OPEN);healthy.close();
 }finally{await f.close();}
});
