import {deriveAchievements,mergeAchievements,type AchievementEvidence,createChallenge,challengeGoal,createBoss,experimentFlags,createSeries,recordSeriesResult,seriesNextLoadouts,setSeriesFlex,seriesSummary,seriesDescriptor,type ExperimentDescriptor,type SeriesState} from './game/experiments';
import {patchProfile,profileRevision,ProfileWriteError} from './game/profile-sync';
import {previewMigration,commitMigration} from './game/migration';
import {BOT_BUDGETS,BOT_VERSION,createBotKnowledge,updateBotKnowledge,decideBotCommand,normalizeDifficulty,normalizeSetupMode,type BotDifficulty,type SetupMode,type BotKnowledge,type BotDecision} from './game/ai';
import {BotWorkerClient} from './workers/bot-client';
import {saveOffer,deleteOffer,restoreOffer,OfferSaveError} from './game/draft-save';
import {currentLoadout as compileCurrentLoadout,upgradeOfferCollection} from './game/offer-compat';
import {applyCommand,chooseBotCommand,compileOffer,createMatch,createShowcase,defaultLoadout,exampleOffers,getView,showcaseCatalog} from './game/index';
import {createTutorial,getTutorialView,isLessonId,sameTutorialCommand,tutorialCoachCommands,type TutorialProgress} from './game/tutorial';
import type {Command,Loadout,MatchState,OfferDefinition,OfferProfile} from './game/types';
import type {Profile,RoomResponse} from './api';
import {battlePresentationSettled} from './motion/presentationGate';
import {botOpponent} from './game/botOpponents';

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
interface Options {persistentStorage:LocalStorage;transientStorage:LocalStorage;now?:()=>number;autoTick?:boolean;botDelayMs?:number;turnMs?:number;setupMs?:number;
  /** The practice bot waits until the previous move has finished playing on the table. */
  presentationSettled?:()=>boolean}
