import {compileOffer,defaultLoadout,exampleOffers,applyCommand,getView,createMatch} from '../src/game/index';
import type {Loadout,OfferDefinition,OfferProfile,MatchState,Command} from '../src/game/types';
export interface Env {ACCOUNTS:DurableObjectNamespace;ROOMS:DurableObjectNamespace;ALLOWED_ORIGINS:string;TURN_MS?:string;SETUP_MS?:string;ROOM_RETENTION_MS?:string;WAITING_RETENTION_MS?:string;MAX_SAVED_MATCHES?:string}
export interface Profile {id:string;nickname:string;offers:OfferDefinition[];loadout?:Loadout}
export interface Principal {account:{id:string;username:string;nickname:string};profile:Profile;expires:number;tokenHash:string}
export interface Journal {actorId:string;command:Command}
export interface RecordInput {initialState:MatchState;journal:Journal[];seed?:number;loadouts?:[Loadout,Loadout];skipSetup?:boolean;selfId?:string}
export const DAY=86400000;
export class Fault extends Error {constructor(public status:number,message:string,public code='REQUEST_REJECTED'){super(message);}}
export const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export const failure=(error:unknown)=>error instanceof Fault?json({ok:false,error:error.message,errorCode:error.code},error.status):json({ok:false,error:'服务暂时不可用，请稍后再试',errorCode:'SERVER_ERROR'},500);
export const uid=(prefix:string)=>prefix+'_'+crypto.randomUUID();
export const random=(bytes=32)=>Array.from(crypto.getRandomValues(new Uint8Array(bytes)),b=>b.toString(16).padStart(2,'0')).join('');
export async function hash(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}
export function stable(value:unknown):string {return JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);}
export function nickname(value:unknown){return typeof value==='string'&&value.trim()?value.trim().slice(0,24):'秋招挑战者';}
export async function body(request:Request,maxBytes=1000000):Promise<any>{
 if(Number(request.headers.get('Content-Length')??0)>maxBytes)throw new Fault(413,'请求过大');
 if(!request.body)return {};
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw new Fault(413,'请求过大');}chunks.push(value);}
 const data=new Uint8Array(size);let at=0;for(const c of chunks){data.set(c,at);at+=c.byteLength;}
 try{const value=JSON.parse(new TextDecoder().decode(data)||'{}');if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}catch{throw new Fault(400,'请求需要有效 JSON 对象');}
}
export function compile(input:any,id:string,benefitId:string|null=null):OfferDefinition {
 if(!input||typeof input!=='object')throw new Fault(400,'请确认 Offer 基础字段');
 const values:Record<string,number>={};
 for(const key of ['monthly_fixed_cny','guaranteed_months','annual_fixed_allowance_cny','annual_target_bonus_cny','annual_equity_cny','one_time_signing_cny']){const v=input[key];if(v===null||v===undefined||v===''||!Number.isFinite(Number(v))||Number(v)<0||Number(v)>1e10)throw new Fault(400,'请确认薪酬字段');values[key]=Number(v);}
 if(values.monthly_fixed_cny<=0||values.guaranteed_months<1||values.guaranteed_months>36)throw new Fault(400,'薪酬与发薪月数无效');
 const p={...input,...values,company_display_name:String(input.company_display_name??'').trim().slice(0,60),role_title:String(input.role_title??'综合业务岗').slice(0,60),city:String(input.city??'').slice(0,60),confirmed_benefits:Array.isArray(input.confirmed_benefits)?input.confirmed_benefits.filter((b:unknown)=>typeof b==='string'&&/^B0[1-7]$/.test(b)):[]} as OfferProfile;
 if(!p.company_display_name||benefitId&&!p.confirmed_benefits.includes(benefitId))throw new Fault(400,'公司或已确认条款无效');
 try{return compileOffer(p,benefitId,id);}catch(e){throw new Fault(400,(e as Error).message);}
}
export function loadoutFor(profile:Profile,input:any,playerId:string):Loadout {
 const fallback=defaultLoadout(playerId,profile.nickname,Number(input?.presetIndex??5));
 if(!input)return profile.loadout?{...structuredClone(profile.loadout),playerId,name:profile.nickname}:fallback;
 if(Array.isArray(input.offers))for(const candidate of input.offers){
  if(typeof candidate==='string'||!candidate?.id||exampleOffers.some(o=>o.id===candidate.id))continue;
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(candidate.id)||/^E\d+$/.test(candidate.id))throw new Fault(400,'自定义 Offer 标识无效');
  if(candidate.profile){const offer=compile(candidate.profile,candidate.id,candidate.benefitId??null);const i=profile.offers.findIndex(o=>o.id===offer.id);if(i>=0)profile.offers[i]=offer;else{if(profile.offers.length>=100)throw new Fault(409,'云端卡册最多保存 100 张自定义 Offer');profile.offers.push(offer);}}
 }
 const available=new Map([...exampleOffers,...profile.offers].map(o=>[o.id,o]));
 const requested=input.offerIds??input.offers?.map((o:any)=>typeof o==='string'?o:o.id);
 const offers=requested?requested.map((id:string)=>available.get(id)):fallback.offers;
 if(!Array.isArray(offers)||offers.length!==3||offers.some(o=>!o)||new Set(offers.map(o=>o.id)).size!==3)throw new Fault(400,'请选择三张不同的已收藏 Offer');
 const value={...fallback,playerId,name:profile.nickname,primaryId:input.primaryId??fallback.primaryId,secondaryId:input.secondaryId??fallback.secondaryId,offers:structuredClone(offers),baseDeck:input.baseDeck??fallback.baseDeck,flexDeck:input.flexDeck??fallback.flexDeck};
 if(!/^H(0[1-9]|10)$/.test(value.primaryId)||!/^S(0[0-9]|10)$/.test(value.secondaryId))throw new Fault(400,'学历选择无效');
 if(!Array.isArray(value.baseDeck)||value.baseDeck.length!==12||value.baseDeck.some((c:string)=>!/^N(0[1-9]|1[0-9]|2[0-4])$/.test(c))||value.baseDeck.some((c:string)=>value.baseDeck.filter((x:string)=>x===c).length>2))throw new Fault(400,'基础牌需要 12 张，同名最多 2 张');
 if(!Array.isArray(value.flexDeck)||value.flexDeck.length!==3||new Set(value.flexDeck).size!==3||value.flexDeck.some((c:string)=>!/^F0[1-6]$/.test(c)))throw new Fault(400,'请选择三张不同的应对牌');
 return value;
}
export function replay(record:RecordInput,selfId:string,requireFinished=true){
 if(!record?.initialState||!Array.isArray(record.journal)||record.journal.length>600)throw new Fault(400,'战报格式或长度无效');
 let state=structuredClone(record.initialState);
 const frame=()=>{const v=getView(state,selfId);return {...v,events:v.events.slice(-10),visualCues:v.visualCues.slice(-10)};};
 const frames=[frame()];
 for(const entry of record.journal){if(!entry||!state.players.some(p=>p.id===entry.actorId))throw new Fault(400,'战报玩家身份无效');const result=applyCommand(state,entry.actorId,entry.command);if(result.error)throw new Fault(400,'战报存在非法指令');state=result.state;frames.push(frame());}
 if(requireFinished&&state.phase!=='finished')throw new Fault(400,'仅可保存已完成的对局');
 const last=getView(state,selfId);
 return {frames,events:last.events,result:state.result,verified:true,matchId:state.matchId,rulesVersion:state.rulesVersion,round:state.round};
}
export function validateLocalRecord(record:RecordInput):RecordInput {
 if(!record?.initialState||record.initialState.version!==0||record.initialState.result||!Array.isArray(record.loadouts)||record.loadouts.length!==2||!Number.isSafeInteger(record.seed))throw new Fault(400,'本地战报需要完整初始阵容、种子和指令日志');
 const loadouts=record.loadouts.map((l,i)=>loadoutFor({id:'local',nickname:nickname(l.name),offers:[]},l,l.playerId)) as [Loadout,Loadout];
 const initial=createMatch(loadouts,record.seed,{skipSetup:record.skipSetup===true,matchId:record.initialState.matchId});
 if(stable(initial)!==stable(record.initialState))throw new Fault(400,'本地战报初始状态校验失败');
 const selfId=record.selfId??loadouts[0].playerId;
 if(!loadouts.some(p=>p.playerId===selfId))throw new Fault(400,'战报视角无效');
 replay(record,selfId);
 return {...record,initialState:initial,selfId};
}

/** Split JSON into small SQLite rows. No record can reach SQLite's 2 MB row limit. */
export class Documents {
 constructor(private sql:SqlStorage){sql.exec('CREATE TABLE IF NOT EXISTS documents (key TEXT NOT NULL, part INTEGER NOT NULL, value TEXT NOT NULL, PRIMARY KEY(key, part))');}
 get<T>(key:string):T|null{const rows=[...this.sql.exec<{value:string}>('SELECT value FROM documents WHERE key=? ORDER BY part',key)];return rows.length?JSON.parse(rows.map(r=>r.value).join('')):null;}
 put(key:string,value:unknown){const raw=JSON.stringify(value);if(raw.length>1500000)throw new Fault(413,'记录过大');this.remove(key);for(let i=0;i<raw.length;i+=100000)this.sql.exec('INSERT INTO documents VALUES (?, ?, ?)',key,i/100000,raw.slice(i,i+100000));}
 remove(key:string){this.sql.exec('DELETE FROM documents WHERE key=?',key);}
}
