import {bumpProfile} from './profile-sync';
import {compileOffer} from './offers';
import {createPersona,generationPreferences,localPersonaArt} from './draft-persona';
import type {OfferDefinition,OfferProfile,Loadout} from './types';

export interface OfferSaveReceipt {fingerprint:string;offer:OfferDefinition;at:number}
export interface OfferLibrary {revision?:number;deletedOffers?:DeletedOffer[];offers:OfferDefinition[];loadout?:Loadout;offerSaveReceipts?:Record<string,OfferSaveReceipt>}
export class OfferSaveError extends Error {constructor(message:string,public status=400,public code='INVALID_OFFER'){super(message)}}
const canonical=(input:unknown):string=>JSON.stringify(input,(_,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])):value);
export function normalizeOfferProfile(source:any):OfferProfile {
 if(!source||typeof source!=='object'||Array.isArray(source))throw new OfferSaveError('请确认 Offer 基础字段');
 const values:Record<string,number>={};
 for(const key of ['monthly_fixed_cny','guaranteed_months','annual_fixed_allowance_cny','annual_target_bonus_cny','annual_equity_cny','one_time_signing_cny']){
  if(source[key]===null||source[key]===undefined||source[key]==='')throw new OfferSaveError(`请确认缺失字段：${key}`);
  const value=Number(source[key]);if(!Number.isFinite(value)||value<0||value>1e10)throw new OfferSaveError(`金额或月数无效：${key}`);values[key]=value;
 }
 if(values.monthly_fixed_cny<=0||values.guaranteed_months<1||values.guaranteed_months>36)throw new OfferSaveError('请填写有效月薪与保证发薪月数（1—36）');
 // Keep only the profile schema. Arbitrary draft payloads never become public card metadata.
 const profile:Record<string,unknown>={...values};
 for(const key of ['company_display_name','role_title','city','ownership','industry','company_stage','role_family','card_display_name'])if(source[key]!==undefined)profile[key]=String(source[key]).trim().slice(0,60);
 for(const key of ['selected_template_id','city_cost_level','work_nature','work_schedule'])if(source[key]!==undefined)profile[key]=source[key];
 profile.role_title??='综合业务岗';profile.city??='';
 profile.confirmed_benefits=Array.isArray(source.confirmed_benefits)?source.confirmed_benefits.filter((value:unknown)=>typeof value==='string'&&/^B0[1-7]$/.test(value)):[];
 if(!profile.company_display_name)throw new OfferSaveError('请填写公司显示名');
 return profile as unknown as OfferProfile;
}
/** One deterministic transaction shared by local, Node and Cloudflare persistence. */
export function saveOffer(library:OfferLibrary,input:any,options:{newId:()=>string;targetId?:string;now?:number;maxOffers?:number}) {
 const intent=options.targetId?'revise':input.intent??'create';
 if(!['create','revise','copy'].includes(intent)||intent==='revise'&&!options.targetId)throw new OfferSaveError('请选择创建、修订或另存副本');
 const profile=normalizeOfferProfile(input.profile),benefitId=input.benefitId??input.selectedBenefitId??null;
 let preferences;try{preferences=generationPreferences(input.preferences??input.creative?.preferences)}catch(error){throw new OfferSaveError((error as Error).message)}
 const draftRevision=input.draftRevision??1;
 if(!Number.isSafeInteger(draftRevision)||draftRevision<1)throw new OfferSaveError('草稿版本无效');
 const characterSeed=input.characterSeed;if(characterSeed!==undefined&&(typeof characterSeed!=='string'||!/^[a-f0-9]{8}$/.test(characterSeed)))throw new OfferSaveError('角色标识无效');
 const key=input.idempotencyKey;
 if(key!==undefined&&(typeof key!=='string'||!/^[a-zA-Z0-9_-]{8,160}$/.test(key)||['__proto__','constructor','prototype'].includes(key)))throw new OfferSaveError('保存操作标识无效');
 const fingerprint=canonical({intent,targetId:options.targetId,profile,benefitId,preferences,draftRevision,characterSeed,expectedDefinitionRevision:input.expectedDefinitionRevision,sourceOfferId:input.sourceOfferId});
 const receipt=key?library.offerSaveReceipts?.[key]:undefined;
 if(receipt){if(receipt.fingerprint!==fingerprint)throw new OfferSaveError('这个保存操作已用于其他草稿，请重新确认',409,'IDEMPOTENCY_CONFLICT');return {offer:structuredClone(receipt.offer),duplicate:true};}
 const existing=options.targetId?library.offers.find(offer=>offer.id===options.targetId):undefined;
 if(options.targetId&&!existing)throw new OfferSaveError('要修订的 Offer 不存在',404,'OFFER_NOT_FOUND');
 if(existing&&input.expectedDefinitionRevision!==(existing.definitionRevision??1))throw new OfferSaveError('这张卡已在其他页面修订，请重新载入后比较修改',409,'OFFER_REVISION_CONFLICT');
 if(intent==='copy'&&input.sourceOfferId&&!library.offers.some(offer=>offer.id===input.sourceOfferId))throw new OfferSaveError('原卡不存在，请以新卡保存',404,'OFFER_NOT_FOUND');
 if(!existing&&library.offers.length>=(options.maxOffers??1000))throw new OfferSaveError('收藏已满，请先整理一些卡牌',409,'COLLECTION_FULL');
 let offer:OfferDefinition;
 try{offer=compileOffer(profile,benefitId,existing?.id??options.newId());}catch(error){throw new OfferSaveError((error as Error).message);}
 offer.definitionRevision=(existing?.definitionRevision??(existing?1:0))+1;offer.draftRevision=draftRevision;
 offer.persona=createPersona(offer,preferences,existing?.persona?.seed??characterSeed);
 offer.artId=existing?.persona?.preferences.appearance===preferences.appearance?existing.artId:localPersonaArt(offer,preferences);
 if(existing){library.offers=library.offers.map(value=>value.id===offer.id?offer:value);if(library.loadout)library.loadout={...library.loadout,offers:library.loadout.offers.map(value=>value.id===offer.id?structuredClone(offer):value)};}
 else library.offers.push(offer);
 if(key){library.offerSaveReceipts??={};library.offerSaveReceipts[key]={fingerprint,offer:structuredClone(offer),at:options.now??Date.now()};const entries=Object.entries(library.offerSaveReceipts).sort((a,b)=>a[1].at-b[1].at);for(const [old]of entries.slice(0,Math.max(0,entries.length-64)))delete library.offerSaveReceipts[old];}
 bumpProfile(library);return {offer:structuredClone(offer),duplicate:false};
}