type Strategy='aggressive'|'control'|'growth';
interface Seat {id:string;name:string;loadout:Loadout;isBot:boolean;ready:boolean}
interface JournalEntry {actorId:string;command:Command}
interface Receipt {fingerprint:string;version:number;view:ReturnType<typeof getView>}
interface LocalRoom {trackAchievements?:boolean;earnedAchievements?:AchievementEvidence[];challengeSolved?:boolean;experiment?:ExperimentDescriptor;series?:SeriesState;
  id:string;code:string;mode:'bot';strategy:Strategy;difficulty:BotDifficulty;setupMode:SetupMode;botVersion:string;botSeed:number;botKnowledge?:BotKnowledge;botDecisions?:Omit<BotDecision,'principalVariation'|'command'>[];training:boolean;status:'playing'|'finished';seats:Seat[];
  state:MatchState;initialState:MatchState;journal:JournalEntry[];receipts:Record<string,Receipt>;
  deadline:number|null;lastBotAt:number;seed:number;skipSetup:boolean;tutorial?:TutorialProgress;
  scenario?:{id:string;title:string;instructions:string[]};
}
export class LocalBackendError extends Error {constructor(message:string,public status=400,public code?:string,public profile?:Profile){super(message)}}
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
  private botRunner=new BotWorkerClient();
  private pendingBot?:{roomId:string;matchId:string;version:number;requestId:string};
  private readyBot?:{roomId:string;matchId:string;version:number;view:ReturnType<typeof getView>;decision:BotDecision};
  constructor(private options:Options) {
    this.now=options.now??Date.now;
    let stored:Profile|undefined;
    try {const value=JSON.parse(options.persistentStorage.getItem(profileKey)||'null');if(value?.id&&Array.isArray(value.offers))stored=value}catch{}
    this.profile=stored??{id:id('guest'),nickname:'秋招挑战者',offers:[]};
    upgradeOfferCollection(this.profile);this.profile.revision=profileRevision(this.profile);this.saveProfile();
    try {
      const saved=JSON.parse(options.transientStorage.getItem(activeKey)||'null');
      if(saved?.expiresAt>this.now()&&saved.room?.id?.startsWith('local_')&&saved.room.state?.rulesVersion==='2.0.0'&&(saved.room.status==='playing'||saved.room.status==='finished'&&saved.room.series?.status==='between')&&Array.isArray(saved.room.journal)) {
        saved.room.difficulty=normalizeDifficulty(saved.room.difficulty);saved.room.setupMode=normalizeSetupMode(saved.room.setupMode,saved.room.skipSetup);saved.room.botVersion??=BOT_VERSION;saved.room.botSeed??=seed();
        // Older slow-practice saves accidentally retained a setup countdown.
        if(saved.room.training&&saved.room.deadline!==null){saved.room.deadline=null;try{options.transientStorage.setItem(activeKey,JSON.stringify(saved))}catch{}}
        this.rooms.set(saved.room.id,saved.room);this.activeRoomId=saved.room.id;
      } else options.transientStorage.removeItem(activeKey);
    }catch{try{options.transientStorage.removeItem(activeKey)}catch{}}
    if(options.autoTick!==false)this.timer=setInterval(()=>this.tick(),150);
  }
  dispose(){this.cancelBot();if(this.timer)clearInterval(this.timer);this.timer=undefined;for(const socket of [...this.sockets.keys()])socket.close();}
  private commitProfile(next:Profile){try{this.options.persistentStorage.setItem(profileKey,JSON.stringify(next))}catch{throw new LocalBackendError('设备未能保存存档，请释放存储空间后重试',507,'STORAGE_FULL')}this.profile=next;}
  private saveProfile(){try{this.options.persistentStorage.setItem(profileKey,JSON.stringify(this.profile))}catch{/* Live play remains available when storage is full or unavailable. */}}
  private saveRoom(room:LocalRoom){
    if(this.activeRoomId!==room.id)return;
    try {if(room.status==='finished'&&room.series?.status!=='between'||(room.tutorial&&getTutorialView(room.state,room.tutorial).completed))this.options.transientStorage.removeItem(activeKey);
      else this.options.transientStorage.setItem(activeKey,JSON.stringify({expiresAt:this.now()+ttl,room}));
    }catch{}
  }
  private roomFor(roomId:string){const room=this.rooms.get(roomId);if(!room)throw new LocalBackendError('本地牌桌已结束或当前标签页的临时记录已清除',404,'ROOM_NOT_FOUND');return room}
  private loadoutFor(input:any,playerId='p1',profile=this.profile):Loadout {
    const fallback=defaultLoadout(playerId,profile.nickname,Number(input?.presetIndex??5));
    if(!input)return profile.loadout?currentLoadout({...profile.loadout,playerId,name:profile.nickname}):fallback;
    const available=new Map([...exampleOffers,...profile.offers].map(o=>[o.id,o]));
    const requested=input.offerIds??input.offers?.map((o:any)=>typeof o==='string'?o:o.id);
    const offers=requested?requested.map((offerId:string)=>available.get(offerId)):fallback.offers;
    if(offers.length!==3||offers.some((o:any)=>!o)||new Set(offers.map((o:any)=>o.id)).size!==3)throw new LocalBackendError('请选择三张不同的已收藏 Offer');
    const value:Loadout={...fallback,playerId,name:profile.nickname,primaryId:input.primaryId??fallback.primaryId,secondaryId:input.secondaryId??fallback.secondaryId,offers:clone(offers),baseDeck:input.baseDeck??fallback.baseDeck,flexDeck:input.flexDeck??fallback.flexDeck};
    if(!/^H(0[1-9]|10)$/.test(value.primaryId)||!/^S(0[0-9]|10)$/.test(value.secondaryId))throw new LocalBackendError('学历选择无效');
    if(!Array.isArray(value.baseDeck)||value.baseDeck.length!==12||value.baseDeck.some(c=>!/^N(0[1-9]|1[0-9]|2[0-4])$/.test(c))||value.baseDeck.some(c=>value.baseDeck.filter(x=>x===c).length>2))throw new LocalBackendError('基础牌需要 12 张，同名最多 2 张');
    if(!Array.isArray(value.flexDeck)||value.flexDeck.length!==3||new Set(value.flexDeck).size!==3||value.flexDeck.some(c=>!/^F0[1-6]$/.test(c)))throw new LocalBackendError('请选择三张不同的应对牌');
    return currentLoadout(value);
  }
  private cancelBot(){this.pendingBot=undefined;this.readyBot=undefined;this.botRunner.cancel()}
  private acceptBot(room:LocalRoom,view:ReturnType<typeof getView>,decision:BotDecision){
    if(room.id!==this.activeRoomId||room.state.matchId!==decision.matchId||room.state.version!==decision.stateVersion||room.status!=='playing')return false;
    const {principalVariation:_private,command:_privateCommand,...diagnostic}=decision;room.botDecisions??=[];room.botDecisions.push(diagnostic);
    room.botKnowledge=updateBotKnowledge(room.botKnowledge,view,decision.command);
    room.lastBotAt=this.now();return this.apply(room,'p2',{...decision.command,commandId:id('bot')}).ok;
  }
  private start(room:LocalRoom,skipSetup=room.setupMode==='quick'){
    this.cancelBot();room.botVersion=BOT_VERSION;room.botDecisions=[];room.botKnowledge=undefined;
    room.skipSetup=skipSetup;
    if(!room.tutorial&&!room.scenario)for(const seat of room.seats)seat.loadout=currentLoadout(seat.loadout);
    room.challengeSolved=false;room.earnedAchievements=[];
    if(room.experiment&&room.experiment.kind!=='series'){const fixture=room.experiment.kind==='challenge'?createChallenge(room.experiment.id,experimentFlags({challenges:true}),id('match')):createBoss(room.experiment.id,experimentFlags({boss:true}),id('match'));room.state=fixture.state;room.seed=fixture.seed;room.experiment=fixture.descriptor;room.seats.forEach((seat,index)=>seat.loadout=fixture.loadouts[index]);room.deadline=null;}
    else if(room.tutorial){const lesson=createTutorial(room.tutorial.lessonId,{matchId:id('match'),name:this.profile.nickname});room.seats.forEach((seat,i)=>seat.loadout=lesson.loadouts[i]);room.state=lesson.state;room.tutorial=lesson.progress;room.deadline=null}
    else {room.state=room.scenario?createShowcase(room.scenario.id as Parameters<typeof createShowcase>[0],'p1','p2',{matchId:id('match'),seed:room.seed}).state:createMatch(room.seats.map(s=>s.loadout) as [Loadout,Loadout],room.seed,{skipSetup,matchId:id('match')});room.deadline=room.training?null:this.now()+(room.state.phase==='playing'?(this.options.turnMs??30000):(this.options.setupMs??20000))}
    room.initialState=clone(room.state);room.status='playing';room.journal=[];room.receipts={};room.lastBotAt=0;
  }
  private snapshot(room:LocalRoom):RoomResponse {
    const view=getView(room.state,'p1');if(room.tutorial)view.legalActions=getTutorialView(room.state,room.tutorial).allowedCommands;
    return clone({roomId:room.id,playerId:'p1',room:{id:room.id,code:room.code,mode:room.mode,status:room.status,earnedAchievements:room.earnedAchievements??[],...(room.experiment?{experimentId:room.experiment.id,experiment:{...room.experiment,...(room.experiment.kind==='challenge'?{solved:room.challengeSolved===true}:{})}}:{}),...(room.series?{series:seriesSummary(room.series)}:{}),strategy:room.strategy,difficulty:room.difficulty,setupMode:room.setupMode,botVersion:room.botVersion,botThinking:this.pendingBot?.roomId===room.id,training:room.training,scenario:room.scenario,tutorial:room.tutorial?getTutorialView(room.state,room.tutorial):undefined,deadline:room.deadline,version:room.state.version,players:room.seats.map(s=>({id:s.id,name:s.name,ready:s.ready,isBot:s.isBot,connected:true}))},view,events:view.events});
  }
  private broadcast(room:LocalRoom){for(const [socket,roomId]of this.sockets)if(roomId===room.id)socket.deliver({type:'state',...this.snapshot(room)})}
  private apply(room:LocalRoom,actorId:string,command:Command){
    const before=room.state,result=applyCommand(before,actorId,command);
    if(result.error)return {ok:false,rejection:result.error};
    if(this.pendingBot?.roomId===room.id)this.cancelBot();
    room.state=result.state;if(room.trackAchievements){const earned=deriveAchievements(before,result.state,actorId,command,experimentFlags({achievements:true}),'p1');if(earned.length){room.earnedAchievements=mergeAchievements(room.earnedAchievements??[],earned);const next=clone(this.profile);next.achievements=mergeAchievements(next.achievements??[],earned);try{this.commitProfile(next)}catch{/* A valid game action must still complete if only cosmetic storage is unavailable. */}}}if(room.experiment?.kind==='challenge'&&!room.challengeSolved)room.challengeSolved=challengeGoal(createChallenge(room.experiment.id,experimentFlags({challenges:true}),room.state.matchId),room.state);room.journal.push({actorId,command:clone(command)});
    if(room.state.phase==='finished'){room.status='finished';room.deadline=null;if(room.series)room.series=recordSeriesResult(room.series,room.state.matchId,room.state.result)}
    else if(room.state.phase!==before.phase||room.state.activePlayerId!==before.activePlayerId||room.state.round!==before.round)room.deadline=room.training?null:this.now()+(room.state.phase==='playing'?(this.options.turnMs??30000):(this.options.setupMs??20000));
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
      if(room.state.phase!=='finished'&&room.id===this.activeRoomId){
        const bot=room.state.players.find(p=>p.id==='p2')!;
        const botTurn=(room.state.phase==='flex'&&!bot.flexReady)||(room.state.phase==='mulligan'&&!bot.mulliganReady)||(room.state.phase==='playing'&&(room.state.pendingChoice?.ownerId??room.state.activePlayerId)==='p2');
        // The move waits for its pace (and, during play, for the table to finish showing the last move);
        // the thinking does not: it starts at once, so a stronger search hides behind the animation.
        const paced=()=>this.now()-room.lastBotAt>=(this.options.botDelayMs??1280)&&(room.state.phase!=='playing'||(this.options.presentationSettled??battlePresentationSettled)());
        const ready=this.readyBot&&this.readyBot.roomId===room.id&&this.readyBot.matchId===room.state.matchId&&this.readyBot.version===room.state.version?this.readyBot:undefined;
        if(botTurn&&ready){if(paced()){this.readyBot=undefined;changed=this.acceptBot(room,ready.view,ready.decision)||changed}}
        else if(botTurn&&!this.pendingBot){
          const view=getView(room.state,'p2');room.botKnowledge=updateBotKnowledge(room.botKnowledge??createBotKnowledge(view,room.seats[1].loadout),view);
          const request={view,knowledge:room.botKnowledge,difficulty:room.difficulty,style:room.strategy,botSeed:room.botSeed+view.version,requestId:id('think'),...(room.deadline===null?{}:{budget:{maxMs:Math.max(5,Math.min(BOT_BUDGETS[room.difficulty].maxMs,room.deadline-this.now()-250))}})};
          const store=(decision:BotDecision)=>{this.readyBot={roomId:room.id,matchId:view.matchId,version:view.version,view,decision}};
          if(typeof Worker==='undefined'){
            store(decideBotCommand(request));
            if(paced()){const next=this.readyBot!;this.readyBot=undefined;changed=this.acceptBot(room,next.view,next.decision)||changed}
          }else if([...this.sockets.values()].includes(room.id)){
            this.pendingBot={roomId:room.id,matchId:view.matchId,version:view.version,requestId:request.requestId};this.broadcast(room);
            void this.botRunner.request(request).then(decision=>{
              if(this.pendingBot?.requestId!==request.requestId)return;
              this.pendingBot=undefined;if(decision)store(decision);
              // Already paced (the table is still): play at once rather than waiting for the next tick.
              if(this.readyBot&&paced()){const next=this.readyBot;this.readyBot=undefined;if(this.acceptBot(room,next.view,next.decision))this.saveRoom(room)}
              this.broadcast(room);
            });
          }
        }
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
  getReplay(roomId:string){const room=this.roomFor(roomId);return clone({...(room.experiment?{experiment:room.experiment}:{}),initialState:room.initialState,journal:room.journal,seed:room.seed,loadouts:room.seats.map(seat=>seat.loadout),skipSetup:room.skipSetup,difficulty:room.difficulty,strategy:room.strategy,setupMode:room.setupMode,botVersion:room.botVersion,botSeed:room.botSeed,botDecisions:room.botDecisions??[],...(room.tutorial?{lessonId:room.tutorial.lessonId}:{}),...(room.scenario?{practiceScenario:room.scenario.id}:{})})}
  connect(roomId:string):GameSocket {const room=this.roomFor(roomId);const socket=new LocalSocket(data=>{
      const message=JSON.parse(data);
      if(message.type==='ping')socket.deliver({type:'pong',at:this.now()});
      else if(message.type==='reconnect')socket.deliver({type:'state',...this.snapshot(room)});
      else if(message.type==='command')socket.deliver({type:'ack',...this.execute(room,message.command??message)});
    },()=>{this.sockets.delete(socket);if(![...this.sockets.values()].includes(roomId)&&this.pendingBot?.roomId===roomId)this.cancelBot()});
    this.sockets.set(socket,roomId);queueMicrotask(()=>socket.open({type:'state',...this.snapshot(room)}));return socket;
  }
  request<T=any>(path:string,input:any={},method='GET'):T {
    const url=new URL(path,'http://local.invalid'),route=url.pathname;
    // Other tabs may have advanced the durable profile while this instance was idle.
    try{const stored=JSON.parse(this.options.persistentStorage.getItem(profileKey)||'null');if(stored?.id===this.profile.id&&Array.isArray(stored.offers)){this.profile=stored;this.profile.revision=profileRevision(stored)}}catch{}
    if(route==='/api/session'&&method==='POST'){this.saveProfile();return clone({token:'local-guest',profile:this.profile}) as T}
    if(route==='/api/capabilities')return {localArt:true,localText:true,extract:false,textProvider:false,imageProvider:false,voiceProvider:false,localGuest:true,experimental:{challenges:true,boss:true,bestOfThree:true},offerRevision:true,offerIdempotency:true,generation:{text:{available:true,provider:'local'},image:{available:false,provider:'none'},extract:{available:false,provider:'none'},reference:{available:true,provider:'browser'},localAssembly:{available:true,provider:'bundled'}}} as T;
    if(route==='/api/profile'){
      if(method==='PATCH'){try{const next=patchProfile(this.profile,input,(profile,loadout)=>this.loadoutFor(loadout,'p1',profile));this.commitProfile(next)}catch(error){if(error instanceof ProfileWriteError)throw new LocalBackendError(error.message,error.status,error.code,error.profile as Profile);throw error}}
      return clone(this.profile) as T;
    }
    if(route==='/api/migrations/preview'&&method==='POST'){try{return previewMigration(this.profile,input) as T}catch(error){if(error instanceof OfferSaveError)throw new LocalBackendError(error.message,error.status,error.code);throw error}}
    if(route==='/api/migrations/commit'&&method==='POST'){try{const result=commitMigration(this.profile,input,()=>id('offer'));this.commitProfile(result.profile);return clone(result) as T}catch(error){if(error instanceof ProfileWriteError)throw new LocalBackendError(error.message,error.status,error.code,error.profile as Profile);if(error instanceof OfferSaveError)throw new LocalBackendError(error.message,error.status,error.code);throw error}}
    const reviseOffer=route.match(/^\/api\/offers\/([^/]+)$/);
    if(route==='/api/offers'&&method==='POST'||reviseOffer&&method==='PATCH'){
      const next=clone(this.profile);
      try{
        const result=saveOffer(next,input,{newId:()=>id('offer'),targetId:method==='PATCH'?reviseOffer![1]:undefined,now:this.now()});
        try{this.options.persistentStorage.setItem(profileKey,JSON.stringify(next))}catch{throw new LocalBackendError('设备未能保存收藏，请释放存储空间后重试',507,'STORAGE_FULL')}
        this.profile=next;const offer=result.offer;
        return clone({...result,profileRevision:profileRevision(next),job:{id:`local-${offer.id}-${offer.definitionRevision}`,state:'ready',stage:'local',offerId:offer.id,definitionRevision:offer.definitionRevision,draftRevision:offer.draftRevision},creative:{name:offer.name,description:offer.persona!.description,quote:offer.persona!.quote}}) as T;
      }catch(error){if(error instanceof OfferSaveError)throw new LocalBackendError(error.message,error.status,error.code);throw error}
    }
    const restoreMatch=route.match(/^\/api\/offers\/([^/]+)\/restore$/);
    const offerMatch=route.match(/^\/api\/offers\/([^/]+)(?:\/(appearance))?$/);
    if(restoreMatch&&method==='POST'||offerMatch&&method==='DELETE'&&!offerMatch[2]){
      const next=clone(this.profile);
      try{const result=restoreMatch?restoreOffer(next,restoreMatch[1],this.now()):deleteOffer(next,offerMatch![1],this.now());
        try{this.options.persistentStorage.setItem(profileKey,JSON.stringify(next))}catch{throw new LocalBackendError('设备未能保存变更，请释放存储空间后重试',507,'STORAGE_FULL')}
        this.profile=next;return clone({...result,profileRevision:profileRevision(next)}) as T;
      }catch(error){if(error instanceof OfferSaveError)throw new LocalBackendError(error.message,error.status,error.code);throw error}
    }
    if(offerMatch)throw new LocalBackendError('本地模式使用随包插画，未连接生成服务',400,'PROVIDER_UNAVAILABLE');
    if(route==='/api/generation/jobs')return {jobs:[]} as T;
    if(route==='/api/rooms'&&method==='POST'){
      if(input.tempo||input.variant||input.experimental)throw new LocalBackendError('数值实验仅由独立配对实验器运行',400,'EXPERIMENT_DISABLED');
      if(input.experiment&&(input.experiment.enabled!==true||!['challenge','boss','series'].includes(input.experiment.kind)||input.training!==true||input.lessonId||input.practiceScenario||input.mode==='friend'))throw new LocalBackendError('实验只支持明确启用的独立单人练习',400,'EXPERIMENT_DISABLED');
      if(input.mode==='friend')throw new LocalBackendError('注册或登录后才能和朋友联机',401,'AUTH_REQUIRED');
      if(input.lessonId!==undefined&&(!isLessonId(input.lessonId)||input.training!==true||input.practiceScenario))throw new LocalBackendError('教程只支持明确选择的单人练习课程');
      if(input.practiceScenario&&(input.training!==true||!showcaseCatalog.some(s=>s.id===input.practiceScenario)))throw new LocalBackendError('演示场景仅用于明确选择的单人练习');
      const strategy:Strategy=['aggressive','control','growth'].includes(input.strategy)?input.strategy:'aggressive';
      // Lessons keep their authored mentor; every other practice table deals a fresh opponent from the public templates.
      const botSeed=seed(),opponent=input.lessonId?{name:'前辈 · 秋招导师',loadout:defaultLoadout('p2','前辈 · 秋招导师',5)}:botOpponent(strategy,botSeed);
      const seats=[{id:'p1',name:this.profile.nickname,isBot:false,ready:true,loadout:this.loadoutFor(input.lessonId?{presetIndex:5}:input.loadout)},{id:'p2',name:opponent.name,isBot:true,ready:true,loadout:opponent.loadout}];
      const room={trackAchievements:input.achievementsEnabled===true,id:id('local'),code:'LOCAL',mode:'bot',strategy,difficulty:normalizeDifficulty(input.difficulty),setupMode:normalizeSetupMode(input.setupMode,input.skipSetup===true),botVersion:BOT_VERSION,botSeed,training:input.training===true,seats,seed:seed(),...(input.lessonId?{tutorial:{lessonId:input.lessonId,stepIndex:0}}:{}),...(input.practiceScenario?{scenario:showcaseCatalog.find(s=>s.id===input.practiceScenario)}:{})} as LocalRoom;
      if(input.experiment){if(input.experiment.kind==='series'){room.experiment=seriesDescriptor();room.series=createSeries(seats.map(s=>s.loadout) as [Loadout,Loadout],experimentFlags({series:true}));}else{const fixture=input.experiment.kind==='challenge'?createChallenge(input.experiment.id,experimentFlags({challenges:true})):createBoss(input.experiment.id,experimentFlags({boss:true}));room.experiment=fixture.descriptor;if(input.experiment.kind==='boss')room.difficulty='hard';}room.training=true;}
      this.start(room,room.setupMode==='quick');this.rooms.set(room.id,room);this.activeRoomId=room.id;this.saveRoom(room);return this.snapshot(room) as T;
    }
    if(route==='/api/rooms/join')throw new LocalBackendError('注册或登录后才能加入好友房',401,'AUTH_REQUIRED');
    const match=route.match(/^\/api\/rooms\/([^/]+)(?:\/(command|ready|replay|rematch))?$/);
    if(match){const room=this.roomFor(match[1]),action=match[2];
      if(action==='command'&&method==='POST')return this.execute(room,input) as T;
      if(action==='rematch'&&method==='POST'){
        if(room.status!=='finished'&&!(room.tutorial&&getTutorialView(room.state,room.tutorial).completed))throw new LocalBackendError('结束对局后可以重赛',409);
        if(room.series){if(input.flexDeck)room.series=setSeriesFlex(room.series,'p1',input.flexDeck);const next=seriesNextLoadouts(room.series);room.series=next.series;room.seats.forEach((seat,index)=>seat.loadout=next.loadouts[index]);}
        room.seed=seed();this.start(room);this.activeRoomId=room.id;this.saveRoom(room);this.broadcast(room);return this.snapshot(room) as T;
      }
      if(action==='replay'&&method==='GET'){
        const requested=url.searchParams.get('matchId');if(requested&&requested!==room.state.matchId)throw new LocalBackendError('游客只保留当前对局回放，长期保存请登录',404,'REPLAY_NOT_FOUND');
        let state=clone(room.initialState);const frames=[getView(state,'p1')];for(const entry of room.journal){const next=applyCommand(state,entry.actorId,entry.command);if(next.error)throw Error('回放日志校验失败');state=next.state;frames.push(getView(state,'p1'))}
        return clone({...(room.experiment?{experiment:room.experiment}:{}),matchId:state.matchId,rulesVersion:state.rulesVersion,difficulty:room.difficulty,strategy:room.strategy,setupMode:room.setupMode,botVersion:room.botVersion,botDecisions:room.botDecisions??[],frames,events:getView(state,'p1').events,result:state.result,verified:canonical(state)===canonical(room.state)}) as T;
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
