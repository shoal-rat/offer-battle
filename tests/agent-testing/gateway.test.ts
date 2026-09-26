import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import net from 'node:net';
import {mkdtemp,rm,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createGateway} from '../../scripts/agent-testing/gateway';

test('real browser gateway enforces novice tool isolation over MCP and saves actual screenshots, actions, video and trace',async()=>{
 let clicks=0;const app=createServer((req,res)=>{if(req.url==='/clicked'){clicks++;res.end('ok')}else{res.setHeader('Content-Type','text/html');res.end('<button style="position:absolute;left:20px;top:20px;width:100px;height:50px" onclick="fetch(\'/clicked\')">Test</button>')}});await new Promise<void>(r=>app.listen(0,'127.0.0.1',r));const target=`http://127.0.0.1:${(app.address() as any).port}/`,dir=await mkdtemp(join(tmpdir(),'offer-gateway-')),socketPath=join(tmpdir(),'qa-test-'+randomBytes(6).toString('hex')+'.sock');let gateway:Awaited<ReturnType<typeof createGateway>>|undefined,client:net.Socket|undefined;
 try{
  gateway=await createGateway({role:'A01',target,root:resolve('.'),privateDir:dir,socketPath,browser:'chromium',viewport:{width:600,height:400},touch:false,origins:[]});client=net.connect(socketPath);client.setEncoding('utf8');let buffer='',counter=0;const pending=new Map<number,(x:any)=>void>();client.on('data',chunk=>{buffer+=chunk;let n;while((n=buffer.indexOf('\n'))>=0){const r=JSON.parse(buffer.slice(0,n));buffer=buffer.slice(n+1);pending.get(r.id)?.(r);pending.delete(r.id)}});const request=(method:string,params:any={})=>new Promise<any>(resolve=>{const id=++counter;pending.set(id,resolve);client!.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n')});
  assert.ok((await request('initialize',{protocolVersion:'2024-11-05'})).result.capabilities.tools);const list=(await request('tools/list')).result.tools.map((t:any)=>t.name);assert.deepEqual(list,['screenshot','click','scroll','keyboard','currentUrl']);const denied=await request('tools/call',{name:'repoRead',arguments:{path:'src/App.tsx'}});assert.match(denied.error.message,/DENIED/);const shot=await request('tools/call',{name:'screenshot',arguments:{}});assert.ok(shot.result.content.some((c:any)=>c.type==='image'&&c.data.length>100));await request('tools/call',{name:'click',arguments:{x:60,y:40}});assert.equal(clicks,1);client.end();await gateway.close();gateway=undefined;const saved=JSON.parse(await readFile(join(dir,'gateway-session.json'),'utf8'));assert.equal(saved.actions,2);assert.equal(saved.nativeVideoObservation,false);assert.ok((await readdir(join(dir,'video'))).some(f=>f.endsWith('.webm')));assert.ok((await readFile(join(dir,'trace.zip'))).length>100);
 }finally{client?.destroy();await gateway?.close();app.closeAllConnections();await new Promise<void>(r=>app.close(()=>r()));await rm(dir,{recursive:true,force:true});await rm(socketPath,{force:true})}
});

test('every role gets only its authoritative tools, and WebKit gets a real independent touch context',async()=>{
 const {allowedTools,ROLES}=await import('../../scripts/agent-testing/policy');
 const app=createServer((_req,res)=>res.end('<main>Role fixture</main>'));await new Promise<void>(r=>app.listen(0,'127.0.0.1',r));const target=`http://127.0.0.1:${(app.address() as any).port}/`;
 try{for(const role of ROLES){const dir=await mkdtemp(join(tmpdir(),'offer-role-')),socketPath=join(tmpdir(),'qa-role-'+randomBytes(6).toString('hex')+'.sock');const gateway=await createGateway({role,target,root:resolve('.'),privateDir:dir,socketPath,browser:role==='A02'?'webkit':'chromium',viewport:{width:390,height:844},touch:role==='A02',origins:[]});const client=net.connect(socketPath);client.setEncoding('utf8');
 try{const reply=await new Promise<any>((resolve,reject)=>{let buffer='';client.on('error',reject);client.on('data',chunk=>{buffer+=chunk;const n=buffer.indexOf('\n');if(n>=0)resolve(JSON.parse(buffer.slice(0,n)))});client.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})+'\n')});assert.deepEqual(reply.result.tools.map((t:any)=>t.name),allowedTools(role));assert.ok(gateway.contextId);assert.ok(gateway.browserVersion);}finally{client.destroy();await gateway.close();await rm(dir,{recursive:true,force:true});await rm(socketPath,{force:true})}
 }}finally{app.closeAllConnections();await new Promise<void>(r=>app.close(()=>r()))}
});
