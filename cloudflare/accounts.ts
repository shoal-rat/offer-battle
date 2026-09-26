import {DurableObject} from 'cloudflare:workers';
import {DAY,Documents,Fault,body,compile,failure,hash,json,loadoutFor,nickname,random,replay,uid,validateLocalRecord,type Env,type Principal,type Profile,type RecordInput} from './shared';
type User={id:string;username:string;salt:string;password_hash:string;recovery_hash:string};
const requireUsername=(value:unknown)=>{if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{3,32}$/.test(value))throw new Fault(400,'用户名需为 3–32 位英文、数字、下划线或连字符');return value.toLowerCase();};
const requirePassword=(value:unknown)=>{if(typeof value!=='string'||value.length<12||value.length>128)throw new Fault(400,'密码需要 12–128 个字符');return value;};
async function passwordHash(password:string,salt:string){
 // workerd limits each PBKDF2 operation to 100k rounds. Six dependent blocks
 // impose 600k rounds of work without a Node/native dependency or stored password.
 let value=new TextEncoder().encode(password) as Uint8Array<ArrayBuffer>;
 for(let block=0;block<6;block++){const key=await crypto.subtle.importKey('raw',value,'PBKDF2',false,['deriveBits']);value=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(`offer-battle:v1:${salt}:${block}`),iterations:100000},key,256));}
 return Array.from(value,b=>b.toString(16).padStart(2,'0')).join('');
}
function equal(a:string,b:string){let difference=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)difference|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return difference===0;}

