import {stableHash} from './offers';
import type {OfferDefinition} from './types';

export type PersonaEvent='summon'|'disrupt'|'counterFail'|'return'|'victory'|'defeat';
export interface GenerationPreferences {tone:'confident'|'calm'|'witty';appearance:'career'|'formal'|'casual';variation:number}
export interface OfferPersona {version:1;seed:string;preferences:GenerationPreferences;description:string;quote:string;lines:Record<PersonaEvent,string>}
export const DEFAULT_GENERATION_PREFERENCES:GenerationPreferences={tone:'confident',appearance:'career',variation:0};
export function generationPreferences(input:unknown):GenerationPreferences {
 const p=(input??{}) as Partial<GenerationPreferences>;
 if(p.tone!==undefined&&!['confident','calm','witty'].includes(p.tone))throw Error('角色口吻无效');
 if(p.appearance!==undefined&&!['career','formal','casual'].includes(p.appearance))throw Error('本地立绘偏好无效');
 if(p.variation!==undefined&&(!Number.isSafeInteger(p.variation)||p.variation<0||p.variation>100000))throw Error('台词版本无效');
 return {...DEFAULT_GENERATION_PREFERENCES,...p};
}
const voices:Record<string,[string,string,string]>={
 T00:['先把工作说清楚。','今天也稳稳上桌。','综合能力，现在开始。'],T01:['方案已经跑通。','这局，轮到我上线。','排面先部署到位。'],
 T02:['长期安排，慢慢兑现。','稳得住，才接得住。','我先把底气站稳。'],T03:['我们先对齐目标。','节奏清楚，合作顺畅。','这次会议只谈结果。'],
 T04:['经验留在每个细节里。','图纸准备好了。','先把基础做扎实。'],T05:['这一步由我推进。','目标明确，就开始。','安排到位，各就各位。'],
 T06:['让结果替我说话。','这一单，我来谈。','机会已经摆上桌。'],T07:['边界条件，我看过了。','你的漏洞有编号。','先验收，再庆祝。'],
 T08:['来，认真聊五分钟。','合适的人，合适的位置。','这轮沟通很关键。'],T09:['我准备了三个方案。','问题先拆开来看。','结论有数据支持。'],
 T10:['兑现之前，先积累。','下一轮值得期待。','把可能性做成结果。'],
};
export function createPersona(offer:OfferDefinition,input?:unknown,existingSeed?:string):OfferPersona {
 const preferences=generationPreferences(input),seed=existingSeed??stableHash({id:offer.id,template:offer.templateId}),pool=voices[offer.templateId]??voices.T00;
 const index=(parseInt(seed,16)+preferences.variation)%pool.length,role=offer.role.slice(0,24),base=pool[index];
 const prefix=preferences.tone==='calm'?'不急，':preferences.tone==='witty'?'打个卡，':'';
 const structure=offer.annualPackage>offer.annualFixed?'有些收入等待兑现，我会把节奏握在手里。':'固定收入给我底气，牌桌上靠判断。';
 const lines:Record<PersonaEvent,string>={summon:`${role}就位。${prefix}${base}`,disrupt:preferences.tone==='witty'?'这句拆得好，记在会议纪要里。':'这一招，找到关键了。',counterFail:preferences.tone==='calm'?'没拦住，重新调整。':'这次没接住，下次再来。',return:preferences.tone==='witty'?'先下班，再找机会返场。':'收好这份经验，下次再上桌。',victory:preferences.tone==='calm'?'稳住节奏，终于走到这里。':'这局拿下，下一局见。',defeat:preferences.tone==='witty'?'今天的复盘素材有了。':'这轮认输，下一轮再准备。'};
 return {version:1,seed,preferences,description:`${role}。${structure}${offer.benefitId?'已确认的条款，是我自己的选择。':''}`,quote:base,lines};
}
export function localPersonaArt(offer:OfferDefinition,preferences:GenerationPreferences){return preferences.appearance==='career'?offer.templateId:`/assets/offer-${preferences.appearance==='formal'?'T02':'T01'}.webp`;}
/** Presentation only: callers choose a line only after a matching authoritative event. */
export class PersonaSpeechBudget {
 private round=-1;private count=0;private seen=new Set<string>();
 line(offer:OfferDefinition,event:PersonaEvent,eventId:string,round:number,enabled=true):string|null {
  if(!enabled||this.seen.has(eventId))return null;
  if(this.round!==round){this.round=round;this.count=0;}
  if(this.count>=2)return null;this.count++;this.seen.add(eventId);
  if(this.seen.size>300)this.seen.delete(this.seen.values().next().value!);
  return offer.persona?.lines[event]??createPersona(offer).lines[event];
 }
}

export function preserveOfferPresentation(source:OfferDefinition,target:OfferDefinition):OfferDefinition {
 for(const key of ['definitionRevision','draftRevision'] as const)if(Number.isSafeInteger(source[key])&&source[key]!>=1)target[key]=source[key];
 if(source.persona){
  const p=source.persona,base=createPersona(target,p.preferences,typeof p.seed==='string'&&/^[a-f0-9]{8}$/.test(p.seed)?p.seed:undefined);
  const text=(value:unknown,fallback:string,max:number)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max):fallback;
  base.description=text(p.description,base.description,500);base.quote=text(p.quote,base.quote,120);
  for(const event of Object.keys(base.lines) as PersonaEvent[])base.lines[event]=text(p.lines?.[event],base.lines[event],100);
  target.persona=base;
 }
 return target;
}
