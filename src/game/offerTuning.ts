import type { OfferProfile, OfferTuning } from './types';

export const OFFER_COMPILER_VERSION = '2.1.0';
export type OfferCompilerVersion = '2.0.0' | typeof OFFER_COMPILER_VERSION;
export const CITY_COST_OPTIONS = [
  {value:'auto',label:'根据城市匹配',description:'常见高成本城市偏排面，其余默认均衡；可按实际情况手动选择。'},
  {value:'high',label:'高生活成本',description:'排面倾向 +1，底气倾向 −1。'},
  {value:'medium',label:'生活成本适中',description:'均衡，不调整排面与底气。'},
  {value:'low',label:'低生活成本',description:'排面倾向 −1，底气倾向 +1。'},
] as const;
export const WORK_NATURE_OPTIONS = [
  {value:'standard',label:'普通全职',description:'均衡，不额外调整属性。'},
  {value:'permanent',label:'长期稳定岗位',description:'排面倾向 −1，底气倾向 +1。'},
  {value:'contract',label:'项目 / 短期合同',description:'排面倾向 +1，底气倾向 −1。'},
  {value:'dispatch',label:'外包 / 劳务派遣',description:'排面倾向 +1，底气倾向 −1。'},
  {value:'internship',label:'实习 / 培训岗位',description:'费用 −1，基础排面与底气随费用降低。'},
] as const;
export const WORK_SCHEDULE_OPTIONS = [
  {value:'standard',label:'常规工时',description:'不额外调整费用与属性。'},
  {value:'intensive',label:'高强度 / 经常加班',description:'费用 +1；排面倾向 +1，底气倾向 −1。'},
  {value:'flexible',label:'弹性 / 较短工时',description:'费用 −1；排面倾向 −1，底气倾向 +1。'},
  {value:'field',label:'驻场 / 轮班 / 常出差',description:'费用 +1；排面倾向 −1，底气倾向 +1。'},
] as const;

const highCostCities = new Set(['北京','上海','深圳','广州','杭州','香港']);
const clamp = (n:number,min:number,max:number) => Math.max(min,Math.min(max,n));
function option<T extends string>(value:unknown, choices:readonly {value:T}[], fallback:T, label:string):T {
  if(value===undefined)return fallback;
  if(typeof value!=='string'||!choices.some(o=>o.value===value))throw Error(`请选择有效的${label}`);
  return value as T;
}

/** Versioned game heuristics, not a live cost-of-living index or employer ranking. */
export function tuneOffer(profile:OfferProfile,salaryCost:number,template:{attack_delta:number;health_delta:number},benefit:boolean) {
  const cityChoice=option(profile.city_cost_level,CITY_COST_OPTIONS,'auto','城市生活成本');
  const workNature=option(profile.work_nature,WORK_NATURE_OPTIONS,'standard','工作性质');
  const schedule=option(profile.work_schedule,WORK_SCHEDULE_OPTIONS,'standard','工作节奏');
  const city=typeof profile.city==='string'?profile.city.trim().replace(/\s/g,'').replace(/市$/,''):'';
  const cityLevel=cityChoice==='auto'?(highCostCities.has(city)?'high':'medium'):cityChoice;
  const rows:OfferTuning['contributions']=[];
  const add=(key:string,label:string,detail:string,cost:number,tilt:number)=>rows.push({key,label,detail,cost,tilt});
  add('city','城市生活成本',cityLevel==='high'?'高生活成本':cityLevel==='low'?'低生活成本':'适中 / 未指定',0,cityLevel==='high'?1:cityLevel==='low'?-1:0);
  const industryTilt=['internet','gaming','game','finance','consulting'].includes(profile.industry)?1:['manufacturing','public_service','healthcare','education'].includes(profile.industry)?-1:0;
  const industryNames:Record<string,string>={internet:'互联网',gaming:'游戏',game:'游戏',finance:'金融',consulting:'咨询',manufacturing:'制造 / 硬件',public_service:'公共服务',healthcare:'医疗健康',education:'教育',other:'其他行业'};
  add('industry','行业风格',Object.hasOwn(industryNames,profile.industry)?industryNames[profile.industry]:'其他行业',0,industryTilt);
  const stableOwnership=['state_owned','central_state_owned','central_owned','foreign_owned'].includes(profile.ownership);
  add('ownership','公司性质',stableOwnership?'稳定经营倾向':'均衡经营倾向',0,stableOwnership?-1:0);
  add('stage','公司阶段',profile.company_stage==='startup'?'初创探索':'成熟 / 未指定',0,profile.company_stage==='startup'?1:0);
  add('nature','工作性质',WORK_NATURE_OPTIONS.find(o=>o.value===workNature)!.label,workNature==='internship'?-1:0,workNature==='permanent'?-1:['contract','dispatch'].includes(workNature)?1:0);
  add('schedule','工作节奏',WORK_SCHEDULE_OPTIONS.find(o=>o.value===schedule)!.label,schedule==='intensive'||schedule==='field'?1:schedule==='flexible'?-1:0,schedule==='intensive'?1:schedule==='flexible'||schedule==='field'?-1:0);
  const originalTime=clamp(salaryCost+rows.reduce((sum,row)=>sum+row.cost,0),2,7);
  const attack=Math.max(1,originalTime+template.attack_delta),health=Math.max(1,originalTime+template.health_delta);
  const requestedTilt=rows.reduce((sum,row)=>sum+row.tilt,0);
  // Move points between stats. Clamping the transfer (not each final stat) conserves the budget.
  const appliedTilt=clamp(clamp(requestedTilt,-2,2),1-attack,health-1);
  const beforeBenefit={attack:attack+appliedTilt,health:health-appliedTilt};
  const benefitPenalty={attack:benefit&&beforeBenefit.health===1&&beforeBenefit.attack>1?1:0,health:benefit&&beforeBenefit.health>1?1:0};
  const tuning:OfferTuning={version:OFFER_COMPILER_VERSION,salaryCost,costAdjustment:originalTime-salaryCost,requestedTilt,appliedTilt,cityLevel,citySource:cityChoice==='auto'?'auto':'manual',contributions:rows,beforeBenefit,benefitPenalty};
  return {originalTime,baseAttack:beforeBenefit.attack-benefitPenalty.attack,baseHealth:beforeBenefit.health-benefitPenalty.health,tuning};
}
