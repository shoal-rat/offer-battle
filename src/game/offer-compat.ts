import {compileOffer,compileOfferForVersion,exampleOffers,exampleOffersForVersion,validateLoadout} from './offers';
import {OFFER_COMPILER_VERSION,type OfferCompilerVersion} from './offerTuning';
import type {Loadout,OfferDefinition} from './types';

const currentExamples=new Map(exampleOffers.map(offer=>[offer.id,offer]));
const historicalExamples=new Map<OfferCompilerVersion,Map<string,OfferDefinition>>();

function historicalVersion(value:unknown):OfferCompilerVersion {
  if(value===undefined||value==='2.0.0')return '2.0.0';
  if(value===OFFER_COMPILER_VERSION)return value;
  throw Error('不支持的 Offer 规则版本');
}
function customOffer(source:OfferDefinition,version?:OfferCompilerVersion):OfferDefinition {
  if(typeof source.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(source.id)||/^E\d+$/.test(source.id))throw Error('自定义 Offer 标识无效');
  if(!source.profile)throw Error('这张旧 Offer 缺少原始资料，请重新创建后用于新对局');
  for(const key of ['monthly_fixed_cny','guaranteed_months','annual_fixed_allowance_cny','annual_target_bonus_cny','annual_equity_cny','one_time_signing_cny'] as const){const value=source.profile[key];if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1e10)throw Error('请确认薪酬字段');}
  if(source.profile.monthly_fixed_cny<=0||source.profile.guaranteed_months<1||source.profile.guaranteed_months>36||typeof source.profile.company_display_name!=='string'||!source.profile.company_display_name.trim())throw Error('公司或薪酬字段无效');
  const compiled=version?compileOfferForVersion(source.profile,source.benefitId??null,source.id,version):compileOffer(source.profile,source.benefitId??null,source.id);
  // Art is cosmetic. Keep a saved custom appearance when only the rules change.
  if(typeof source.artId==='string'&&source.artId.length<=256)compiled.artId=source.artId;
  return compiled;
}

/** Every new match uses the current compiler, regardless of submitted version or stats. */
export function currentOffer(source:OfferDefinition):OfferDefinition {
  const publicOffer=currentExamples.get(source.id);
  return publicOffer?structuredClone(publicOffer):customOffer(source);
}
export function currentLoadout(source:Loadout):Loadout {
  const value={...structuredClone(source),offers:source.offers.map(currentOffer)};
  validateLoadout(value);
  return value;
}

/** Upgrade collections, never frozen match snapshots or their command journals. */
export function upgradeOfferCollection(profile:{offers:OfferDefinition[];loadout?:Loadout}):boolean {
  const before=JSON.stringify({offers:profile.offers,loadout:profile.loadout});
  // Incomplete legacy cards stay visible so that an account migration cannot lose data.
  const update=(offer:OfferDefinition)=>{try{return currentOffer(offer);}catch{return structuredClone(offer);}};
  profile.offers=profile.offers.map(update);
  if(profile.loadout){
    const available=new Map([...profile.offers,...exampleOffers].map(offer=>[offer.id,offer]));
    profile.loadout={...structuredClone(profile.loadout),offers:profile.loadout.offers.map(offer=>structuredClone(available.get(offer.id)??update(offer)))};
  }
  return before!==JSON.stringify({offers:profile.offers,loadout:profile.loadout});
}

/** Only replay reconstruction may select historical compiler versions. */
export function historicalLoadout(source:Loadout):Loadout {
  const offers=source.offers.map(offer=>{
    const version=historicalVersion(offer.rulesVersion);
    let catalog=historicalExamples.get(version);
    if(!catalog){catalog=new Map(exampleOffersForVersion(version).map(value=>[value.id,value]));historicalExamples.set(version,catalog);}
    const publicOffer=catalog.get(offer.id);
    return publicOffer?structuredClone(publicOffer):customOffer(offer,version);
  });
  const value={...structuredClone(source),offers};
  validateLoadout(value);
  return value;
}
