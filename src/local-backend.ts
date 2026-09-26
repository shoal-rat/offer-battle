import {currentLoadout as compileCurrentLoadout,upgradeOfferCollection} from './game/offer-compat';
import {applyCommand,chooseBotCommand,compileOffer,createMatch,createShowcase,defaultLoadout,exampleOffers,getView,showcaseCatalog} from './game/index';
import {createTutorial,getTutorialView,isLessonId,sameTutorialCommand,tutorialCoachCommands,type TutorialProgress} from './game/tutorial';
import type {Command,Loadout,MatchState,OfferDefinition,OfferProfile} from './game/types';
import type {Profile,RoomResponse} from './api';

export interface GameSocket {
  readyState:number;
  onopen:((event:Event)=>void)|null;
  onmessage:((event:MessageEvent)=>void)|null;
  onclose:((event:CloseEvent)=>void)|null;
  onerror:((event:Event)=>void)|null;
  send(data:string|ArrayBufferLike|Blob|ArrayBufferView):void;
  close(code?:number,reason?:string):void;
}
export interface LocalStorage {getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem(key:string):void}
interface Options {persistentStorage:LocalStorage;transientStorage:LocalStorage;now?:()=>number;autoTick?:boolean;botDelayMs?:number;turnMs?:number;setupMs?:number}
type Strategy='aggressive'|'control'|'growth';
interface Seat {id:string;name:string;loadout:Loadout;isBot:boolean;ready:boolean}
interface JournalEntry {actorId:string;command:Command}
interface Receipt {fingerprint:string;version:number;view:ReturnType<typeof getView>}
interface LocalRoom {
  id:string;code:string;mode:'bot';strategy:Strategy;training:boolean;status:'playing'|'finished';seats:Seat[];
  state:MatchState;initialState:MatchState;journal:JournalEntry[];receipts:Record<string,Receipt>;
  deadline:number|null;lastBotAt:number;seed:number;skipSetup:boolean;tutorial?:TutorialProgress;
  scenario?:{id:string;title:string;instructions:string[]};
}
export class LocalBackendError extends Error {constructor(message:string,public status=400,public code?:string){super(message)}}
function currentLoadout(value:Loadout){try{return compileCurrentLoadout(value)}catch(error){throw new LocalBackendError((error as Error).message)}}
const profileKey='offer-local-profile-v1',activeKey='offer-local-active-v1',ttl=12*60*60*1000;
const id=(prefix:string)=>`${prefix}_${crypto.randomUUID()}`;
const seed=()=>crypto.getRandomValues(new Uint32Array(1))[0];
const clone=<T>(value:T):T=>structuredClone(value);
const nickname=(value:unknown)=>typeof value==='string'&&value.trim()?value.trim().slice(0,24):'秋招挑战者';
const canonical=(value:unknown):string=>{const sort=(v:any):any=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(key=>[key,sort(v[key])])):v;return JSON.stringify(sort(value))};

