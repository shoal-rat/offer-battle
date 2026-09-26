import {DurableObject} from 'cloudflare:workers';
import {applyCommand,createMatch,getView} from '../src/game/index';
import type {Command,Loadout,MatchState} from '../src/game/types';
import {DAY,Documents,Fault,body,failure,json,replay,stable,uid,type Env,type Journal,type Principal,type RecordInput} from './shared';
interface Seat {id:string;accountId:string;name:string;ready:boolean;loadout:Loadout}
interface Room {id:string;code:string;seats:Seat[];status:'waiting'|'playing'|'finished';matchId:string|null;deadline:number|null;createdAt:number;expires:number}
interface Attachment {accountId:string;tokenHash:string;expires:number;window:number;messages:number}
export class BattleRoom extends DurableObject<Env> {
 private sql:SqlStorage;private docs:Documents;private deleted=false;
 constructor(ctx:DurableObjectState,env:Env){
  super(ctx,env);
  this.sql=ctx.storage.sql;this.docs=new Documents(this.sql);
  this.sql.exec('CREATE TABLE IF NOT EXISTS journal (match_id TEXT NOT NULL, seq INTEGER NOT NULL, entry TEXT NOT NULL, PRIMARY KEY(match_id,seq))');
  this.sql.exec('CREATE TABLE IF NOT EXISTS receipts (match_id TEXT NOT NULL, id TEXT NOT NULL, fingerprint TEXT NOT NULL, version INTEGER NOT NULL, PRIMARY KEY(match_id,id))');
  this.sql.exec('CREATE TABLE IF NOT EXISTS games (id TEXT PRIMARY KEY, created INTEGER NOT NULL)');
  ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping','pong'));
 }
 private room(){const room=this.deleted?null:this.docs.get<Room>('room');if(!room)throw new Fault(404,'房间已过期，请重新创建');return room;}
 private state(room:Room){return room.matchId?this.docs.get<MatchState>('state:'+room.matchId):null;}
 private seat(room:Room,accountId:string){const seat=room.seats.find(s=>s.accountId===accountId);if(!seat)throw new Fault(403,'你没有这个房间的席位');return seat;}
 private snapshot(room:Room,seat:Seat){const state=this.state(room),view=state?getView(state,seat.id):null;return {roomId:room.id,code:room.code,playerId:seat.id,room:{id:room.id,roomId:room.id,code:room.code,mode:'friend',status:room.status,deadline:room.deadline,version:state?.version??0,players:room.seats.map(s=>({id:s.id,name:s.name,ready:s.ready,isBot:false,connected:this.ctx.getWebSockets().some(ws=>{const a=ws.deserializeAttachment() as Attachment;return a.accountId===s.accountId&&a.expires>Date.now();}),primaryId:s.loadout.primaryId,secondaryId:s.loadout.secondaryId}))},view:view?{...view,stateVersion:view.version,deadline:room.deadline}:null,events:view?.events??[]};}
 private persist(room:Room,state?:MatchState){this.docs.put('room',room);if(state)this.docs.put('state:'+state.matchId,state);}
 private async schedule(room:Room){await this.ctx.storage.setAlarm(room.deadline??room.expires);}
 private start(room:Room){
  const seed=crypto.getRandomValues(new Uint32Array(1))[0],state=createMatch(room.seats.map(s=>s.loadout) as [Loadout,Loadout],seed,{matchId:uid('cloudmatch')});
  room.matchId=state.matchId;room.status='playing';room.deadline=Date.now()+Number(this.env.SETUP_MS??20000);room.expires=Date.now()+Number(this.env.ROOM_RETENTION_MS??7*DAY);
  this.sql.exec('INSERT INTO games VALUES (?,?)',state.matchId,Date.now());this.docs.put('initial:'+state.matchId,state);this.persist(room,state);
  // Saved personal history lives separately. Only five recent rematches remain in the room.
  for(const old of this.sql.exec<{id:string}>('SELECT id FROM games ORDER BY created DESC LIMIT -1 OFFSET 5')){this.docs.remove('initial:'+old.id);this.docs.remove('state:'+old.id);this.sql.exec('DELETE FROM journal WHERE match_id=?',old.id);this.sql.exec('DELETE FROM receipts WHERE match_id=?',old.id);this.sql.exec('DELETE FROM games WHERE id=?',old.id);}
 }
 private apply(room:Room,state:MatchState,seatId:string,command:Command){
  const result=applyCommand(state,seatId,command);if(result.error)return {ok:false,rejection:result.error,state};
  const next=result.state;
  this.sql.exec('INSERT INTO journal VALUES (?,?,?)',state.matchId,next.version,JSON.stringify({actorId:seatId,command}));
  if(next.phase==='finished'){room.status='finished';room.deadline=null;room.expires=Date.now()+Number(this.env.ROOM_RETENTION_MS??7*DAY);}
  else if(next.phase!==state.phase||next.activePlayerId!==state.activePlayerId||next.round!==state.round)room.deadline=Date.now()+Number(next.phase==='playing'?this.env.TURN_MS??30000:this.env.SETUP_MS??20000);
  this.persist(room,next);return {ok:true,state:next};
 }
 private expire(room:Room){
  let state=this.state(room);if(!state||room.status!=='playing'||room.deadline===null||room.deadline>Date.now())return false;
  this.ctx.storage.transactionSync(()=>{
   if(state!.phase==='flex'||state!.phase==='mulligan'){const phase=state!.phase;for(const seat of room.seats){const player=state!.players.find(p=>p.id===seat.id)!;if(phase==='flex'&&!player.flexReady)state=this.apply(room,state!,seat.id,{type:'SELECT_FLEX',flexIds:seat.loadout.flexDeck,commandId:uid('timeout')}).state;if(phase==='mulligan'&&!player.mulliganReady)state=this.apply(room,state!,seat.id,{type:'MULLIGAN',cardIds:[],commandId:uid('timeout')}).state;}}
   else state=this.apply(room,state!,state!.activePlayerId,{type:'TIMEOUT',commandId:uid('timeout')}).state;
  });return true;
 }
 private record(room:Room,seat:Seat,matchId=room.matchId){
  if(!matchId)throw new Fault(409,'对局尚未开始');const initialState=this.docs.get<MatchState>('initial:'+matchId),state=this.docs.get<MatchState>('state:'+matchId);if(!initialState||!state)throw new Fault(404,'这场对局已不在临时房间记录中');
  return {record:{initialState,journal:[...this.sql.exec<{entry:string}>('SELECT entry FROM journal WHERE match_id=? ORDER BY seq',matchId)].map(r=>JSON.parse(r.entry) as Journal),selfId:seat.id} satisfies RecordInput,state};
 }
 private execute(room:Room,seat:Seat,input:any){
  const cmd=input.command??input,state=this.state(room);
  if(!state)throw new Fault(409,'双方准备后才能开始');
  if(typeof cmd.commandId!=='string'||!cmd.commandId||cmd.commandId.length>160)throw new Fault(400,'指令缺少 commandId');
  if(cmd.type==='TIMEOUT')throw new Fault(403,'超时由服务端裁定');
  if(cmd.matchId!==state.matchId)throw new Fault(409,'对局已更新，请重新获取牌桌');
  const command={...cmd,...cmd.payload,type:cmd.type,commandId:`${seat.id}:${cmd.commandId}`} as Command;
  for(const key of ['actorSessionToken','expectedStateVersion','payload','playerId','matchId'])delete (command as any)[key];
  const fingerprint=stable(command),key=seat.id+':'+cmd.commandId;
  if(fingerprint.length>10000)throw new Fault(413,'指令过大');
  const receipt=[...this.sql.exec<{fingerprint:string;version:number}>('SELECT fingerprint,version FROM receipts WHERE match_id=? AND id=?',state.matchId,key)][0];
  if(receipt){if(receipt.fingerprint!==fingerprint)throw new Fault(409,'commandId 已用于其他指令');return {ok:true,duplicate:true,acceptedVersion:receipt.version,...this.snapshot(room,seat)};}
  if(cmd.expectedStateVersion!==state.version)return {ok:false,rejection:'状态版本已更新，请按最新牌桌操作',errorCode:'STALE_VERSION',...this.snapshot(room,seat)};
  if(state.version>=600)throw new Fault(409,'本局指令数量已达上限，请等待回合超时结束');
  const result=this.ctx.storage.transactionSync(()=>{const value=this.apply(room,state,seat.id,command);if(value.ok)this.sql.exec('INSERT INTO receipts VALUES (?,?,?,?)',state.matchId,key,fingerprint,value.state.version);return value;});
  return {ok:result.ok,...(!result.ok?{rejection:result.rejection}:{}),...this.snapshot(room,seat)};
 }
 private async valid(attachment:Attachment){if(attachment.expires<=Date.now())return false;const response=await this.env.ACCOUNTS.getByName('registry').fetch(new Request('https://accounts/_validate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tokenHash:attachment.tokenHash})}));return response.ok;}
 private async broadcast(){
  const room=this.room();for(const ws of this.ctx.getWebSockets()){
   const attachment=ws.deserializeAttachment() as Attachment;
   if(!await this.valid(attachment)){ws.close(1008,'Login required');continue;}
   const seat=room.seats.find(s=>s.accountId===attachment.accountId);if(seat)try{ws.send(JSON.stringify({type:'state',...this.snapshot(this.room(),seat)}));}catch{}
  }
 }
 async fetch(request:Request){try{return await this.handle(request);}catch(e){return failure(e);}}
 private async handle(request:Request):Promise<Response>{
  if(this.deleted)throw new Fault(404,'房间已过期');
  const principal=JSON.parse(request.headers.get('X-Principal')??'null') as Principal|null;if(!principal)throw new Fault(401,'请先登录','AUTH_REQUIRED');
  const url=new URL(request.url),path=url.pathname,input=request.method==='POST'?await body(request,150000):{};
  if(path==='/init'){
   if(this.docs.get('room'))throw new Fault(409,'房间已存在');
   const room:Room={id:input.roomId,code:input.code,seats:[{id:'p1',accountId:principal.account.id,name:principal.profile.nickname,ready:false,loadout:{...input.loadout,playerId:'p1'}}],status:'waiting',matchId:null,deadline:null,createdAt:Date.now(),expires:Date.now()+Number(this.env.WAITING_RETENTION_MS??DAY)};
   this.persist(room);await this.schedule(room);return json(this.snapshot(room,room.seats[0]),201);
  }
  const room=this.room();if(room.expires<=Date.now()&&room.status!=='playing')throw new Fault(404,'房间已过期，请重新创建');
  this.expire(room);
  if(path==='/join'){
   let seat=room.seats.find(s=>s.accountId===principal.account.id);
   if(!seat){if(room.status!=='waiting'||room.seats.length>=2)throw new Fault(409,'房间席位已满');seat={id:'p2',accountId:principal.account.id,name:principal.profile.nickname,ready:false,loadout:{...input.loadout,playerId:'p2'}};room.seats.push(seat);this.persist(room);}
   await this.schedule(room);await this.broadcast();return json(this.snapshot(this.room(),seat));
  }
  const seat=this.seat(room,principal.account.id);
  if(path==='/ws'){
   if(this.ctx.getWebSockets().filter(ws=>(ws.deserializeAttachment() as Attachment).accountId===principal.account.id).length>=4)throw new Fault(429,'请关闭多余的联机页面');
   const pair=new WebSocketPair(),client=pair[0],server=pair[1];this.ctx.acceptWebSocket(server,[seat.id]);server.serializeAttachment({accountId:principal.account.id,tokenHash:principal.tokenHash,expires:principal.expires,window:Date.now(),messages:0} satisfies Attachment);server.send(JSON.stringify({type:'state',...this.snapshot(room,seat)}));await this.schedule(room);this.ctx.waitUntil(this.broadcast());return new Response(null,{status:101,webSocket:client});
  }
  if(path==='/ready'){
   if(room.status!=='waiting')throw new Fault(409,'比赛已开始');
   this.ctx.storage.transactionSync(()=>{if(input.loadout)seat.loadout={...input.loadout,playerId:seat.id};seat.ready=input.ready!==false;if(room.seats.length===2&&room.seats.every(s=>s.ready))this.start(room);else this.persist(room);});
  }else if(path==='/command'){const result=this.execute(room,seat,input);await this.schedule(room);await this.broadcast();return json(result);}
  else if(path==='/rematch'){
   if(room.status!=='finished')throw new Fault(409,'结束对局后可以重赛');
   room.status='waiting';room.matchId=null;room.deadline=null;room.expires=Date.now()+Number(this.env.WAITING_RETENTION_MS??DAY);room.seats.forEach(s=>s.ready=s.id===seat.id);this.persist(room);
  }else if(path==='/record'||path==='/replay'){
   const {record,state}=this.record(room,seat,url.searchParams.get('matchId')??undefined);
   if(path==='/record'){if(state.phase!=='finished')throw new Fault(409,'仅可保存已完成对局');return json(record);}
   const verified=replay(record,seat.id,false);return json({...verified,verified:stable(state)===stable(record.journal.reduce((s,e)=>applyCommand(s,e.actorId,e.command).state,structuredClone(record.initialState)))});
  }else if(path!=='/snapshot')throw new Fault(404,'接口不存在');
  await this.schedule(room);await this.broadcast();return json(this.snapshot(this.room(),seat));
 }
 async alarm(){
  if(this.deleted)return;const room=this.docs.get<Room>('room');if(!room)return;
  if(room.status!=='playing'&&room.expires<=Date.now()){for(const ws of this.ctx.getWebSockets())ws.close(1000,'Room expired');await this.ctx.storage.deleteAll();this.deleted=true;return;}
  this.expire(room);await this.schedule(room);await this.broadcast();
 }
 async webSocketMessage(ws:WebSocket,message:string|ArrayBuffer){
  try{
   const a=ws.deserializeAttachment() as Attachment;
   if(typeof message!=='string'||message.length>16000){ws.close(1009,'Message too large');return;}
   if(Date.now()-a.window>60000){a.window=Date.now();a.messages=0;}a.messages++;ws.serializeAttachment(a);if(a.messages>300){ws.close(1008,'Rate limit');return;}
   if(!await this.valid(a)){ws.close(1008,'Login required');return;}
   const input=JSON.parse(message),room=this.room(),seat=this.seat(room,a.accountId);this.expire(room);
   if(input.type==='ping')ws.send(JSON.stringify({type:'pong',at:Date.now()}));
   else if(input.type==='reconnect')ws.send(JSON.stringify({type:'state',...this.snapshot(room,seat)}));
   else if(input.type==='command'){const result=this.execute(room,seat,input.command??input);ws.send(JSON.stringify({type:'ack',commandId:input.command?.commandId??input.commandId,...result}));await this.broadcast();}
   else throw new Fault(400,'消息类型无效');
   await this.schedule(this.room());
  }catch(e){try{ws.send(JSON.stringify({type:'error',error:e instanceof Fault?e.message:'消息无法处理'}));}catch{}}
 }
 async webSocketClose(ws:WebSocket,code:number,reason:string,wasClean:boolean){try{ws.close(code,reason);}catch{}if(!this.deleted)this.ctx.waitUntil(this.broadcast().catch(()=>{}));}
 webSocketError(ws:WebSocket){try{ws.close(1011,'Connection interrupted');}catch{}}
}
