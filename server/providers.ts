import type {OfferDefinition} from '../src/game/types.js';
import {createPersona,type OfferPersona} from '../src/game/draft-persona.js';
export interface CreativeResult {name:string;description:string;quote:string;lines?:OfferPersona['lines']}
export interface TextProvider {generateCreative(offer:OfferDefinition,signal?:AbortSignal):Promise<CreativeResult>}
export interface ImageProvider {generateCharacter(offer:OfferDefinition,signal?:AbortSignal):Promise<{mime:string;base64:string}>}
export class LocalTextProvider implements TextProvider {
 async generateCreative(offer:OfferDefinition,signal?:AbortSignal):Promise<CreativeResult>{const persona=offer.persona??createPersona(offer);return {name:offer.name,description:persona.description,quote:persona.quote,lines:persona.lines};}
}
/** Optional endpoints receive the saved preferences and immutable character seed. */
export class RemoteTextProvider implements TextProvider {
 async generateCreative(offer:OfferDefinition,signal?:AbortSignal):Promise<CreativeResult>{
  const response=await fetch(process.env.TEXT_PROVIDER_URL!,{method:'POST',headers:{'Content-Type':'application/json',...(process.env.TEXT_PROVIDER_KEY?{Authorization:`Bearer ${process.env.TEXT_PROVIDER_KEY}`}:{})},body:JSON.stringify({model:process.env.TEXT_MODEL,offer,preferences:offer.persona?.preferences,characterSeed:offer.persona?.seed,instruction:'仅生成中文角色描述与短台词。返回 name, description, quote，可选lines对象含summon/disrupt/counterFail/return/victory/defeat；不得修改岗位名、游戏属性，台词不得宣称未发生的战斗事件。'}),signal:AbortSignal.any([AbortSignal.timeout(25000),...(signal?[signal]:[])])});
  if(!response.ok)throw Error(`文案服务返回 ${response.status}`);
  const value=await response.json() as CreativeResult;if(!value||!['name','description','quote'].every(key=>typeof (value as any)[key]==='string'))throw Error('文案服务格式错误，需返回 name、description、quote');
  const fallback=(offer.persona??createPersona(offer)).lines,lines={...fallback};
  for(const key of Object.keys(lines) as (keyof typeof lines)[])if(typeof value.lines?.[key]==='string')lines[key]=value.lines[key].slice(0,100);
  return {name:offer.name,description:value.description.slice(0,500),quote:value.quote.slice(0,120),lines};
 }
}
export class RemoteImageProvider implements ImageProvider {
 async generateCharacter(offer:OfferDefinition,signal?:AbortSignal){
  const response=await fetch(process.env.IMAGE_PROVIDER_URL!,{method:'POST',headers:{'Content-Type':'application/json',...(process.env.IMAGE_PROVIDER_KEY?{Authorization:`Bearer ${process.env.IMAGE_PROVIDER_KEY}`}:{})},body:JSON.stringify({model:process.env.IMAGE_MODEL,offer,preferences:offer.persona?.preferences,characterSeed:offer.persona?.seed,previousArt:offer.artId,size:'1024x1024',transparentBackground:true,instruction:'原创成年职场纸艺角色，无文字，无品牌标识，真实透明背景。按preferences的立绘和口吻偏好设计；同一characterSeed保持人物身份。'}),signal:AbortSignal.any([AbortSignal.timeout(90000),...(signal?[signal]:[])])});
  if(!response.ok)throw Error(`插画服务返回 ${response.status}`);
  const value=await response.json() as {mime:string;base64:string};if(!value||!['image/png','image/jpeg','image/webp'].includes(value.mime)||typeof value.base64!=='string'||value.base64.length>10000000)throw Error('插画服务需返回 mime 与 base64 图片（上限 7 MB）');return value;
 }
}
export async function extractOfferFields(input:{text?:string;mime?:string;base64?:string}){
 if(!process.env.EXTRACT_PROVIDER_URL)throw Error('尚未配置识别服务，请使用粘贴提取或参考图片');
 const response=await fetch(process.env.EXTRACT_PROVIDER_URL,{method:'POST',headers:{'Content-Type':'application/json',...(process.env.EXTRACT_PROVIDER_KEY?{Authorization:`Bearer ${process.env.EXTRACT_PROVIDER_KEY}`}:{})},body:JSON.stringify({...input,instruction:'提取明确出现的OfferProfile字段；未出现的字段省略，不推测月薪、薪数、奖金或权益，不用零替代未知值。返回{fields:{...}}。'}),signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error(`识别服务返回 ${response.status}`);
 const result=await response.json() as {fields?:Record<string,unknown>};if(!result?.fields||typeof result.fields!=='object'||Array.isArray(result.fields))throw Error('识别服务格式错误，需返回 fields 对象');return result.fields;
}