/** Browser-only guest play. Rule execution is the exact same engine used by the server. */
export class LocalBackend {
  private profile:Profile;
  private rooms=new Map<string,LocalRoom>();
  private sockets=new Map<LocalSocket,string>();
  private timer?:ReturnType<typeof setInterval>;
  private now:()=>number;
  private activeRoomId:string|null=null;
  constructor(private options:Options) {
    this.now=options.now??Date.now;
    let stored:Profile|undefined;
    try {const value=JSON.parse(options.persistentStorage.getItem(profileKey)||'null');if(value?.id&&Array.isArray(value.offers))stored=value}catch{}
    this.profile=stored??{id:id('guest'),nickname:'秋招挑战者',offers:[]};
    upgradeOfferCollection(this.profile);this.saveProfile();
    try {
      const saved=JSON.parse(options.transientStorage.getItem(activeKey)||'null');
      if(saved?.expiresAt>this.now()&&saved.room?.id?.startsWith('local_')&&saved.room.state?.rulesVersion==='2.0.0'&&saved.room.status==='playing'&&Array.isArray(saved.room.journal)) {
        this.rooms.set(saved.room.id,saved.room);this.activeRoomId=saved.room.id;
      } else options.transientStorage.removeItem(activeKey);
    }catch{try{options.transientStorage.removeItem(activeKey)}catch{}}
    if(options.autoTick!==false)this.timer=setInterval(()=>this.tick(),150);
  }
  dispose(){if(this.timer)clearInterval(this.timer);this.timer=undefined;for(const socket of [...this.sockets.keys()])socket.close();}
  private saveProfile(){try{this.options.persistentStorage.setItem(profileKey,JSON.stringify(this.profile))}catch{/* Live play remains available when storage is full or unavailable. */}}
  private saveRoom(room:LocalRoom){
    if(this.activeRoomId!==room.id)return;
    try {if(room.status==='finished'||(room.tutorial&&getTutorialView(room.state,room.tutorial).completed))this.options.transientStorage.removeItem(activeKey);
      else this.options.transientStorage.setItem(activeKey,JSON.stringify({expiresAt:this.now()+ttl,room}));
    }catch{}
  }
  private roomFor(roomId:string){const room=this.rooms.get(roomId);if(!room)throw new LocalBackendError('本地牌桌已结束或当前标签页的临时记录已清除',404,'ROOM_NOT_FOUND');return room}
  private loadoutFor(input:any,playerId='p1'):Loadout {
    const fallback=defaultLoadout(playerId,this.profile.nickname,Number(input?.presetIndex??5));
    if(!input)return this.profile.loadout?currentLoadout({...this.profile.loadout,playerId,name:this.profile.nickname}):fallback;
    const available=new Map([...exampleOffers,...this.profile.offers].map(o=>[o.id,o]));
    const requested=input.offerIds??input.offers?.map((o:any)=>typeof o==='string'?o:o.id);
    const offers=requested?requested.map((offerId:string)=>available.get(offerId)):fallback.offers;
    if(offers.length!==3||offers.some((o:any)=>!o)||new Set(offers.map((o:any)=>o.id)).size!==3)throw new LocalBackendError('请选择三张不同的已收藏 Offer');
    const value:Loadout={...fallback,playerId,name:this.profile.nickname,primaryId:input.primaryId??fallback.primaryId,secondaryId:input.secondaryId??fallback.secondaryId,offers:clone(offers),baseDeck:input.baseDeck??fallback.baseDeck,flexDeck:input.flexDeck??fallback.flexDeck};
    if(!/^H(0[1-9]|10)$/.test(value.primaryId)||!/^S(0[0-9]|10)$/.test(value.secondaryId))throw new LocalBackendError('学历选择无效');
    if(!Array.isArray(value.baseDeck)||value.baseDeck.length!==12||value.baseDeck.some(c=>!/^N(0[1-9]|1[0-9]|2[0-4])$/.test(c))||value.baseDeck.some(c=>value.baseDeck.filter(x=>x===c).length>2))throw new LocalBackendError('基础牌需要 12 张，同名最多 2 张');
    if(!Array.isArray(value.flexDeck)||value.flexDeck.length!==3||new Set(value.flexDeck).size!==3||value.flexDeck.some(c=>!/^F0[1-6]$/.test(c)))throw new LocalBackendError('请选择三张不同的应对牌');
    return currentLoadout(value);
  }
  private start(room:LocalRoom,skipSetup=false){
    room.skipSetup=skipSetup;
    if(!room.tutorial&&!room.scenario)for(const seat of room.seats)seat.loadout=currentLoadout(seat.loadout);
    if(room.tutorial){const lesson=createTutorial(room.tutorial.lessonId,{matchId:id('match'),name:this.profile.nickname});room.seats.forEach((seat,i)=>seat.loadout=lesson.loadouts[i]);room.state=lesson.state;room.tutorial=lesson.progress;room.deadline=null}
    else {room.state=room.scenario?createShowcase(room.scenario.id as Parameters<typeof createShowcase>[0],'p1','p2',{matchId:id('match'),seed:room.seed}).state:createMatch(room.seats.map(s=>s.loadout) as [Loadout,Loadout],room.seed,{skipSetup,matchId:id('match')});room.deadline=room.training&&room.state.phase==='playing'?null:this.now()+(room.state.phase==='playing'?(this.options.turnMs??30000):(this.options.setupMs??20000))}
    room.initialState=clone(room.state);room.status='playing';room.journal=[];room.receipts={};room.lastBotAt=0;
  }
  private snapshot(room:LocalRoom):RoomResponse {
    const view=getView(room.state,'p1');if(room.tutorial)view.legalActions=getTutorialView(room.state,room.tutorial).allowedCommands;
    return clone({roomId:room.id,playerId:'p1',room:{id:room.id,code:room.code,mode:room.mode,status:room.status,strategy:room.strategy,training:room.training,scenario:room.scenario,tutorial:room.tutorial?getTutorialView(room.state,room.tutorial):undefined,deadline:room.deadline,version:room.state.version,players:room.seats.map(s=>({id:s.id,name:s.name,ready:s.ready,isBot:s.isBot,connected:true}))},view,events:view.events});
  }
  private broadcast(room:LocalRoom){for(const [socket,roomId]of this.sockets)if(roomId===room.id)socket.deliver({type:'state',...this.snapshot(room)})}
  private apply(room:LocalRoom,actorId:string,command:Command){
    const before=room.state,result=applyCommand(before,actorId,command);
    if(result.error)return {ok:false,rejection:result.error};
    room.state=result.state;room.journal.push({actorId,command:clone(command)});
    if(room.state.phase==='finished'){room.status='finished';room.deadline=null}
    else if(room.state.phase!==before.phase||room.state.activePlayerId!==before.activePlayerId||room.state.round!==before.round)room.deadline=room.training&&room.state.phase==='playing'?null:this.now()+(room.state.phase==='playing'?(this.options.turnMs??30000):(this.options.setupMs??20000));
    return {ok:true};
  }
  private expire(room:LocalRoom){
    if(room.status!=='playing'||room.deadline===null||this.now()<room.deadline)return false;
    let changed=false;
    if(room.state.phase==='flex'||room.state.phase==='mulligan'){
      const phase=room.state.phase;
      for(const seat of room.seats){const p=room.state.players.find(p=>p.id===seat.id)!;
        if(phase==='flex'&&!p.flexReady)changed=this.apply(room,seat.id,{type:'SELECT_FLEX',flexIds:seat.loadout.flexDeck,commandId:id('timeout')}).ok||changed;
        if(phase==='mulligan'&&!p.mulliganReady)changed=this.apply(room,seat.id,{type:'MULLIGAN',cardIds:[],commandId:id('timeout')}).ok||changed;
      }
    }else changed=this.apply(room,room.state.activePlayerId,{type:'TIMEOUT',commandId:id('timeout')}).ok;
    return changed;
  }
  tick(){
    for(const room of this.rooms.values()){
      if(room.status!=='playing'||room.tutorial)continue;
      let changed=this.expire(room);
      if(room.state.phase!=='finished'&&this.now()-room.lastBotAt>=(this.options.botDelayMs??650)){
        const bot=room.state.players.find(p=>p.id==='p2')!;
        const shouldAct=(room.state.phase==='flex'&&!bot.flexReady)||(room.state.phase==='mulligan'&&!bot.mulliganReady)||(room.state.phase==='playing'&&(room.state.pendingChoice?.ownerId??room.state.activePlayerId)==='p2');
        if(shouldAct){const command=chooseBotCommand(getView(room.state,'p2'),room.strategy);if(command){changed=this.apply(room,'p2',{...command,commandId:id('bot')}).ok||changed;room.lastBotAt=this.now()}}
      }
      if(changed){this.saveRoom(room);this.broadcast(room)}
    }
  }
  private execute(room:LocalRoom,input:any){
    const cmdInput=input.command??input;
    if(typeof cmdInput.commandId!=='string'||!cmdInput.commandId||cmdInput.commandId.length>160)throw new LocalBackendError('指令缺少 commandId');
    if(cmdInput.type==='TIMEOUT')throw new LocalBackendError('超时由本地计时器裁定',403);
    if(typeof cmdInput.matchId!=='string'||cmdInput.matchId!==room.state.matchId)throw new LocalBackendError('旧对局指令不能用于重赛',409);
    const command={...cmdInput,...(cmdInput.payload??{}),type:cmdInput.type,commandId:`p1:${cmdInput.commandId}`} as Command;
    delete (command as any).actorSessionToken;delete (command as any).expectedStateVersion;delete (command as any).payload;delete (command as any).playerId;
    const key=`p1:${cmdInput.commandId}`,fingerprint=canonical(command),receipt=room.receipts[key];
    if(receipt){if(receipt.fingerprint!==fingerprint)throw new LocalBackendError('commandId 已用于其他指令',409);return clone({ok:true,duplicate:true,...this.snapshot(room),acceptedVersion:receipt.version,view:receipt.view,events:receipt.view.events})}
    if(this.expire(room)){this.saveRoom(room);this.broadcast(room)}
    if(cmdInput.expectedStateVersion!==room.state.version)return {ok:false,rejection:'状态版本已更新，请按最新牌桌操作',errorCode:'STALE_VERSION',...this.snapshot(room)};
    if(room.tutorial){const tutorial=getTutorialView(room.state,room.tutorial);if(!tutorial.allowedCommands.some(allowed=>sameTutorialCommand(allowed,command)))return {ok:false,rejection:tutorial.completed?'课程已完成，请选择下一课或重玩':`先完成当前目标：${tutorial.objective}`,errorCode:'TUTORIAL_STEP',...this.snapshot(room)}}
    const outcome=this.apply(room,'p1',command);
    if(outcome.ok&&room.tutorial){for(const coachCommand of tutorialCoachCommands(room.state,room.tutorial)){const result=this.apply(room,'p2',{...coachCommand,commandId:id('coach')});if(!result.ok)throw new Error(`教程导师指令失败：${result.rejection}`)}room.tutorial.stepIndex++}
    if(outcome.ok){const view=getView(room.state,'p1');if(room.tutorial)view.legalActions=getTutorialView(room.state,room.tutorial).allowedCommands;room.receipts[key]={fingerprint,version:room.state.version,view};this.saveRoom(room);this.broadcast(room)}
    return {...outcome,...this.snapshot(room)};
  }
  getReplay(roomId:string){const room=this.roomFor(roomId);return clone({initialState:room.initialState,journal:room.journal,seed:room.seed,loadouts:room.seats.map(seat=>seat.loadout),skipSetup:room.skipSetup,...(room.tutorial?{lessonId:room.tutorial.lessonId}:{}),...(room.scenario?{practiceScenario:room.scenario.id}:{})})}
  connect(roomId:string):GameSocket {const room=this.roomFor(roomId);const socket=new LocalSocket(data=>{
      const message=JSON.parse(data);
      if(message.type==='ping')socket.deliver({type:'pong',at:this.now()});
      else if(message.type==='reconnect')socket.deliver({type:'state',...this.snapshot(room)});
      else if(message.type==='command')socket.deliver({type:'ack',...this.execute(room,message.command??message)});
    },()=>this.sockets.delete(socket));
    this.sockets.set(socket,roomId);queueMicrotask(()=>socket.open({type:'state',...this.snapshot(room)}));return socket;
  }
  request<T=any>(path:string,input:any={},method='GET'):T {
    const url=new URL(path,'http://local.invalid'),route=url.pathname;
    if(route==='/api/session'&&method==='POST'){this.profile.nickname=nickname(input.nickname??this.profile.nickname);this.saveProfile();return clone({token:'local-guest',profile:this.profile}) as T}
    if(route==='/api/capabilities')return {localArt:true,localText:true,extract:false,textProvider:false,imageProvider:false,voiceProvider:false,localGuest:true} as T;
    if(route==='/api/profile'){
      if(method==='PATCH'){if(input.nickname)this.profile.nickname=nickname(input.nickname);if(input.loadout)this.profile.loadout=this.loadoutFor(input.loadout);this.saveProfile()}
      return clone(this.profile) as T;
    }
    if(route==='/api/offers'&&method==='POST'){
      const source=input.profile;if(!source||typeof source!=='object')throw new LocalBackendError('请确认 Offer 基础字段');
      const values:Record<string,number>={};for(const key of ['monthly_fixed_cny','guaranteed_months','annual_fixed_allowance_cny','annual_target_bonus_cny','annual_equity_cny','one_time_signing_cny']){if(source[key]===null||source[key]===undefined||source[key]==='')throw new LocalBackendError(`请确认缺失字段：${key}`);const value=Number(source[key]);if(!Number.isFinite(value)||value<0||value>1e10)throw new LocalBackendError(`金额或月数无效：${key}`);values[key]=value}
      if(values.monthly_fixed_cny<=0||values.guaranteed_months<1||values.guaranteed_months>36)throw new LocalBackendError('请填写有效月薪与保证发薪月数（1—36）');
      const normalized={...source,...values,company_display_name:String(source.company_display_name??'').trim().slice(0,60),role_title:String(source.role_title??'综合业务岗').slice(0,60),city:String(source.city??'').slice(0,60),confirmed_benefits:Array.isArray(source.confirmed_benefits)?source.confirmed_benefits.filter((v:any)=>typeof v==='string'&&/^B0[1-7]$/.test(v)):[]} as OfferProfile;
      if(!normalized.company_display_name)throw new LocalBackendError('请填写公司显示名');const benefit=input.benefitId??input.selectedBenefitId??null;if(benefit&&!normalized.confirmed_benefits.includes(benefit))throw new LocalBackendError('请选择已确认拥有的条款');
      let offer:OfferDefinition;try{offer=compileOffer(normalized,benefit,id('offer'))}catch(error){throw new LocalBackendError((error as Error).message)}
      this.profile.offers.push(offer);this.saveProfile();return clone({offer,job:{id:id('local-job'),state:'ready',stage:'local'},creative:{name:offer.name,description:`${offer.role}，${offer.annualPackage/10000} 万年包。`,quote:'工资先亮，底牌后出。'}}) as T;
    }
    const offerMatch=route.match(/^\/api\/offers\/([^/]+)(?:\/(appearance))?$/);
    if(offerMatch){const offer=this.profile.offers.find(o=>o.id===offerMatch[1]);if(!offer)throw new LocalBackendError('Offer 不存在',404);if(method==='DELETE'&&!offerMatch[2]){this.profile.offers=this.profile.offers.filter(o=>o.id!==offer.id);if(this.profile.loadout?.offers.some(o=>o.id===offer.id))delete this.profile.loadout;this.saveProfile();return {ok:true} as T}throw new LocalBackendError('本地模式使用随包插画，未连接生成服务',400,'PROVIDER_UNAVAILABLE')}
    if(route==='/api/generation/jobs')return {jobs:[]} as T;
    if(route==='/api/rooms'&&method==='POST'){
      if(input.mode==='friend')throw new LocalBackendError('注册或登录后才能和朋友联机',401,'AUTH_REQUIRED');
      if(input.lessonId!==undefined&&(!isLessonId(input.lessonId)||input.training!==true||input.practiceScenario))throw new LocalBackendError('教程只支持明确选择的单人练习课程');
      if(input.practiceScenario&&(input.training!==true||!showcaseCatalog.some(s=>s.id===input.practiceScenario)))throw new LocalBackendError('演示场景仅用于明确选择的单人练习');
      const strategy:Strategy=['aggressive','control','growth'].includes(input.strategy)?input.strategy:'aggressive';
      const names={aggressive:'卷王 · 进攻型',control:'合同大师 · 控制型',growth:'长期主义 · 养成型'};
      const seats=[{id:'p1',name:this.profile.nickname,isBot:false,ready:true,loadout:this.loadoutFor(input.lessonId?{presetIndex:5}:input.loadout)},{id:'p2',name:input.lessonId?'前辈 · 秋招导师':names[strategy],isBot:true,ready:true,loadout:defaultLoadout('p2',names[strategy],strategy==='aggressive'?5:strategy==='control'?6:8)}];
      const room={id:id('local'),code:'LOCAL',mode:'bot',strategy,training:input.training===true,seats,seed:seed(),...(input.lessonId?{tutorial:{lessonId:input.lessonId,stepIndex:0}}:{}),...(input.practiceScenario?{scenario:showcaseCatalog.find(s=>s.id===input.practiceScenario)}:{})} as LocalRoom;
      this.start(room,input.skipSetup===true);this.rooms.set(room.id,room);this.activeRoomId=room.id;this.saveRoom(room);return this.snapshot(room) as T;
    }
    if(route==='/api/rooms/join')throw new LocalBackendError('注册或登录后才能加入好友房',401,'AUTH_REQUIRED');
    const match=route.match(/^\/api\/rooms\/([^/]+)(?:\/(command|ready|replay|rematch))?$/);
    if(match){const room=this.roomFor(match[1]),action=match[2];
      if(action==='command'&&method==='POST')return this.execute(room,input) as T;
      if(action==='rematch'&&method==='POST'){
        if(room.status!=='finished'&&!(room.tutorial&&getTutorialView(room.state,room.tutorial).completed))throw new LocalBackendError('结束对局后可以重赛',409);
        room.seed=seed();this.start(room);this.activeRoomId=room.id;this.saveRoom(room);this.broadcast(room);return this.snapshot(room) as T;
      }
      if(action==='replay'&&method==='GET'){
        const requested=url.searchParams.get('matchId');if(requested&&requested!==room.state.matchId)throw new LocalBackendError('游客只保留当前对局回放，长期保存请登录',404,'REPLAY_NOT_FOUND');
        let state=clone(room.initialState);const frames=[getView(state,'p1')];for(const entry of room.journal){const next=applyCommand(state,entry.actorId,entry.command);if(next.error)throw Error('回放日志校验失败');state=next.state;frames.push(getView(state,'p1'))}
        return clone({matchId:state.matchId,rulesVersion:state.rulesVersion,frames,events:getView(state,'p1').events,result:state.result,verified:canonical(state)===canonical(room.state)}) as T;
      }
      if(!action&&method==='GET'){if(this.expire(room)){this.saveRoom(room);this.broadcast(room)}return this.snapshot(room) as T}
    }
    throw new LocalBackendError('本地模式不支持这个操作',404);
  }
}

class LocalSocket implements GameSocket {
  readyState=0;onopen:GameSocket['onopen']=null;onmessage:GameSocket['onmessage']=null;onclose:GameSocket['onclose']=null;onerror:GameSocket['onerror']=null;
  constructor(private receive:(data:string)=>void,private disconnected:()=>void){}
  open(snapshot:unknown){if(this.readyState!==0)return;this.readyState=1;this.onopen?.(new Event('open'));this.deliver(snapshot)}
  deliver(data:unknown){const json=JSON.stringify(data);queueMicrotask(()=>{if(this.readyState===1)this.onmessage?.(new MessageEvent('message',{data:json}))})}
  send(data:string|ArrayBufferLike|Blob|ArrayBufferView){if(this.readyState!==1)throw new Error('Socket is not open');try{this.receive(String(data))}catch(error){this.deliver({type:'error',message:(error as Error).message})}}
  close(){if(this.readyState===3)return;this.readyState=3;this.disconnected();queueMicrotask(()=>this.onclose?.(new Event('close') as CloseEvent))}
}