export interface DeletedOffer {offer:OfferDefinition;deletedAt:number;expiresAt:number}
export function deleteOffer(library:OfferLibrary,id:string,now=Date.now()){
 library.deletedOffers=(library.deletedOffers??[]).filter(value=>value.expiresAt>now);
 const offer=library.offers.find(value=>value.id===id);
 if(!offer){const previous=library.deletedOffers.find(value=>value.offer.id===id);if(previous)return {ok:true,duplicate:true,deletedOffer:structuredClone(previous),affectedLoadout:false,loadout:library.loadout};throw new OfferSaveError('Offer 不存在',404,'OFFER_NOT_FOUND');}
 const affectedLoadout=!!library.loadout?.offers.some(value=>value.id===id);
 const deletedOffer={offer:structuredClone(offer),deletedAt:now,expiresAt:now+30*86400000};
 library.deletedOffers.push(deletedOffer);library.offers=library.offers.filter(value=>value.id!==id);
 // An incomplete loadout must be rebuilt explicitly before a new game. Running rooms own snapshots.
 if(affectedLoadout)delete library.loadout;
 bumpProfile(library);return {ok:true,duplicate:false,deletedOffer:structuredClone(deletedOffer),affectedLoadout,loadout:library.loadout};
}
export function restoreOffer(library:OfferLibrary,id:string,now=Date.now(),maxOffers=1000){
 const existing=library.offers.find(value=>value.id===id);if(existing)return {ok:true,offer:structuredClone(existing),duplicate:true};
 const deleted=library.deletedOffers?.find(value=>value.offer.id===id&&value.expiresAt>now);if(!deleted)throw new OfferSaveError('回收站中没有这张卡，或已超过 30 天恢复期',404,'OFFER_NOT_FOUND');
 if(library.offers.length>=maxOffers)throw new OfferSaveError('收藏已满，请先整理一些卡牌',409,'COLLECTION_FULL');
 library.offers.push(structuredClone(deleted.offer));library.deletedOffers=library.deletedOffers!.filter(value=>value.offer.id!==id);
 bumpProfile(library);return {ok:true,offer:structuredClone(deleted.offer),duplicate:false};
}
