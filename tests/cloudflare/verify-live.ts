/** Explicit opt-in deployed acceptance: npx tsx tests/cloudflare/verify-live.ts https://api.example */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {WebSocket} from 'ws';
import {createMatch,defaultLoadout,chooseBotCommand} from '../../src/game/index';
import type {Command,Loadout} from '../../src/game/types';

const base=process.argv[2];if(!base||new URL(base).protocol!=='https:')throw Error('Provide an HTTPS API origin');
const origin='https://weikezhang.cn',run=crypto.randomUUID().slice(0,8),started=Date.now();
const users=[0,1].map(i=>({username:`qa_${run}_${i}`,password:`Qa-${crypto.randomUUID()}`,nickname:i?'线上验收·乙':'线上验收·甲',token:'',recoveryKey:''}));
try{const existing=JSON.parse(await readFile('work/online-credentials.json','utf8'));if(existing.apiBaseUrl===base&&existing.accounts?.length===2)existing.accounts.forEach((a:any,i:number)=>Object.assign(users[i],a));}catch{}
const timings:Record<string,number>={},sockets:WebSocket[]=[],socketMessages=[0,0];
let recoveryRotation=false;
async function api(path:string,token?:string,data?:unknown,method?:string){
 const response=await fetch(new URL(path,base),{method:method??(data===undefined?'GET':'POST'),headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(data===undefined?{}:{body:JSON.stringify(data)})});
 return {status:response.status,body:await response.json() as any};
}
async function saveCredentials(){await mkdir('work/cloudflare-live',{recursive:true});await writeFile('work/cloudflare-live/credentials.json',JSON.stringify({base,run,users},null,2),{mode:0o600});await writeFile('work/online-credentials.json',JSON.stringify({frontendUrl:'https://weikezhang.cn/offer-battle/',apiBaseUrl:base,accounts:users.map(({username,password,nickname})=>({username,password,nickname}))},null,2),{mode:0o600});}
try{
 assert.equal((await api('/healthz')).status,200);assert.equal((await api('/api/matches')).body.errorCode,'AUTH_REQUIRED');
 const preflight=await fetch(new URL('/api/auth/register',base),{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}});assert.equal(preflight.status,204);
 await saveCredentials();
 for(const [i,user]of users.entries()){const at=Date.now();let result=await api('/api/auth/login',undefined,{username:user.username,password:user.password});if(result.status===401)result=await api('/api/auth/register',undefined,{username:user.username,password:user.password,nickname:user.nickname});assert.ok([200,201].includes(result.status),`Registration/login returned ${result.status}: ${result.body.error??''}`);timings[`registrationOrLogin${i}Ms`]=Date.now()-at;user.token=result.body.token;if(result.body.recoveryKey)user.recoveryKey=result.body.recoveryKey;await saveCredentials();}
 await saveCredentials();
 let room=(await api('/api/rooms',users[0].token,{mode:'friend'})).body;assert.match(room.room.id,/^cloud_/);
 assert.equal((await api('/api/rooms/join',users[1].token,{code:room.code})).status,200);
 for(const [i,user]of users.entries()){
  const ws=new WebSocket(new URL(`/ws?roomId=${room.room.id}&token=${encodeURIComponent(user.token)}`,base).toString().replace('https:','wss:'),{origin});sockets.push(ws);
  await new Promise<void>((resolve,reject)=>{ws.once('message',()=>resolve());ws.once('error',reject);ws.on('message',raw=>{const m=JSON.parse(String(raw));if(m.type==='state'){assert.equal(m.playerId,i===0?'p1':'p2');if(m.view)assert.equal(m.view.players[i===0?1:0].hand.length,0);socketMessages[i]++;}});});
 }
 const ready=await Promise.all(users.map(u=>api(`/api/rooms/${room.room.id}/ready`,u.token,{ready:true})));assert.ok(ready.every(r=>r.status===200));
 for(const type of ['SELECT_FLEX','MULLIGAN'])for(const user of users){room=(await api(`/api/rooms/${room.room.id}`,user.token)).body;const command=type==='SELECT_FLEX'?{type,flexIds:['F01','F04','F05']}:{type,cardIds:[]};const result=await api(`/api/rooms/${room.room.id}/command`,user.token,{matchId:room.view.matchId,commandId:crypto.randomUUID(),expectedStateVersion:room.view.version,type,payload:command});assert.equal(result.body.ok,true,result.body.rejection);}
 room=(await api(`/api/rooms/${room.room.id}`,users[0].token)).body;
 for(let n=0;n<400&&room.view.phase!=='finished';n++){
  const user=users[room.view.activePlayerId==='p1'?0:1];room=(await api(`/api/rooms/${room.room.id}`,user.token)).body;
  const command=chooseBotCommand(room.view);const result=await api(`/api/rooms/${room.room.id}/command`,user.token,{matchId:room.view.matchId,commandId:crypto.randomUUID(),expectedStateVersion:room.view.version,type:command.type,payload:command});assert.equal(result.body.ok,true,result.body.rejection);room=result.body;
 }
 assert.equal(room.view.phase,'finished');assert.ok(socketMessages.every(n=>n>10));
 const friend=(await api('/api/matches',users[0].token,{roomId:room.room.id}));assert.equal(friend.status,201);assert.equal(friend.body.match.source,'friend');
 const savedReplay=await api(`/api/matches/${friend.body.match.id}`,users[0].token);assert.equal(savedReplay.body.verified,true);assert.ok(savedReplay.body.frames.length>20);
 const loadouts=[defaultLoadout('p1','本地验收玩家',5),defaultLoadout('p2','本地练习对手',6)] as [Loadout,Loadout],seed=23,initialState=createMatch(loadouts,seed,{skipSetup:true,matchId:`local_live_${run}`});
 const local=await api('/api/matches',users[0].token,{record:{initialState,journal:[{actorId:'p1',command:{type:'CONCEDE',commandId:'local-end'} satisfies Command}],loadouts,seed,skipSetup:true}});assert.equal(local.status,201);assert.equal(local.body.match.source,'local');
 const cloudReplay=await api(`/api/rooms/${room.room.id}/replay`,users[1].token);assert.equal(cloudReplay.body.verified,true);assert.ok(cloudReplay.body.frames.every((f:any)=>f.players[0].hand.length===0));
 await api(`/api/rooms/${room.room.id}/rematch`,users[0].token,{});const next=await api(`/api/rooms/${room.room.id}/ready`,users[1].token,{ready:true});assert.notEqual(next.body.view.matchId,room.view.matchId);
 for(const ws of sockets)ws.close();
 const second=await api('/api/auth/login',undefined,{username:users[0].username,password:users[0].password});assert.equal(second.status,200);const history=(await api('/api/matches',second.body.token)).body.matches;assert.ok([friend.body.match.id,local.body.match.id].every(id=>history.some((m:any)=>m.id===id)));
 if(users[1].recoveryKey){const oldToken=users[1].token,newPassword=`Recovered-${crypto.randomUUID()}`,recovered=await api('/api/auth/recover',undefined,{username:users[1].username,recoveryKey:users[1].recoveryKey,newPassword});assert.equal(recovered.status,200);assert.equal((await api('/api/profile',oldToken)).status,401);users[1]={...users[1],password:newPassword,token:recovered.body.token,recoveryKey:recovered.body.recoveryKey};recoveryRotation=true;}
 await saveCredentials();
 const report={ok:true,base,run,registeredAccounts:2,...timings,commands:room.view.version,webSocketSnapshots:socketMessages,friendSaved:friend.body.match.id,localSaved:local.body.match.id,rematch:true,secondLogin:true,recoveryRotation,elapsedMs:Date.now()-started};
 await writeFile('work/cloudflare-live/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{for(const socket of sockets)socket.close();}
