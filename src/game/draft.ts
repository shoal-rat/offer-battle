import type {OfferDefinition,OfferProfile} from './types';
import {matchTemplate} from './offers';
import {DEFAULT_GENERATION_PREFERENCES,type GenerationPreferences} from './draft-persona';
export type DraftSource='user'|'parsed'|'imported'|'unset';
export interface DraftField<T>{value:T|null;source:DraftSource;confirmed:boolean}
export type DraftFields={[K in keyof Required<OfferProfile>]:DraftField<Required<OfferProfile>[K]>};
export interface OfferDraft {characterSeed:string;revision:number;previousTemplateId?:string;fields:DraftFields;benefitId:string|null;benefitConfirmed:boolean;isExample:boolean;reportedAnnualPackage:number|null;preferences:GenerationPreferences}
export const SALARY_KEYS=['monthly_fixed_cny','guaranteed_months','annual_fixed_allowance_cny','annual_target_bonus_cny','annual_equity_cny','one_time_signing_cny'] as const;
export const ADDITIONAL_INCOME_KEYS=['annual_fixed_allowance_cny','annual_target_bonus_cny','annual_equity_cny','one_time_signing_cny'] as const;
const keys=['card_display_name','selected_template_id','company_display_name','ownership','industry','company_stage','role_family','role_title','city','city_cost_level','work_nature','work_schedule',...SALARY_KEYS,'confirmed_benefits'] as const;
export const FIELD_LABELS:Record<keyof Required<OfferProfile>,string>={card_display_name:'卡牌显示名',selected_template_id:'玩法类型',company_display_name:'公司显示名',ownership:'公司性质',industry:'行业',company_stage:'公司阶段',role_family:'岗位类别',role_title:'具体岗位名称',city:'工作城市',city_cost_level:'城市生活成本',work_nature:'工作性质',work_schedule:'工作节奏',monthly_fixed_cny:'固定月薪',guaranteed_months:'保证薪数',annual_fixed_allowance_cny:'年度固定津贴',annual_target_bonus_cny:'年度目标奖金',annual_equity_cny:'年度股权价值',one_time_signing_cny:'一次性签字费',confirmed_benefits:'已确认条款'};
const requiredKeys=['company_display_name','role_title','industry','ownership','company_stage','role_family','city_cost_level','work_nature','work_schedule',...SALARY_KEYS] as const;
export function emptyDraft(revision=1):OfferDraft {return {revision,characterSeed:crypto.randomUUID().replaceAll('-','').slice(0,8),fields:Object.fromEntries(keys.map(key=>[key,{value:null,source:'unset',confirmed:false}])) as DraftFields,benefitId:null,benefitConfirmed:false,isExample:false,reportedAnnualPackage:null,preferences:{...DEFAULT_GENERATION_PREFERENCES}};}
export function editDraft(draft:OfferDraft,changes:Partial<OfferProfile>,source:DraftSource='user',confirmed=source==='user'):OfferDraft {
 const next=structuredClone(draft);next.revision++;
 for(const [key,value]of Object.entries(changes))if(keys.includes(key as any))(next.fields as any)[key]={value:value===undefined?null:value,source:value===undefined?'unset':source,confirmed:value!==undefined&&confirmed};
 if(['role_title','role_family','industry','ownership','company_stage'].some(key=>Object.hasOwn(changes,key))){next.previousTemplateId=draft.fields.selected_template_id.value??draft.previousTemplateId;next.fields.selected_template_id={value:null,source:'unset',confirmed:false};}
 return next;
}
export function clearDraftField(draft:OfferDraft,key:keyof OfferProfile){return editDraft(draft,{[key]:undefined});}
export function draftFromOffer(offer:OfferDefinition,revision=1):OfferDraft {
 const draft=emptyDraft(revision);if(!offer.profile)return draft;
 for(const key of keys)if(offer.profile[key]!==undefined)(draft.fields as any)[key]={value:structuredClone(offer.profile[key]),source:'imported',confirmed:true};
 draft.characterSeed=offer.persona?.seed??draft.characterSeed;draft.benefitId=offer.benefitId;draft.benefitConfirmed=true;draft.preferences=offer.persona?.preferences??{...DEFAULT_GENERATION_PREFERENCES};return draft;
}
export function exampleDraft(profile:OfferProfile,revision:number):OfferDraft {
 const value=draftFromOffer({profile,benefitId:null} as OfferDefinition,revision);value.isExample=true;return value;
}
export function confirmDraftFields(draft:OfferDraft,fieldKeys:(keyof OfferProfile)[]=keys.slice()):OfferDraft {
 const next=structuredClone(draft);next.revision++;
 for(const key of fieldKeys){const field=next.fields[key];if(field&&field.value!==null)field.confirmed=true;}return next;
}
export function confirmZeroIncome(draft:OfferDraft):OfferDraft {
 const values:Partial<OfferProfile>={};for(const key of ADDITIONAL_INCOME_KEYS)if(draft.fields[key].value===null)values[key]=0;return editDraft(draft,values);
}
export function useStandardConditions(draft:OfferDraft):OfferDraft {
 const defaults:Partial<OfferProfile>={ownership:'private',company_stage:'established',industry:'other',role_family:'general',city_cost_level:'auto',work_nature:'standard',work_schedule:'standard'};
 for(const key of Object.keys(defaults) as (keyof OfferProfile)[])if(draft.fields[key]?.value!==null)delete defaults[key];return editDraft(draft,defaults);
}
export function missingDraftFields(draft:OfferDraft){return requiredKeys.filter(key=>{const field=draft.fields[key];return !field.confirmed||field.value===null||typeof field.value==='string'&&!field.value.trim();});}
export function draftProfile(draft:OfferDraft):OfferProfile {
 const missing=missingDraftFields(draft);if(missing.length)throw Error('待确认：'+missing.map(key=>FIELD_LABELS[key]).join('、'));
 if(!draft.fields.selected_template_id.confirmed)throw Error('请确认推荐的玩法类型，或手动选择玩法类型');
 if(!draft.benefitConfirmed)throw Error('请确认本次启用的条款，或明确不启用条款');
 const profile:Record<string,unknown>={};for(const key of keys){const field=draft.fields[key];if(field.value!==null)profile[key]=structuredClone(field.value);}
 profile.city??='';profile.confirmed_benefits=draft.benefitId?[draft.benefitId]:[];
 return profile as unknown as OfferProfile;
}
export function recommendedTemplate(draft:OfferDraft){const p=Object.fromEntries(keys.map(key=>[key,draft.fields[key].value??(SALARY_KEYS.includes(key as any)?0:'')])) as unknown as OfferProfile;return matchTemplate(p);}
export function parseOfferText(text:string,revision:number):OfferDraft {
 let draft=emptyDraft(revision),values:Partial<OfferProfile>={};
 const money=(match:RegExpMatchArray|null)=>match?Number(match[1])*({'k':1000,'千':1000,'万':10000,'w':10000}[match[2]?.toLowerCase()]??1):undefined;
 const monthly=money(text.match(/(?:月薪|月固定|月工资|固定月薪)[：:\s]*(\d+(?:\.\d+)?)\s*(k|千|w|万|元)?/i));if(monthly!==undefined)values.monthly_fixed_cny=monthly;
 const months=text.match(/(\d+(?:\.\d+)?)\s*薪/);if(months)values.guaranteed_months=Number(months[1]);
 for(const [key,label]of [['company_display_name','公司|单位'],['role_title','岗位|职位'],['city','城市|工作地点']] as const){const match=text.match(new RegExp(`(?:${label})[：:\\s]+([^\\n，,；;]+)`));if(match)(values as any)[key]=match[1].trim().slice(0,60);}
 for(const [key,label]of [['annual_target_bonus_cny','年度目标奖金|年终奖|年度奖金|奖金'],['annual_equity_cny','年度股权价值|年度股权|股权|权益'],['annual_fixed_allowance_cny','年度固定津贴|年度津贴|津贴|补贴'],['one_time_signing_cny','一次性签字费|签字费|签约金']] as const){const amount=money(text.match(new RegExp(`(?:${label})[：:\\s]*(\\d+(?:\\.\\d+)?)\\s*(k|千|w|万|元)?`,'i')));if(amount!==undefined)values[key]=amount;else if(new RegExp(`(?:无|没有|不含)(?:${label})|(?:${label})[：:\\s]*(?:无|没有)`).test(text))values[key]=0;}
 const annual=money(text.match(/(?:年包|总包)[：:\s]*(\d+(?:\.\d+)?)\s*(k|千|w|万|元)?/i));
 if(values.role_title)values.role_family=inferRoleFamily(values.role_title);
 const industries:[RegExp,string][]=[[/互联网|算法/,'internet'],[/制造|硬件|机械/,'manufacturing'],[/银行|投行|金融/,'finance'],[/咨询/,'consulting'],[/游戏/,'gaming']];for(const [pattern,value]of industries)if(pattern.test(text)){values.industry=value;break;}
 if(/央企/.test(text))values.ownership='central_state_owned';else if(/国企/.test(text))values.ownership='state_owned';else if(/外企/.test(text))values.ownership='foreign_owned';else if(/民企|私企/.test(text))values.ownership='private';
 draft=editDraft(draft,values,'parsed',false);draft.revision=revision;draft.reportedAnnualPackage=annual??null;return draft;
}
export function mergeDiff(current:OfferDraft,parsed:OfferDraft){return keys.filter(key=>parsed.fields[key].value!==null&&JSON.stringify(current.fields[key].value)!==JSON.stringify(parsed.fields[key].value)).map(key=>({key,label:FIELD_LABELS[key],before:current.fields[key].value,after:parsed.fields[key].value}));}
export function mergeParsedDraft(current:OfferDraft,parsed:OfferDraft):OfferDraft {
 const next=structuredClone(current);next.revision++;
 for(const key of keys)if(parsed.fields[key].value!==null)(next.fields as any)[key]=structuredClone(parsed.fields[key]);
 next.fields.selected_template_id={value:null,source:'unset',confirmed:false};next.benefitId=null;next.benefitConfirmed=false;next.isExample=false;next.reportedAnnualPackage=parsed.reportedAnnualPackage;return next;
}

export function draftFromExtracted(fields:unknown,revision:number):OfferDraft {
 if(!fields||typeof fields!=='object'||Array.isArray(fields))throw Error('识别结果需要字段对象');
 const values:Partial<OfferProfile>={};
 for(const key of keys){const value=(fields as any)[key];if(value===undefined||value===null)continue;if(SALARY_KEYS.includes(key as any)){if(typeof value==='number'&&Number.isFinite(value))(values as any)[key]=value;}else if(typeof value==='string')(values as any)[key]=value.slice(0,60);}
 const next=editDraft(emptyDraft(revision),values,'parsed',false);next.revision=revision;return next;
}
export function inferRoleFamily(role:string){return /销售|客户经理/.test(role)?'sales':/算法|机器学习|AI/.test(role)?'algorithm':/测试/.test(role)?'testing':/人事|招聘|HR/i.test(role)?'hr':/研发|工程师/.test(role)?'general_rd':'general';}
