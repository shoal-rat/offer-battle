import type {Loadout,OfferDefinition} from './types';
export interface VersionedProfile {id:string;nickname:string;offers:OfferDefinition[];loadout?:Loadout;revision?:number;profileWriteReceipts?:Record<string,{fingerprint:string;revision:number}>}
export const canonicalData=(input:unknown):string=>JSON.stringify(input,(_,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])):value);
export function profileRevision(profile:{revision?:number}){return Number.isSafeInteger(profile.revision)&&profile.revision!>=0?profile.revision!:0;}
export function bumpProfile(profile:{revision?:number}){profile.revision=profileRevision(profile)+1;}
export class ProfileWriteError extends Error {constructor(message:string,public status:number,public code:string,public profile?:VersionedProfile){super(message)}}
export function checkProfileRevision(profile:VersionedProfile,expected:unknown){
 if(!Number.isSafeInteger(expected)||Number(expected)<0)throw new ProfileWriteError('请先读取最新存档版本，再保存修改',428,'PROFILE_REVISION_REQUIRED',structuredClone(profile));
 if(expected!==profileRevision(profile))throw new ProfileWriteError('另一页已更新存档，请比较后选择要保留的版本',409,'PROFILE_REVISION_CONFLICT',structuredClone(profile));
}
export function operationKey(value:unknown){if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{8,160}$/.test(value)||['__proto__','constructor','prototype'].includes(value))throw new ProfileWriteError('保存操作标识无效',400,'INVALID_OPERATION');return value;}
/** The caller commits this clone only after durable persistence succeeds. */
export function patchProfile<T extends VersionedProfile>(profile:T,input:any,resolveLoadout:(profile:T,input:any)=>Loadout):T{
 const fingerprint=canonicalData({nickname:input.nickname,loadout:input.loadout,expectedRevision:input.expectedRevision}),key=input.idempotencyKey===undefined?undefined:operationKey(input.idempotencyKey);
 const receipt=key?profile.profileWriteReceipts?.[key]:undefined;
 if(receipt){if(receipt.fingerprint!==fingerprint)throw new ProfileWriteError('保存标识已用于其他修改',409,'IDEMPOTENCY_CONFLICT');return structuredClone(profile);}
 checkProfileRevision(profile,input.expectedRevision);const next=structuredClone(profile);
 if(input.nickname!==undefined){if(typeof input.nickname!=='string'||!input.nickname.trim())throw new ProfileWriteError('请填写昵称',400,'INVALID_PROFILE');next.nickname=input.nickname.trim().slice(0,24);}
 if(input.loadout!==undefined){if(!input.loadout||typeof input.loadout!=='object')throw new ProfileWriteError('阵容格式无效',400,'INVALID_PROFILE');next.loadout=resolveLoadout(next,input.loadout);}
 bumpProfile(next);
 if(key){next.profileWriteReceipts??={};next.profileWriteReceipts[key]={fingerprint,revision:profileRevision(next)};for(const old of Object.keys(next.profileWriteReceipts).slice(0,-32))delete next.profileWriteReceipts[old];}
 return next;
}
