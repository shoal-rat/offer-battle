import {test} from 'node:test';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,mkdir,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AtomicStore} from '../server/storage';
import {startServer} from '../server/index';
import {exampleOffers} from '../src/game/offers';

test('atomic writes preserve invocation order, capture mutable data immediately, and retain one complete previous snapshot',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'offer-atomic-order-'));try{
  const store=new AtomicStore(dir,()=>({revision:-1,payload:''})),value={revision:0,payload:''},writes:Promise<void>[]=[];
  for(let n=0;n<32;n++){value.revision=n;value.payload='x'.repeat(n%2?100:100000);writes.push(store.write(value));}
  value.revision=999;await Promise.all(writes);assert.equal((await store.read()).revision,31);assert.equal(JSON.parse(await readFile(join(dir,'server.json.bak'),'utf8')).revision,30);assert.deepEqual((await readdir(dir)).sort(),['server.json','server.json.bak']);
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('atomic write errors reach the caller and do not poison a subsequent explicit retry',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'offer-atomic-error-'));try{
  const store=new AtomicStore(dir,()=>({revision:0}));await mkdir(store.file);await assert.rejects(store.write({revision:1}));await rm(store.file,{recursive:true});await store.write({revision:2});assert.equal((await store.read()).revision,2);assert.deepEqual(await readdir(dir),['server.json']);
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('server shutdown cancels queued generation and persists a retryable job without recreating removed data',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'offer-shutdown-jobs-'));const app=await startServer({port:0,host:'127.0.0.1',dataDir:dir});let closed=false;try{
  const post=async(path:string,body:unknown,token?:string)=>fetch(app.url+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)}).then(r=>r.json()) as Promise<any>;
  const session=await post('/api/session',{}),saved=await post('/api/offers',{profile:exampleOffers[0].profile},session.token),job=await post(`/api/offers/${saved.offer.id}/appearance`,{stage:'image'},session.token);
  await app.close();closed=true;const db=JSON.parse(await readFile(join(dir,'server.json'),'utf8'));assert.equal(db.jobs[job.job.id].state,'failed');assert.equal(db.profiles[session.profile.id].offers.length,1);
  await rm(dir,{recursive:true,force:true});await new Promise(resolve=>setTimeout(resolve,60));await assert.rejects(access(dir));
 }finally{if(!closed)await app.close();await rm(dir,{recursive:true,force:true})}
});

test('server shutdown aborts an in-flight remote generation and saves its retryable status', {timeout:6000},async()=>{
 const prior=process.env.TEXT_PROVIDER_URL;let arrived!:()=>void;const arrival=new Promise<void>(resolve=>arrived=resolve),provider=createServer(async(req,_res)=>{for await(const _chunk of req){}arrived();});
 await new Promise<void>(resolve=>provider.listen(0,'127.0.0.1',resolve));process.env.TEXT_PROVIDER_URL=`http://127.0.0.1:${(provider.address() as any).port}`;
 const dir=await mkdtemp(join(tmpdir(),'offer-shutdown-remote-'));let app:Awaited<ReturnType<typeof startServer>>|undefined,closed=false;
 try{
  app=await startServer({port:0,host:'127.0.0.1',dataDir:dir});const post=async(path:string,body:unknown,token?:string)=>fetch(app!.url+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)}).then(r=>r.json()) as Promise<any>;
  const session=await post('/api/session',{}),saved=await post('/api/offers',{profile:exampleOffers[0].profile},session.token),job=await post(`/api/offers/${saved.offer.id}/appearance`,{stage:'text'},session.token);await arrival;
  await app.close();closed=true;const db=JSON.parse(await readFile(join(dir,'server.json'),'utf8'));assert.equal(db.jobs[job.job.id].state,'failed');assert.match(db.jobs[job.job.id].error,/服务关闭/);assert.equal(db.profiles[session.profile.id].offers[0].persona.quote,saved.offer.persona.quote);
 }finally{if(app&&!closed)await app.close();provider.closeAllConnections();await new Promise<void>(resolve=>provider.close(()=>resolve()));await rm(dir,{recursive:true,force:true});if(prior===undefined)delete process.env.TEXT_PROVIDER_URL;else process.env.TEXT_PROVIDER_URL=prior;}
});