export class AccountRegistry extends DurableObject<Env> {
 private sql:SqlStorage;private docs:Documents;
 constructor(ctx:DurableObjectState,env:Env){
  super(ctx,env);
  this.sql=ctx.storage.sql;this.docs=new Documents(this.sql);
  this.sql.exec('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, password_hash TEXT NOT NULL, recovery_hash TEXT NOT NULL, created INTEGER NOT NULL)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL)');
  this.sql.exec('CREATE INDEX IF NOT EXISTS session_owner ON sessions(user_id)');
  this.sql.exec('CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS quotas (key TEXT PRIMARY KEY, hits INTEGER NOT NULL, reset INTEGER NOT NULL)');
  this.sql.exec('CREATE INDEX IF NOT EXISTS quota_expiry ON quotas(reset)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS codes (code TEXT PRIMARY KEY, room_id TEXT NOT NULL, expires INTEGER NOT NULL)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS matches (id TEXT PRIMARY KEY, owner TEXT NOT NULL, match_id TEXT NOT NULL, created INTEGER NOT NULL, metadata TEXT NOT NULL, UNIQUE(owner,match_id))');
  this.sql.exec('CREATE INDEX IF NOT EXISTS match_owner ON matches(owner,created)');
 }
 private rate(key:string,limit:number,windowMs=60000){
  const now=Date.now();this.sql.exec('DELETE FROM quotas WHERE reset<=?',now);
  const value=[...this.sql.exec<{hits:number;reset:number}>('SELECT hits,reset FROM quotas WHERE key=?',key)][0];
  if(value&&value.hits>=limit)throw new Fault(429,'操作过于频繁，请稍后再试','RATE_LIMITED');
  this.sql.exec('INSERT INTO quotas VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1',key,1,now+windowMs);
 }
 private profile(id:string){const p=this.docs.get<Profile>('profile:'+id);if(!p)throw new Fault(401,'请重新登录','AUTH_REQUIRED');return p;}
 private saveProfile(profile:Profile){this.docs.put('profile:'+profile.id,profile);}
 private async issue(user:User,recoveryKey?:string){
  const token=random(),tokenHash=await hash(token),expires=Date.now()+30*DAY;
  const current=[...this.sql.exec<User>('SELECT * FROM users WHERE id=?',user.id)][0];
  if(!current||!equal(current.password_hash,user.password_hash))throw new Fault(401,'登录信息已更新，请重新登录','INVALID_CREDENTIALS');
  this.sql.exec('DELETE FROM sessions WHERE expires<=?',Date.now());
  this.sql.exec('DELETE FROM sessions WHERE hash IN (SELECT hash FROM sessions WHERE user_id=? ORDER BY expires DESC LIMIT -1 OFFSET 7)',user.id);
  this.sql.exec('INSERT INTO sessions VALUES (?,?,?)',tokenHash,user.id,expires);
  const profile=this.profile(user.id);
  return {token,profile,account:{id:user.id,username:user.username,nickname:profile.nickname},...(recoveryKey?{recoveryKey}:{})};
 }
 private principalFromHash(tokenHash:string):Principal{
  const s=[...this.sql.exec<{user_id:string;expires:number}>('SELECT user_id,expires FROM sessions WHERE hash=? AND expires>?',tokenHash,Date.now())][0];
  if(!s)throw new Fault(401,'登录后才能联机和保存战报','AUTH_REQUIRED');
  const user=[...this.sql.exec<User>('SELECT * FROM users WHERE id=?',s.user_id)][0],profile=this.profile(user.id);
  return {account:{id:user.id,username:user.username,nickname:profile.nickname},profile,expires:s.expires,tokenHash};
 }
 private async authenticate(request:Request,input:any={}){
  const token=request.headers.get('Authorization')?.replace(/^Bearer /i,'')??new URL(request.url).searchParams.get('token')??input.token;
  if(typeof token!=='string'||token.length>256)throw new Fault(401,'登录后才能联机和保存战报','AUTH_REQUIRED');
  return this.principalFromHash(await hash(token));
 }
 private roomRequest(roomId:string,path:string,principal:Principal,input?:any,upgrade=false){
  if(!/^cloud_[A-F0-9]{6}_[a-f0-9]{16}$/.test(roomId))throw new Fault(404,'找不到好友房间');
  return this.env.ROOMS.getByName(roomId).fetch(new Request('https://room'+path,{method:upgrade||input===undefined?'GET':'POST',headers:{'X-Principal':JSON.stringify(principal),...(upgrade?{Upgrade:'websocket'}:{'Content-Type':'application/json'})},...(input===undefined?{}:{body:JSON.stringify(input)})}));
 }
 async fetch(request:Request){try{return await this.handle(request);}catch(e){return failure(e);}}
 private async handle(request:Request):Promise<Response>{
  const url=new URL(request.url),path=url.pathname;
  const input=['POST','PATCH'].includes(request.method)?await body(request,path==='/api/matches'?1500000:150000):{};
  // Only the Worker and Room bindings can reach these internal endpoints.
  if(path==='/_validate')return json(this.principalFromHash(input.tokenHash));
  const ip=request.headers.get('CF-Connecting-IP')??'local';
  if(path.startsWith('/api/auth/')){
   if(request.method!=='POST')throw new Fault(405,'请使用 POST');
   if(path==='/api/auth/logout'){const p=await this.authenticate(request);this.sql.exec('DELETE FROM sessions WHERE hash=?',p.tokenHash);return json({ok:true});}
   this.rate('auth-ip:'+ip,30);const username=requireUsername(input.username);this.rate('auth-user:'+username,10);
   if(path==='/api/auth/register'){
    this.rate('register:'+ip,5,3600000);const password=requirePassword(input.password);
    if([...this.sql.exec('SELECT id FROM users WHERE username=?',username)].length)throw new Fault(409,'这个用户名已经有人使用','USERNAME_TAKEN');
    const user:User={id:uid('account'),username,salt:random(16),password_hash:'',recovery_hash:''},recoveryKey=random(24);
    user.password_hash=await passwordHash(password,user.salt);user.recovery_hash=await hash(recoveryKey);
    this.ctx.storage.transactionSync(()=>{
     if([...this.sql.exec('SELECT id FROM users WHERE username=?',username)].length)throw new Fault(409,'这个用户名已经有人使用','USERNAME_TAKEN');
     this.sql.exec('INSERT INTO users VALUES (?,?,?,?,?,?)',user.id,user.username,user.salt,user.password_hash,user.recovery_hash,Date.now());this.saveProfile({id:user.id,nickname:nickname(input.nickname??username),offers:[]});
    });return json(await this.issue(user,recoveryKey),201);
   }
   const user=[...this.sql.exec<User>('SELECT * FROM users WHERE username=?',username)][0];
   if(path==='/api/auth/login'){
    const password=requirePassword(input.password),digest=await passwordHash(password,user?.salt??'00000000000000000000000000000000');
    if(!user||!equal(digest,user.password_hash))throw new Fault(401,'用户名或密码不正确','INVALID_CREDENTIALS');
    return json(await this.issue(user));
   }
   if(path==='/api/auth/recover'){
    const password=requirePassword(input.newPassword),digest=await hash(String(input.recoveryKey??''));
    if(!user||!equal(digest,user.recovery_hash))throw new Fault(401,'用户名或恢复密钥不正确','INVALID_CREDENTIALS');
    const recoveryKey=random(24),salt=random(16),password_hash=await passwordHash(password,salt),recovery_hash=await hash(recoveryKey);
    this.ctx.storage.transactionSync(()=>{
     const latest=[...this.sql.exec<User>('SELECT * FROM users WHERE id=?',user.id)][0];if(!equal(latest.recovery_hash,digest))throw new Fault(401,'恢复密钥已失效','INVALID_CREDENTIALS');
     this.sql.exec('UPDATE users SET salt=?,password_hash=?,recovery_hash=? WHERE id=?',salt,password_hash,recovery_hash,user.id);this.sql.exec('DELETE FROM sessions WHERE user_id=?',user.id);
    });return json(await this.issue({...user,salt,password_hash,recovery_hash},recoveryKey));
   }
   throw new Fault(404,'接口不存在');
  }
  const principal=await this.authenticate(request,input),profile=principal.profile,id=principal.account.id;
  if(path==='/api/session'&&request.method==='POST')return json({token:request.headers.get('Authorization')?.replace(/^Bearer /i,'')??input.token,profile,account:principal.account});
  if(path==='/api/profile'){
   if(request.method==='PATCH'){if(input.nickname)profile.nickname=nickname(input.nickname);if(input.loadout)profile.loadout=loadoutFor(profile,input.loadout,'p1');this.saveProfile(profile);}
   if(['GET','PATCH'].includes(request.method))return json(profile);
  }
  if(path==='/api/offers'&&request.method==='POST'){
   this.rate('offer:'+id,30);if(profile.offers.length>=100)throw new Fault(409,'云端卡册最多保存 100 张自定义 Offer');const offer=compile(input.profile,uid('offer'),input.benefitId??input.selectedBenefitId??null);profile.offers.push(offer);this.saveProfile(profile);return json({offer},201);
  }
  const offerMatch=path.match(/^\/api\/offers\/([^/]+)$/);
  if(offerMatch&&request.method==='DELETE'){profile.offers=profile.offers.filter(o=>o.id!==offerMatch[1]);if(profile.loadout?.offers.some(o=>o.id===offerMatch[1]))delete profile.loadout;this.saveProfile(profile);return json({ok:true});}
  if(path==='/api/rooms'&&request.method==='POST'){
   this.rate('rooms:'+id,20);if(input.mode!=='friend'||input.lessonId||input.practiceScenario)throw new Fault(400,'单人练习和教程请在本机进行');
   const loadout=loadoutFor(profile,input.loadout,'p1');this.saveProfile(profile);
   this.sql.exec('DELETE FROM codes WHERE expires<=?',Date.now());let code:string;
   do{code=random(3).toUpperCase();}while([...this.sql.exec('SELECT code FROM codes WHERE code=?',code)].length);
   const roomId=`cloud_${code}_${random(8)}`;this.sql.exec('INSERT INTO codes VALUES (?,?,?)',code,roomId,Date.now()+Number(this.env.WAITING_RETENTION_MS??DAY));
   return this.roomRequest(roomId,'/init',principal,{roomId,code,loadout});
  }
  if(path==='/api/rooms/join'&&request.method==='POST'){
   this.rate('join:'+id,30);const code=String(input.code??'').trim().toUpperCase();const row=[...this.sql.exec<{room_id:string}>('SELECT room_id FROM codes WHERE code=? AND expires>?',code,Date.now())][0];if(!row)throw new Fault(404,'房间码无效或已过期');
   const loadout=loadoutFor(profile,input.loadout,'p2');this.saveProfile(profile);return this.roomRequest(row.room_id,'/join',principal,{loadout});
  }
  if(path==='/ws'&&request.headers.get('Upgrade')?.toLowerCase()==='websocket')return this.roomRequest(url.searchParams.get('roomId')??'','/ws',principal,undefined,true);
  const room=path.match(/^\/api\/rooms\/(cloud_[^/]+)(?:\/(command|ready|replay|rematch))?$/);
  if(room){const action=room[2]??'snapshot';if(['ready','rematch','command'].includes(action)&&request.method!=='POST')throw new Fault(405,'请使用 POST');
   if(action==='ready'&&input.loadout){input.loadout=loadoutFor(profile,input.loadout,'p1');this.saveProfile(profile);}
   if(action==='rematch')this.rate('rooms:'+id,20);
   return this.roomRequest(room[1],'/'+action+url.search,principal,request.method==='POST'?input:undefined);
  }
  if(path==='/api/matches'){
   if(request.method==='GET')return json({matches:[...this.sql.exec<{metadata:string}>('SELECT metadata FROM matches WHERE owner=? ORDER BY created DESC',id)].map(r=>JSON.parse(r.metadata))});
   if(request.method==='POST'){
    this.rate('save:'+id,15);let record:RecordInput,source:'friend'|'local';
    if(input.roomId){const response=await this.roomRequest(String(input.roomId),'/record',principal);if(!response.ok)return response;record=await response.json() as RecordInput;source='friend';}
    else{record=validateLocalRecord(input.record);source='local';}
    const selfId=record.selfId??record.initialState.players[0].id,verified=replay(record,selfId),matchId=verified.matchId;
    const existing=[...this.sql.exec<{id:string;metadata:string}>('SELECT id,metadata FROM matches WHERE owner=? AND match_id=?',id,matchId)][0];if(existing)return json({match:JSON.parse(existing.metadata),duplicate:true});
    if([...this.sql.exec<{count:number}>('SELECT COUNT(*) AS count FROM matches WHERE owner=?',id)][0].count>=Number(this.env.MAX_SAVED_MATCHES??30))throw new Fault(409,'已达到战报保存上限，请删除一些旧战报再保存','HISTORY_FULL');
    const savedId=uid('saved'),createdAt=Date.now(),metadata={id:savedId,matchId,createdAt,opponent:record.initialState.players.find(p=>p.id!==selfId)?.name??'对手',result:verified.result,round:verified.round,source,selfId,outcome:!verified.result?.winnerId?'draw':verified.result.winnerId===selfId?'win':'lose'};
    this.ctx.storage.transactionSync(()=>{this.sql.exec('INSERT INTO matches VALUES (?,?,?,?,?)',savedId,id,matchId,createdAt,JSON.stringify(metadata));this.docs.put('match:'+savedId,record);});return json({match:metadata},201);
   }
  }
  const match=path.match(/^\/api\/matches\/([^/]+)$/);
  if(match){const row=[...this.sql.exec<{metadata:string}>('SELECT metadata FROM matches WHERE id=? AND owner=?',match[1],id)][0];if(!row)throw new Fault(404,'找不到这份战报');if(request.method==='DELETE'){this.ctx.storage.transactionSync(()=>{this.sql.exec('DELETE FROM matches WHERE id=?',match[1]);this.docs.remove('match:'+match[1]);});return json({ok:true});}if(request.method==='GET'){const record=this.docs.get<RecordInput>('match:'+match[1])!;return json({...replay(record,record.selfId!),source:JSON.parse(row.metadata).source});}}
  throw new Fault(404,'接口不存在');
 }
}
