import {OFFER_COMPILER_VERSION} from '../src/game/offerTuning.js';
import {currentLoadout as compileCurrentLoadout,upgradeOfferCollection} from '../src/game/offer-compat.js';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { WebSocketServer, WebSocket } from 'ws';
import { createMatch, applyCommand, getView, chooseBotCommand, compileOffer, defaultLoadout, exampleOffers, createShowcase, showcaseCatalog } from '../src/game/index.js';
import type { MatchState, Loadout, Command, OfferDefinition, OfferProfile, GameEvent } from '../src/game/types.js';
import { AtomicStore } from './storage.js';
import { networkPolicy, NetworkError, type NetworkOptions } from './network.js';
import { createTutorial, getTutorialView, isLessonId, sameTutorialCommand, tutorialCoachCommands, type TutorialProgress } from '../src/game/tutorial.js';
import { LocalTextProvider, RemoteTextProvider, RemoteImageProvider, type CreativeResult } from './providers.js';

type Strategy='aggressive'|'control'|'growth';
interface Profile { id:string; nickname:string; offers:OfferDefinition[]; loadout?:Loadout; creative:Record<string,CreativeResult>; appearances:Record<string,{revision:number;artId:string}>; createdAt:number }
interface Session { id:string; profileId:string; createdAt:number }
interface Seat { id:string; sessionId:string|null; name:string; ready:boolean; isBot:boolean; loadout:Loadout }
interface Receipt { fingerprint:string; version:number; view:ReturnType<typeof getView>; events:GameEvent[] }
interface JournalEntry { actorId:string; command:Command; version:number; at:number }
interface Room { id:string; code:string; mode:'bot'|'friend'; strategy:Strategy; training:boolean; seats:Seat[]; status:'waiting'|'playing'|'finished'; state:MatchState|null; initialState:MatchState|null; journal:JournalEntry[]; receipts:Record<string,Receipt>; deadline:number|null; createdAt:number; lastBotAt:number; seed:number; tutorial?:TutorialProgress; scenario?:{id:string;title:string;instructions:string[]}; archivedMatches:Record<string,{initialState:MatchState;journal:JournalEntry[];state:MatchState}> }
interface Job { id:string; ownerId:string; offerId:string; state:'queued'|'running'|'ready'|'failed'; stage:'local'|'text'|'image'; error?:string; createdAt:number; updatedAt:number }
interface Database { schemaVersion:1; sessions:Record<string,Session>; profiles:Record<string,Profile>; rooms:Record<string,Room>; jobs:Record<string,Job>; uploads:Record<string,{ownerId:string;mime:string;filename:string}> }
interface ServerOptions extends NetworkOptions { port?:number; host?:string; dataDir?:string; staticDir?:string; development?:boolean; turnMs?:number; setupMs?:number; botDelayMs?:number; tickMs?:number }
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
if(existsSync(join(ROOT,'.env')))loadEnvFile(join(ROOT,'.env'));
const id=(prefix:string)=>`${prefix}_${randomUUID()}`;
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const canonical=(value:unknown):string=>{const sort=(item:any):any=>Array.isArray(item)?item.map(sort):item&&typeof item==='object'?Object.fromEntries(Object.keys(item).sort().map(key=>[key,sort(item[key])])):item;return JSON.stringify(sort(value));};
const nickname=(value:unknown)=>typeof value==='string'&&value.trim()?value.trim().slice(0,24):'秋招新同学';
const fresh=():Database=>({schemaVersion:1,sessions:{},profiles:{},rooms:{},jobs:{},uploads:{}});
class HttpError extends Error { constructor(public status:number,message:string){super(message);} }
function currentLoadout(value:Loadout){try{return compileCurrentLoadout(value)}catch(error){throw new HttpError(400,(error as Error).message)}}
function json(res:ServerResponse,status:number,value:unknown){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));}
async function body(req:IncomingMessage):Promise<Record<string,any>>{let data='';for await(const chunk of req){data+=String(chunk);if(Buffer.byteLength(data)>10_000_000)throw new HttpError(413,'请求过大');}try{const value=data?JSON.parse(data):{};if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('object required');return value;}catch{throw new HttpError(400,'请求需要有效 JSON 对象');}}
function isImage(bytes:Buffer,mime:string){return mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216:mime==='image/webp'?bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP':false;}
const mimeTypes:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.json':'application/json','.woff2':'font/woff2','.wav':'audio/wav','.mp3':'audio/mpeg','.mp4':'video/mp4','.ico':'image/x-icon'};

export async function startServer(options:ServerOptions={}){
  const network=networkPolicy(options);
  const dataDir=resolve(options.dataDir??process.env.DATA_DIR??join(ROOT,'data'));
  const store=new AtomicStore<Database>(dataDir,fresh);
  let db=await store.read();
  for(const profile of Object.values(db.profiles))upgradeOfferCollection(profile);
  const turnMs=options.turnMs??Number(process.env.TURN_MS??30000),setupMs=options.setupMs??20000,botDelayMs=options.botDelayMs??650;
  const sockets=new Map<WebSocket,{session:Session;roomId:string;ip:string;alive:boolean}>();
  let chain:Promise<unknown>=Promise.resolve();
  function serial<T>(fn:()=>Promise<T>|T):Promise<T>{const next=chain.then(fn,fn);chain=next.catch(()=>{});return next;}
  function sessionFor(token:string|undefined){const session=token?db.sessions[hash(token)]:undefined;if(!session)throw new HttpError(401,'请重新进入游戏以恢复访客会话');return session;}
  function requireSession(req:IncomingMessage){return sessionFor(req.headers.authorization?.replace(/^Bearer /i,''));}
  function roomFor(roomId:string,session:Session){const room=db.rooms[roomId]??Object.values(db.rooms).find(r=>r.code===roomId.toUpperCase());if(!room)throw new HttpError(404,'找不到房间');const seat=room.seats.find(s=>s.sessionId===session.id);if(!seat)throw new HttpError(403,'你没有这个房间的席位');return {room,seat};}
  function connected(roomId:string,sessionId:string|null){return [...sockets.values()].some(s=>s.roomId===roomId&&s.session.id===sessionId);}
  function roomSummary(room:Room){return {id:room.id,roomId:room.id,code:room.code,mode:room.mode,strategy:room.strategy,status:room.status,training:room.training,scenario:room.scenario,tutorial:room.tutorial&&room.state?getTutorialView(room.state,room.tutorial):undefined,deadline:room.deadline,version:room.state?.version??0,players:room.seats.map(s=>({id:s.id,name:s.name,ready:s.ready,isBot:s.isBot,connected:s.isBot||connected(room.id,s.sessionId),primaryId:s.loadout.primaryId,secondaryId:s.loadout.secondaryId}))};}
  function snapshot(room:Room,seat:Seat){const view=room.state?getView(room.state,seat.id):null;if(view&&room.tutorial&&room.state)view.legalActions=getTutorialView(room.state,room.tutorial).allowedCommands;return {roomId:room.id,code:room.code,playerId:seat.id,room:roomSummary(room),view:view?{...view,stateVersion:view.version,deadline:room.deadline}:null,events:view?.events??[]};}
  function broadcast(room:Room){for(const [socket,entry]of sockets){if(entry.roomId!==room.id||socket.readyState!==WebSocket.OPEN)continue;const seat=room.seats.find(s=>s.sessionId===entry.session.id);if(seat)socket.send(JSON.stringify({type:'state',...snapshot(room,seat)}));}}
  function loadoutFor(profile:Profile,input:any,playerId:string):Loadout{
    const fallback=defaultLoadout(playerId,profile.nickname,Number(input?.presetIndex??5));
    if(!input)return profile.loadout?currentLoadout({...profile.loadout,playerId,name:profile.nickname}):fallback;
    const available=new Map([...exampleOffers,...profile.offers].map(o=>[o.id,o]));
    const requested=input.offerIds??input.offers?.map((o:any)=>typeof o==='string'?o:o.id);
    const offers=requested?requested.map((offerId:string)=>available.get(offerId)):fallback.offers;
    if(offers.length!==3||offers.some((o:any)=>!o)||new Set(offers.map((o:any)=>o.id)).size!==3)throw new HttpError(400,'请选择三张不同的已收藏 Offer');
    const value:Loadout={...fallback,playerId,name:profile.nickname,primaryId:input.primaryId??fallback.primaryId,secondaryId:input.secondaryId??fallback.secondaryId,offers:structuredClone(offers),baseDeck:input.baseDeck??fallback.baseDeck,flexDeck:input.flexDeck??fallback.flexDeck};
    if(!/^H(0[1-9]|10)$/.test(value.primaryId)||!/^S(0[0-9]|10)$/.test(value.secondaryId))throw new HttpError(400,'学历选择无效');
    if(!Array.isArray(value.baseDeck)||value.baseDeck.length!==12||value.baseDeck.some(c=>!/^N(0[1-9]|1[0-9]|2[0-4])$/.test(c))||value.baseDeck.some(c=>value.baseDeck.filter(x=>x===c).length>2))throw new HttpError(400,'基础牌需要 12 张，同名最多 2 张');
    if(!Array.isArray(value.flexDeck)||value.flexDeck.length!==3||new Set(value.flexDeck).size!==3||value.flexDeck.some(c=>!/^F0[1-6]$/.test(c)))throw new HttpError(400,'请选择三张不同的应对牌');
    return currentLoadout(value);
  }
  function startRoom(room:Room,skipSetup=false){if(!room.tutorial&&!room.scenario)for(const seat of room.seats)seat.loadout=currentLoadout(seat.loadout);if(room.tutorial){const tutorial=createTutorial(room.tutorial.lessonId,{matchId:id('match'),name:room.seats[0].name});room.seats.forEach((seat,i)=>{seat.loadout=tutorial.loadouts[i];});room.state=tutorial.state;room.initialState=structuredClone(tutorial.state);room.tutorial=tutorial.progress;room.status='playing';room.deadline=null;return;}const state:MatchState=room.scenario?createShowcase(room.scenario.id as Parameters<typeof createShowcase>[0],'p1','p2',{matchId:id('match'),seed:room.seed}).state:createMatch(room.seats.map(s=>s.loadout) as [Loadout,Loadout],room.seed,{skipSetup,matchId:id('match')});room.state=state;room.initialState=structuredClone(state);room.status='playing';room.deadline=room.training&&state.phase==='playing'?null:Date.now()+(state.phase==='playing'?turnMs:setupMs);}
  function updateDeadline(room:Room,before:MatchState){if(!room.state)return;if(room.state.phase==='finished'){room.status='finished';room.deadline=null;}else if(room.state.phase!==before.phase||room.state.activePlayerId!==before.activePlayerId||room.state.round!==before.round){room.deadline=room.training&&room.state.phase==='playing'?null:Date.now()+(room.state.phase==='playing'?turnMs:setupMs);}}
  function apply(room:Room,actorId:string,command:Command){if(!room.state)throw new HttpError(409,'双方准备后才能开始');const before=room.state;const result=applyCommand(before,actorId,command);if(result.error)return {ok:false,rejection:result.error};room.state=result.state;room.journal.push({actorId,command:structuredClone(command),version:result.state.version,at:Date.now()});updateDeadline(room,before);return {ok:true};}
  function expireRoom(room:Room){
    if(!room.state||room.status!=='playing'||room.deadline===null||Date.now()<room.deadline)return false;
    let changed=false;
    if(room.state.phase==='flex'||room.state.phase==='mulligan'){const phase=room.state.phase;for(const seat of room.seats){const player=room.state.players.find(p=>p.id===seat.id)!;if(phase==='flex'&&!player.flexReady)changed=apply(room,seat.id,{type:'SELECT_FLEX',flexIds:seat.loadout.flexDeck,commandId:id('timeout')}).ok||changed;if(phase==='mulligan'&&!player.mulliganReady)changed=apply(room,seat.id,{type:'MULLIGAN',cardIds:[],commandId:id('timeout')}).ok||changed;}}
    else changed=apply(room,room.state.activePlayerId,{type:'TIMEOUT',commandId:id('timeout')}).ok;
    return changed;
  }
  async function execute(room:Room,seat:Seat,input:any){
    const cmdInput=input.command??input;
    if(typeof cmdInput.commandId!=='string'||!cmdInput.commandId||cmdInput.commandId.length>160)throw new HttpError(400,'指令缺少 commandId');
    if(cmdInput.type==='TIMEOUT')throw new HttpError(403,'超时由服务端裁定');
    if(typeof cmdInput.matchId!=='string'||cmdInput.matchId!==room.state?.matchId)throw new HttpError(409,'请携带当前对局 matchId，旧对局指令不能用于重赛');
    const command={...cmdInput,...(cmdInput.payload??{}),type:cmdInput.type,commandId:`${seat.id}:${cmdInput.commandId}`} as Command;
    delete (command as any).actorSessionToken;delete (command as any).expectedStateVersion;delete (command as any).payload;delete (command as any).playerId;
    const key=`${seat.id}:${cmdInput.commandId}`,fingerprint=hash(canonical(command));
    const receipt=room.receipts[key];
    if(receipt){if(receipt.fingerprint!==fingerprint)throw new HttpError(409,'commandId 已用于其他指令');return {ok:true,duplicate:true,...snapshot(room,seat),acceptedVersion:receipt.version,view:{...receipt.view,stateVersion:receipt.version,deadline:room.deadline},events:receipt.events};}
    if(expireRoom(room)){await store.write(db);broadcast(room);}
    if(cmdInput.expectedStateVersion!==room.state?.version)return {ok:false,rejection:'状态版本已更新，请按最新牌桌操作',errorCode:'STALE_VERSION',...snapshot(room,seat)};
    if(room.tutorial&&room.state){const tutorial=getTutorialView(room.state,room.tutorial);if(!tutorial.allowedCommands.some(allowed=>sameTutorialCommand(allowed,command)))return {ok:false,rejection:tutorial.completed?'课程已完成，请选择下一课或重玩':`先完成当前目标：${tutorial.objective}`,errorCode:'TUTORIAL_STEP',...snapshot(room,seat)};}
    const outcome=apply(room,seat.id,command);
    if(outcome.ok&&room.state&&room.tutorial){for(const coachCommand of tutorialCoachCommands(room.state,room.tutorial)){const coached=apply(room,'p2',{...coachCommand,commandId:id('coach')});if(!coached.ok)throw new Error(`教程导师指令失败：${coached.rejection}`);}room.tutorial.stepIndex++;}
    if(outcome.ok&&room.state){const view=getView(room.state,seat.id);if(room.tutorial)view.legalActions=getTutorialView(room.state,room.tutorial).allowedCommands;room.receipts[key]={fingerprint,version:room.state.version,view,events:view.events};await store.write(db);broadcast(room);}
    return {...outcome,...snapshot(room,seat)};
  }
  async function runJob(jobId:string){const job=db.jobs[jobId];if(!job)return;await serial(async()=>{job.state='running';job.updatedAt=Date.now();await store.write(db);});try{const profile=db.profiles[job.ownerId],offer=profile.offers.find(o=>o.id===job.offerId);if(!offer)throw new Error('对应 Offer 已移除');if(job.stage==='image'){
      if(!process.env.IMAGE_PROVIDER_URL)throw new Error('尚未配置插画服务；本地角色仍可使用');
      const result=await new RemoteImageProvider().generateCharacter(offer);const bytes=Buffer.from(result.base64,'base64');if(!isImage(bytes,result.mime))throw new Error('插画服务返回无效图片');const filename=`${job.id}.${result.mime==='image/png'?'png':result.mime==='image/webp'?'webp':'jpg'}`;await mkdir(join(dataDir,'generated'),{recursive:true});await writeFile(join(dataDir,'generated',filename),bytes);
      await serial(()=>{offer.artId=`/api/art/${filename}`;profile.appearances[offer.id]={revision:(profile.appearances[offer.id]?.revision??0)+1,artId:offer.artId!};});
    }else{const provider=job.stage==='text'?new RemoteTextProvider():new LocalTextProvider();if(job.stage==='text'&&!process.env.TEXT_PROVIDER_URL)throw new Error('尚未配置文案服务；本地台词仍可使用');const creative=await provider.generateCreative(offer);await serial(()=>{profile.creative[offer.id]=creative;});}
    await serial(async()=>{job.state='ready';job.updatedAt=Date.now();delete job.error;await store.write(db);});
    }catch(error){await serial(async()=>{job.state='failed';job.error=(error as Error).message.slice(0,250);job.updatedAt=Date.now();await store.write(db);});}}
  function createJob(profile:Profile,offer:OfferDefinition,stage:Job['stage']='local'){const job:Job={id:id('job'),ownerId:profile.id,offerId:offer.id,state:'queued',stage,createdAt:Date.now(),updatedAt:Date.now()};db.jobs[job.id]=job;setTimeout(()=>void runJob(job.id),20);return job;}
  // An interrupted remote request is explicitly retryable; it never blocks the compiled card.
  for(const job of Object.values(db.jobs))if(job.state==='running'||job.state==='queued'){job.state='failed';job.error='服务重启中断了创作任务，可重试；规则卡仍然可用';}
  await store.write(db);

  let vite:Awaited<ReturnType<typeof import('vite')['createServer']>>|undefined;
  const http=createServer(async(req,res)=>{
    try{
      const url=new URL(req.url??'/',`http://${req.headers.host??'localhost'}`),path=url.pathname;
      if(network.cors(req,res))return;
      if(path==='/healthz')return json(res,200,{ok:true,rulesVersion:'2.0.0',offerCompilerVersion:OFFER_COMPILER_VERSION,mode:options.development?'development':'production'});
      if(path.startsWith('/api/')){
        network.admitHttp(req,path);
        const requestBody=['POST','PATCH','PUT'].includes(req.method??'')?await body(req):{};
        return await serial(async()=>{
          if(path==='/api/session'&&req.method==='POST'){
            let token=typeof requestBody.token==='string'?requestBody.token:undefined,session:Session;
            if(token){session=sessionFor(token);}else{token=randomBytes(32).toString('base64url');const profileId=id('profile');session={id:id('session'),profileId,createdAt:Date.now()};db.sessions[hash(token)]=session;db.profiles[profileId]={id:profileId,nickname:nickname(requestBody.nickname),offers:[],creative:{},appearances:{},createdAt:Date.now()};}
            const profile=db.profiles[session.profileId];if(requestBody.nickname)profile.nickname=nickname(requestBody.nickname);await store.write(db);return json(res,200,{token,profile});
          }
          if(path==='/api/capabilities')return json(res,200,{localArt:true,localText:true,extract:false,textProvider:!!process.env.TEXT_PROVIDER_URL,imageProvider:!!process.env.IMAGE_PROVIDER_URL,voiceProvider:false});
          if(path.startsWith('/api/art/')&&req.method==='GET'){
            const filename=path.slice('/api/art/'.length);if(!/^job_[a-f0-9-]+\.(png|jpg|webp)$/.test(filename))throw new HttpError(404,'图片不存在');const file=join(dataDir,'generated',filename);try{const bytes=await readFile(file);res.writeHead(200,{'Content-Type':mimeTypes[extname(file)],'Cache-Control':'public, max-age=31536000, immutable'});return res.end(bytes);}catch{throw new HttpError(404,'图片不存在');}
          }
          const session=requireSession(req),profile=db.profiles[session.profileId];
          if(path==='/api/profile'){
            if(req.method==='PATCH'){if(requestBody.nickname)profile.nickname=nickname(requestBody.nickname);if(requestBody.loadout)profile.loadout=loadoutFor(profile,requestBody.loadout,'p1');await store.write(db);}
            if(req.method==='GET'||req.method==='PATCH')return json(res,200,profile);
          }
          if(path==='/api/offers'&&req.method==='POST'){
            const source=requestBody.profile;if(!source||typeof source!=='object')throw new HttpError(400,'请确认 Offer 基础字段');
            const values:Record<string,number>={};for(const key of ['monthly_fixed_cny','guaranteed_months','annual_fixed_allowance_cny','annual_target_bonus_cny','annual_equity_cny','one_time_signing_cny']){if(source[key]===null||source[key]===undefined||source[key]==='')throw new HttpError(400,`请确认缺失字段：${key}`);const value=Number(source[key]);if(!Number.isFinite(value)||value<0||value>1e10)throw new HttpError(400,`金额或月数无效：${key}`);values[key]=value;}
            if(values.monthly_fixed_cny<=0||values.guaranteed_months<1||values.guaranteed_months>36)throw new HttpError(400,'请填写有效月薪与保证发薪月数（1—36）');
            const normalized={...source,...values,company_display_name:String(source.company_display_name??'').trim().slice(0,60),role_title:String(source.role_title??'综合业务岗').slice(0,60),city:String(source.city??'').slice(0,60),confirmed_benefits:Array.isArray(source.confirmed_benefits)?source.confirmed_benefits.filter((v:any)=>typeof v==='string'&&/^B0[1-7]$/.test(v)):[]} as OfferProfile;
            if(!normalized.company_display_name)throw new HttpError(400,'请填写公司显示名');const benefit=requestBody.benefitId??requestBody.selectedBenefitId??null;if(benefit&&!normalized.confirmed_benefits.includes(benefit))throw new HttpError(400,'请选择已确认拥有的条款');
            let offer:OfferDefinition;try{offer=compileOffer(normalized,benefit,id('offer'));}catch(error){throw new HttpError(400,(error as Error).message);}profile.offers.push(offer);profile.creative[offer.id]=await new LocalTextProvider().generateCreative(offer);const job=createJob(profile,offer);await store.write(db);return json(res,201,{offer,job,creative:profile.creative[offer.id]});
          }
          const offerMatch=path.match(/^\/api\/offers\/([^/]+)(?:\/(appearance))?$/);
          if(offerMatch){const offer=profile.offers.find(o=>o.id===offerMatch[1]);if(!offer)throw new HttpError(404,'Offer 不存在');if(req.method==='DELETE'&&!offerMatch[2]){profile.offers=profile.offers.filter(o=>o.id!==offer.id);if(profile.loadout?.offers.some(o=>o.id===offer.id))delete profile.loadout;await store.write(db);return json(res,200,{ok:true});}if(req.method==='POST'&&offerMatch[2]){const stage=['text','image'].includes(requestBody.stage)?requestBody.stage:'local';const job=createJob(profile,offer,stage);await store.write(db);return json(res,202,{offer,job});}}
          if(path==='/api/generation/jobs'&&req.method==='GET')return json(res,200,{jobs:Object.values(db.jobs).filter(j=>j.ownerId===profile.id)});
          const jobMatch=path.match(/^\/api\/generation\/jobs\/([^/]+)(?:\/(retry))?$/);
          if(jobMatch){const job=db.jobs[jobMatch[1]];if(!job||job.ownerId!==profile.id)throw new HttpError(404,'任务不存在');if(req.method==='POST'&&jobMatch[2]){if(job.state!=='failed')throw new HttpError(409,'仅失败任务需要重试');job.state='queued';delete job.error;await store.write(db);setTimeout(()=>void runJob(job.id),20);}return json(res,200,{job});}
          if(path==='/api/uploads'&&req.method==='POST'){
            const mime=String(requestBody.mime??''),base64=String(requestBody.base64??'').replace(/^data:[^;]+;base64,/,'');const bytes=Buffer.from(base64,'base64');if(bytes.length>5_000_000||!isImage(bytes,mime))throw new HttpError(400,'请上传 5 MB 内的 PNG、JPEG 或 WebP 图片');const uploadId=id('upload'),filename=`${uploadId}.bin`;await mkdir(join(dataDir,'uploads'),{recursive:true});await writeFile(join(dataDir,'uploads',filename),bytes,{mode:0o600});db.uploads[uploadId]={ownerId:profile.id,mime,filename};await store.write(db);return json(res,201,{id:uploadId,url:`/api/uploads/${uploadId}`,extraction:{available:false,fields:null,message:'参考图已保存，请手动确认字段；本地模式不会自动识别薪酬。'}});
          }
          const uploadMatch=path.match(/^\/api\/uploads\/([^/]+)$/);if(uploadMatch&&req.method==='GET'){const upload=db.uploads[uploadMatch[1]];if(!upload||upload.ownerId!==profile.id)throw new HttpError(404,'图片不存在');res.writeHead(200,{'Content-Type':upload.mime,'Cache-Control':'private, no-store'});return res.end(await readFile(join(dataDir,'uploads',upload.filename)));}
          if(path==='/api/rooms'&&req.method==='POST'){
            const mode=requestBody.mode==='friend'?'friend':'bot';let code:string;do{code=randomBytes(4).toString('hex').slice(0,6).toUpperCase();}while(Object.values(db.rooms).some(r=>r.code===code));
            if(requestBody.lessonId!==undefined&&(!isLessonId(requestBody.lessonId)||mode!=='bot'||requestBody.training!==true||requestBody.practiceScenario))throw new HttpError(400,'教程只支持明确选择的单人练习课程');
            if(requestBody.practiceScenario&&(mode!=='bot'||requestBody.training!==true||!showcaseCatalog.some(s=>s.id===requestBody.practiceScenario)))throw new HttpError(400,'演示场景仅用于明确选择的单人练习');
            const strategy:Strategy=['aggressive','control','growth'].includes(requestBody.strategy)?requestBody.strategy:'aggressive';
            const room:Room={id:id('room'),code,mode,strategy,training:mode==='bot'&&requestBody.training===true,status:'waiting',seats:[{id:'p1',sessionId:session.id,name:profile.nickname,ready:mode==='bot',isBot:false,loadout:loadoutFor(profile,requestBody.lessonId?{presetIndex:5}:requestBody.loadout,'p1')}],state:null,initialState:null,journal:[],receipts:{},deadline:null,createdAt:Date.now(),lastBotAt:0,seed:randomBytes(4).readUInt32LE(),archivedMatches:{}};
            if(mode==='bot'){const names={aggressive:'卷王 · 进攻型',control:'合同大师 · 控制型',growth:'长期主义 · 养成型'};room.seats.push({id:'p2',sessionId:null,name:requestBody.lessonId?'前辈 · 秋招导师':names[strategy],ready:true,isBot:true,loadout:defaultLoadout('p2',names[strategy],strategy==='aggressive'?5:strategy==='control'?6:8)});if(requestBody.lessonId)room.tutorial={lessonId:requestBody.lessonId,stepIndex:0};startRoom(room,requestBody.skipSetup===true);}
            if(requestBody.practiceScenario){const fixture=createShowcase(requestBody.practiceScenario,'p1','p2',{matchId:id('match'),seed:room.seed});room.state=fixture.state;room.initialState=structuredClone(fixture.state);room.deadline=null;room.scenario={id:fixture.id,title:fixture.title,instructions:fixture.instructions};}
            db.rooms[room.id]=room;await store.write(db);return json(res,201,snapshot(room,room.seats[0]));
          }
          if(path==='/api/rooms/join'&&req.method==='POST'){
            const room=Object.values(db.rooms).find(r=>r.code===String(requestBody.code??'').trim().toUpperCase());if(!room)throw new HttpError(404,'房间码无效');let seat=room.seats.find(s=>s.sessionId===session.id);if(!seat){if(room.mode!=='friend'||room.seats.length>=2||room.status!=='waiting')throw new HttpError(409,'房间席位已满；原玩家可用原浏览器重连');seat={id:'p2',sessionId:session.id,name:profile.nickname,ready:false,isBot:false,loadout:loadoutFor(profile,requestBody.loadout,'p2')};room.seats.push(seat);await store.write(db);broadcast(room);}return json(res,200,snapshot(room,seat));
          }
          const roomMatch=path.match(/^\/api\/rooms\/([^/]+)(?:\/(command|ready|replay|rematch))?$/);
          if(roomMatch){const {room,seat}=roomFor(roomMatch[1],session),action=roomMatch[2];
            if(action==='command'&&req.method==='POST')return json(res,200,await execute(room,seat,requestBody));
            if(action==='ready'&&req.method==='POST'){if(room.status!=='waiting')throw new HttpError(409,'比赛已开始');if(requestBody.loadout)seat.loadout=loadoutFor(profile,requestBody.loadout,seat.id);seat.ready=requestBody.ready!==false;if(room.seats.length===2&&room.seats.every(s=>s.ready))startRoom(room);await store.write(db);broadcast(room);return json(res,200,snapshot(room,seat));}
            if(action==='rematch'&&req.method==='POST'){if((room.status!=='finished'&&!(room.tutorial&&room.state&&getTutorialView(room.state,room.tutorial).completed))||!room.state||!room.initialState)throw new HttpError(409,'结束对局后可以重赛');room.archivedMatches[room.state.matchId]={initialState:room.initialState,journal:room.journal,state:room.state};room.state=null;room.initialState=null;room.journal=[];room.receipts={};room.seed=randomBytes(4).readUInt32LE();room.status='waiting';room.seats.forEach(s=>s.ready=s.isBot||s.id===seat.id);if(room.seats.every(s=>s.ready))startRoom(room);await store.write(db);broadcast(room);return json(res,200,snapshot(room,seat));}
            if(action==='replay'&&req.method==='GET'){
              const requested=url.searchParams.get('matchId');const source=requested&&room.archivedMatches[requested]?room.archivedMatches[requested]:room;if(!source.initialState||!source.state)return json(res,200,{frames:[],events:[]});
              let state=structuredClone(source.initialState);const frames=[getView(state,seat.id)];for(const entry of source.journal){const result=applyCommand(state,entry.actorId,entry.command);if(result.error)throw new Error('回放日志校验失败');state=result.state;frames.push(getView(state,seat.id));}
              return json(res,200,{matchId:state.matchId,rulesVersion:state.rulesVersion,frames,events:getView(state,seat.id).events,result:state.result,verified:hash(canonical(state))===hash(canonical(source.state)),stateHash:hash(canonical(state))});
            }
            if(!action&&req.method==='GET')return json(res,200,snapshot(room,seat));
          }
          throw new HttpError(404,'接口不存在');
        });
      }
      // Neither private snapshots, environment files, nor source catalogs are static resources.
      if(/^\/(data|server|spec|tests|scripts|work)(\/|$)/.test(path)||(path.includes('/.')&&!path.startsWith('/node_modules/.vite/'))||path.startsWith('/.'))throw new HttpError(404,'文件不存在');
      if(vite){vite.middlewares(req,res,()=>json(res,404,{error:'页面不存在'}));return;}
      const staticDir=resolve(options.staticDir??join(ROOT,'dist'));const requested=resolve(staticDir,`.${decodeURIComponent(path)}`);if(!requested.startsWith(staticDir+sep)&&requested!==staticDir)throw new HttpError(404,'文件不存在');
      let file=requested;try{if((await stat(file)).isDirectory())file=join(file,'index.html');await stat(file);}catch{if(extname(path))throw new HttpError(404,'文件不存在');file=join(staticDir,'index.html');}
      const content=await readFile(file);res.writeHead(200,{'Content-Type':mimeTypes[extname(file)]??'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':extname(file)==='.html'?'no-cache':'public, max-age=3600'});res.end(content);
    }catch(error){if(res.headersSent){res.end();return;}const status=error instanceof HttpError||error instanceof NetworkError?error.status:500;if(error instanceof NetworkError&&error.retryAfter)res.setHeader('Retry-After',error.retryAfter);if(status===500)console.error('Request failed:',error);json(res,status,{error:status===500?'服务处理失败，请重试':(error as Error).message});}
  });
  if(options.development){const {createServer:createViteServer}=await import('vite');vite=await createViteServer({root:ROOT,server:{middlewareMode:true,ws:{server:http},fs:{strict:true,allow:[ROOT],deny:['.env','.env.*',`${dataDir}/**`,'**/data/**','**/server/**','**/spec/**','**/tests/**','**/work/**']}},appType:'spa'});}
  const wss=new WebSocketServer({noServer:true,maxPayload:65536});
  http.on('upgrade',(req,socket,head)=>{
    try{
      const url=new URL(req.url??'/',`http://${req.headers.host??'localhost'}`);
      if(url.pathname!=='/ws'){if(!options.development){socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');socket.destroy();}return;}
      network.acceptOrigin(req);
      const ip=network.clientIp(req);network.take('websocket',ip);
      const session=sessionFor(url.searchParams.get('token')??undefined),{room,seat}=roomFor(url.searchParams.get('roomId')??'',session);
      const entries=[...sockets.values()];
      if(entries.filter(s=>s.session.id===session.id).length>=network.wsMaxPerSession||entries.filter(s=>s.ip===ip).length>=network.wsMaxPerIp)throw new NetworkError(429,'连接数量过多，请关闭多余页面',60);
      wss.handleUpgrade(req,socket,head,ws=>{
        sockets.set(ws,{session,roomId:room.id,ip,alive:true});
        ws.on('pong',()=>{const entry=sockets.get(ws);if(entry)entry.alive=true;});
        ws.send(JSON.stringify({type:'state',...snapshot(room,seat)}));broadcast(room);
        ws.on('message',raw=>{
          // Apply admission before adding work to the serial game-state queue.
          try{network.take('messages',session.id);}catch{ws.close(1008,'Message rate limit');return;}
          void serial(async()=>{
            try{
              const message=JSON.parse(String(raw));
              if(message.type==='ping'){ws.send(JSON.stringify({type:'pong',at:Date.now()}));return;}
              if(message.type==='reconnect'){ws.send(JSON.stringify({type:'state',...snapshot(room,seat)}));return;}
              if(message.type!=='command')throw new HttpError(400,'消息类型无效');
              const result=await execute(room,seat,message.command??message);
              if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'ack',commandId:message.command?.commandId??message.commandId,...result}));
            }catch(error){if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'error',error:(error as Error).message}));}
          });
        });
        ws.on('close',()=>{sockets.delete(ws);broadcast(room);});ws.on('error',()=>{});
      });
    }catch(error){
      const status=error instanceof NetworkError?error.status:401;
      const retry=error instanceof NetworkError&&error.retryAfter?`Retry-After: ${error.retryAfter}\r\n`:'';
      socket.write(`HTTP/1.1 ${status} ${status===429?'Too Many Requests':status===403?'Forbidden':'Unauthorized'}\r\nConnection: close\r\n${retry}\r\n`);socket.destroy();
    }
  });
  const heartbeat=setInterval(()=>{
    for(const [socket,entry]of sockets){
      if(!entry.alive){socket.terminate();continue;}
      entry.alive=false;if(socket.readyState===WebSocket.OPEN)socket.ping();
    }
  },network.heartbeatMs);heartbeat.unref();
  const timer=setInterval(()=>{void serial(async()=>{
    for(const room of Object.values(db.rooms)){
      if(room.status!=='playing'||!room.state||room.tutorial)continue;let changed=false;
      changed=expireRoom(room);
      if(room.state.phase!=='finished'&&Date.now()-room.lastBotAt>=botDelayMs){const bot=room.seats.find(s=>s.isBot);if(bot){const player=room.state.players.find(p=>p.id===bot.id)!;const shouldAct=(room.state.phase==='flex'&&!player.flexReady)||(room.state.phase==='mulligan'&&!player.mulliganReady)||(room.state.phase==='playing'&&(room.state.pendingChoice?.ownerId??room.state.activePlayerId)===bot.id);if(shouldAct){const command=chooseBotCommand(getView(room.state,bot.id),room.strategy);if(command){changed=apply(room,bot.id,{...command,commandId:id('bot')}).ok||changed;room.lastBotAt=Date.now();}}}}
      if(changed){await store.write(db);broadcast(room);}
    }
  }).catch(error=>console.error('Game timer failed:',error));},options.tickMs??150);timer.unref();
  await new Promise<void>((done,reject)=>{http.once('error',reject);http.listen(options.port??Number(process.env.PORT??5173),options.host??process.env.HOST??'0.0.0.0',done);});
  const address=http.address(),port=typeof address==='object'&&address?address.port:0;
  return {http,port,url:`http://127.0.0.1:${port}`,async close(){clearInterval(timer);clearInterval(heartbeat);for(const socket of sockets.keys())socket.terminate();await new Promise<void>(done=>wss.close(()=>done()));await vite?.close();await chain;await store.write(db);await new Promise<void>((done,reject)=>http.close(error=>error?reject(error):done()));},dataDir};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  startServer({development:process.env.NODE_ENV!=='production'&&!process.argv.includes('--production')}).then(app=>{console.log(`\n  Offer 开打 · http://localhost:${app.port}\n  健康检查：${app.url}/healthz\n`);for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void app.close().then(()=>process.exit(0)));}).catch(error=>{console.error(error instanceof Error&&'code'in error&&error.code==='EADDRINUSE'?`端口 ${process.env.PORT??5173} 已被占用；设置 PORT=5174 后重试。`:error);process.exit(1);});
}
