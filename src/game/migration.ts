import {compileOffer,exampleOffers} from './offers';
import {currentLoadout} from './offer-compat';
import {preserveOfferPresentation,generationPreferences} from './draft-persona';
import {normalizeOfferProfile,OfferSaveError,type OfferLibrary} from './draft-save';
import {canonicalData,checkProfileRevision,operationKey,profileRevision,type VersionedProfile} from './profile-sync';
import type {Loadout,OfferDefinition} from './types';
export type MigrationChoice='keep-both'|'use-cloud';
export interface MigrationInput {sourceId:string;offers:OfferDefinition[];loadout?:Loadout;nickname?:string;includeLoadout?:boolean;includeNickname?:boolean;choices?:Record<string,MigrationChoice>;expectedRevision?:number;idempotencyKey?:string}
export interface MigrationLibrary extends OfferLibrary,VersionedProfile {migrationReceipts?:Record<string,{fingerprint:string;idMap:Record<string,string>}>;migrationSources?:Record<string,Record<string,string>>}
export interface MigrationItem {localId:string;name:string;status:'new'|'duplicate'|'conflict';cloudId?:string;cloudName?:string}
const signature=(offer:OfferDefinition)=>canonicalData({profile:normalizeOfferProfile(offer.profile),benefitId:offer.benefitId,preferences:generationPreferences(offer.persona?.preferences)});
function incoming(input:MigrationInput){
 if(typeof input.sourceId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(input.sourceId)||['__proto__','constructor','prototype'].includes(input.sourceId))throw new OfferSaveError('本机来源标识无效');
 if(!Array.isArray(input.offers)||input.offers.length>100)throw new OfferSaveError('每次最多迁移 100 张卡');
 const seen=new Set<string>();return input.offers.map(source=>{if(!source||typeof source.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(source.id)||/^E\d+$/.test(source.id)||['__proto__','constructor','prototype'].includes(source.id)||seen.has(source.id))throw new OfferSaveError('迁移卡牌标识无效或重复');seen.add(source.id);
  let offer:OfferDefinition;try{offer=preserveOfferPresentation(source,compileOffer(normalizeOfferProfile(source.profile),source.benefitId,source.id));}catch(error){throw new OfferSaveError((error as Error).message)}return offer;
 });
}
function plan(profile:MigrationLibrary,input:MigrationInput){const offers=incoming(input),items:MigrationItem[]=[];for(const offer of offers){const same=profile.offers.find(value=>signature(value)===signature(offer));const previous=profile.migrationSources?.[input.sourceId]?.[offer.id],collision=profile.offers.find(value=>value.id===(previous??offer.id));const target=same??collision;items.push({localId:offer.id,name:offer.name,status:same?'duplicate':collision?'conflict':'new',...(target?{cloudId:target.id,cloudName:target.name}:{})});}return {offers,items};}
export function previewMigration(profile:MigrationLibrary,input:MigrationInput){return {revision:profileRevision(profile),items:plan(profile,input).items,canIncludeLoadout:!!input.loadout,localOriginalsPreserved:true};}
export function commitMigration<T extends MigrationLibrary>(profile:T,input:MigrationInput,newId:()=>string,maxOffers=1000){
 const key=operationKey(input.idempotencyKey),fingerprint=canonicalData(input);if(fingerprint.length>400000)throw new OfferSaveError('本次迁移资料过多，请分批迁移',413,'MIGRATION_TOO_LARGE');const receipt=profile.migrationReceipts?.[key];
 if(receipt){if(receipt.fingerprint!==fingerprint)throw new OfferSaveError('迁移操作标识已用于其他资料',409,'IDEMPOTENCY_CONFLICT');return {profile:structuredClone(profile),idMap:structuredClone(receipt.idMap),duplicate:true};}
 checkProfileRevision(profile,input.expectedRevision);const {offers,items}=plan(profile,input),next=structuredClone(profile),idMap:Record<string,string>=Object.create(null);
 for(let i=0;i<items.length;i++){const item=items[i],offer=offers[i];if(item.status==='duplicate'||item.status==='conflict'&&input.choices?.[item.localId]==='use-cloud'){idMap[item.localId]=item.cloudId!;continue;}
  if(item.status==='conflict'&&input.choices?.[item.localId]!=='keep-both')throw new OfferSaveError('请为冲突卡选择保留两份或使用云端',409,'MIGRATION_CHOICE_REQUIRED');
  // Also deduplicate equal local cards inside this one batch.
  const equivalent=next.offers.find(value=>signature(value)===signature(offer));if(equivalent){idMap[item.localId]=equivalent.id;continue;}
  if(next.offers.length>=maxOffers)throw new OfferSaveError('收藏空间不足，请减少本次迁移数量',409,'COLLECTION_FULL');
  const id=newId();next.offers.push({...offer,id,definitionRevision:1});idMap[item.localId]=id;
 }
 if(input.includeNickname){if(typeof input.nickname!=='string'||!input.nickname.trim())throw new OfferSaveError('迁移昵称无效');next.nickname=input.nickname.trim().slice(0,24);}
 if(input.includeLoadout){if(!input.loadout)throw new OfferSaveError('没有可迁移的阵容');const source=input.loadout;const available=new Map([...exampleOffers,...next.offers].map(o=>[o.id,o]));const mapped=source.offers?.map(o=>available.get(idMap[o.id]??o.id));if(!mapped||mapped.some(o=>!o))throw new OfferSaveError('阵容包含未选择迁移的卡牌');try{next.loadout=currentLoadout({...source,playerId:'p1',name:next.nickname,offers:mapped as OfferDefinition[]});}catch(error){throw new OfferSaveError((error as Error).message)}}
 next.revision=profileRevision(profile)+1;next.migrationSources??={};next.migrationSources[input.sourceId]={...(next.migrationSources[input.sourceId]??{}),...idMap};for(const old of Object.keys(next.migrationSources).slice(0,-20))delete next.migrationSources[old];
 next.migrationReceipts??={};next.migrationReceipts[key]={fingerprint,idMap};for(const old of Object.keys(next.migrationReceipts).slice(0,-2))delete next.migrationReceipts[old];
 return {profile:next,idMap:structuredClone(idMap),duplicate:false};
}
