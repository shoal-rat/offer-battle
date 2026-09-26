import {invitationCode,type InvitationPreview} from './game/invitation';
import type {MigrationInput,MigrationItem} from './game/migration';
import {sanitizedErrorReport,LocalDiagnosticLog} from './game/diagnostics';
import type {DeletedOffer} from './game/draft-save';
import type {TutorialPresentation} from './components/TutorialGuide';
import type {MatchView,Loadout,OfferDefinition,GameEvent,Command} from './game/types';
import {apiUrl,webSocketUrl} from './deployment';
import {LocalBackend,LocalBackendError,type GameSocket} from './local-backend';
export type {GameSocket} from './local-backend';
export interface Profile {achievements?:import('./game/experiments/achievements').AchievementEvidence[];revision?:number;deletedOffers?:DeletedOffer[];id:string;nickname:string;offers:OfferDefinition[];loadout?:Loadout}
export interface Account {id:string;username:string;nickname:string}
export interface AccountResponse {token:string;profile:Profile;account:Account;recoveryKey?:string}
export interface Room {earnedAchievements?:import('./game/experiments/achievements').AchievementEvidence[];experimentId?:string;experiment?:import('./game/experiments/features').ExperimentDescriptor&{solved?:boolean};series?:ReturnType<typeof import('./game/experiments/series').seriesSummary>;difficulty?:import('./game/ai/types').BotDifficulty;strategy?:import('./game/ai/types').BotStyle;setupMode?:import('./game/ai/types').SetupMode;botVersion?:string;botThinking?:boolean;id:string;code:string;status:string;mode:string;players:{id:string;name:string;ready:boolean;connected:boolean;isBot:boolean}[];deadline:number|null;version:number;tutorial?:TutorialPresentation;scenario?:{id:string;title:string;instructions:string[]}}
export interface RoomResponse {room:Room;view:MatchView|null;events?:GameEvent[];roomId?:string;playerId?:string;rejection?:string;ok?:boolean}
export class ApiError extends Error{constructor(message:string,public code?:string,public status?:number,public profile?:Profile){super(message);this.name='ApiError'}}
export const isStaticMode=import.meta.env?.VITE_STATIC_MODE==='true';
const saved=(key:string)=>{if(typeof window==='undefined')return '';try{return localStorage.getItem(key)||''}catch{return ''}};
const write=(key:string,value:string)=>{try{localStorage.setItem(key,value)}catch{}};
let token=saved('offer-session'),local:LocalBackend|undefined;
const localBackend=()=>local??=new LocalBackend({persistentStorage:localStorage,transientStorage:sessionStorage});
const accountToken=()=>saved('offer-account-token');
const cloudRooms=new Set<string>();
try{for(const roomId of JSON.parse(sessionStorage.getItem('offer-cloud-rooms')||'[]'))if(typeof roomId==='string')cloudRooms.add(roomId)}catch{}
export function isCloudRoom(roomId:string){return roomId.startsWith('cloud_')||cloudRooms.has(roomId)}
export function currentAccount():Account|null {try{const account=JSON.parse(saved('offer-account'));return accountToken()&&account?.id&&account?.username?account:null}catch{return null}}
function notifyAccount(){if(typeof window!=='undefined')window.dispatchEvent(new Event('offer-account-change'))}
function rememberAccount(result:AccountResponse){write('offer-account-token',result.token);write('offer-account',JSON.stringify(result.account));notifyAccount()}
function clearAccount(expectedToken?:string){if(expectedToken!==undefined&&accountToken()!==expectedToken)return;try{localStorage.removeItem('offer-account-token');localStorage.removeItem('offer-account')}catch{}notifyAccount()}
function rememberCloudRoom(data:any){const roomId=data?.room?.id;if(typeof roomId==='string'){cloudRooms.add(roomId);try{sessionStorage.setItem('offer-cloud-rooms',JSON.stringify([...cloudRooms]))}catch{}}}
function outcomeError(data:any,status?:number){return new ApiError(typeof data.error==='string'?data.error:typeof data.rejection==='string'?data.rejection:data.error?.message||data.rejection?.message||'操作未完成，请重试',data.errorCode??data.code,status,data.profile?.id&&Array.isArray(data.profile.offers)?data.profile:undefined)}
interface RequestOptions {signal?:AbortSignal}
async function remote<T>(path:string,body:unknown,method:string|undefined,credential:string,options:RequestOptions={}):Promise<T>{
  const response=await fetch(apiUrl(path),{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json',...(credential?{Authorization:`Bearer ${credential}`}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:options.signal});
  let data:any;try{data=await response.json()}catch{throw new ApiError('游戏服务暂时不可用，请稍后重试',undefined,response.status)}
  if(!response.ok||data.ok===false)throw outcomeError(data,response.status);return data;
}
/** Cloud identity never replaces the guest profile, loadout or running local match. */
export async function accountApi<T=any>(path:string,body?:unknown,method?:string,options:RequestOptions={}):Promise<T>{
  const auth=/^\/api\/auth\/(register|login|recover)$/.test(path);
  if(!auth&&!accountToken())throw new ApiError('请注册或登录后使用好友联机和云端对局记录','AUTH_REQUIRED',401);
  const credential=auth?'':accountToken();
  try {
    const data=await remote<T>(path,body,method,credential,options);
    if(auth&&(data as any)?.token&&(data as any)?.account)rememberAccount(data as AccountResponse);
    rememberCloudRoom(data);return data;
  }catch(error){if(error instanceof ApiError&&error.status===401&&!auth)clearAccount(credential);throw error}
}
export const registerAccount=(input:{username:string;password:string;nickname?:string})=>accountApi<AccountResponse>('/api/auth/register',input);
export const loginAccount=(input:{username:string;password:string})=>accountApi<AccountResponse>('/api/auth/login',input);
export async function logoutAccount(){const credential=accountToken();try{if(credential)await accountApi('/api/auth/logout',{})}finally{clearAccount(credential)}}
export function getLocalReplay(roomId:string){return localBackend().getReplay(roomId)}
export async function api<T=any>(path:string,body?:unknown,method?:string,options:RequestOptions={}):Promise<T>{
  if(!isStaticMode)return remote<T>(path,body,method,token,options);
  const roomId=path.match(/^\/api\/rooms\/([^/?]+)/)?.[1];
  const friend=path==='/api/rooms'&&(body as any)?.mode==='friend';
  if(friend||path==='/api/rooms/join'||(roomId&&isCloudRoom(roomId)))return accountApi<T>(path,body,method,options);
  if(options.signal?.aborted)throw new DOMException('The request was aborted','AbortError');
  try {const data=localBackend().request<T>(path,body,method||(body?'POST':'GET'));if((data as any).ok===false)throw outcomeError(data,409);return data}
  catch(error){if(error instanceof LocalBackendError)throw new ApiError(error.message,error.code,error.status,error.profile);throw error}
}
let sessionPromise:Promise<Profile>|null=null;
export function session(){if(!sessionPromise)sessionPromise=api<{token:string;profile:Profile}>('/api/session',{nickname:saved('offer-name')||'秋招挑战者',...(!isStaticMode&&token?{token}:{})}).then(d=>{if(!isStaticMode){token=d.token;write('offer-session',token)}return d.profile}).catch(e=>{sessionPromise=null;throw e});return sessionPromise}
export function socket(roomId:string):GameSocket{
  if(isStaticMode&&!isCloudRoom(roomId))return localBackend().connect(roomId);
  if(isStaticMode&&!accountToken())throw new ApiError('登录已失效，请重新登录好友房','AUTH_REQUIRED',401);
  return new WebSocket(webSocketUrl(roomId,isStaticMode?accountToken():token,location.origin));
}
export function sendCommand(room:Room,view:MatchView,command:Command){return api<RoomResponse>(`/api/rooms/${room.id}/command`,{matchId:view.matchId,commandId:crypto.randomUUID(),expectedStateVersion:view.version,type:command.type,payload:command})}

export async function getInvitationPreview(value:string):Promise<InvitationPreview>{const code=invitationCode(value);if(!code)return {status:'not-found'};return remote('/api/invitations/'+code,undefined,'GET','');}
export function migrationSource():MigrationInput {const profile=localBackend().request<Profile>('/api/profile');return {sourceId:profile.id,offers:profile.offers,nickname:profile.nickname,...(profile.loadout?{loadout:profile.loadout}:{})};}
export const previewAccountMigration=(input:MigrationInput)=>accountApi<{revision:number;items:MigrationItem[];canIncludeLoadout:boolean;localOriginalsPreserved:true}>('/api/migrations/preview',input);
export const commitAccountMigration=(input:MigrationInput)=>accountApi<{profile:Profile;idMap:Record<string,string>;duplicate:boolean}>('/api/migrations/commit',input);
export const diagnosticLog=new LocalDiagnosticLog();
export {sanitizedErrorReport};
