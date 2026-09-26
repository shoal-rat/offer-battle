import type { OfferDefinition } from '../src/game/types.js';

export interface CreativeResult { name:string; description:string; quote:string }
export interface TextProvider { generateCreative(offer:OfferDefinition):Promise<CreativeResult> }
export interface ImageProvider { generateCharacter(offer:OfferDefinition):Promise<{mime:string;base64:string}> }
export class LocalTextProvider implements TextProvider {
  async generateCreative(offer:OfferDefinition):Promise<CreativeResult> {
    const quotes:Record<string,string>={T01:'包可以小，排面不能倒。',T02:'风浪越大，双休越稳。',T03:'我们先对齐一下。',T04:'经验，是时间给的加成。',T05:'这事我来推进。',T06:'这不是饼，是增长曲线。',T07:'你这个边界没测吧？',T08:'最后再聊五分钟。',T09:'我有三个解决方案。',T10:'下一轮，价值兑现。'};
    return {name:offer.name,description:`${offer.role}，${offer.annualPackage/10000} 万年包。工作属于生活，排面属于牌桌。`,quote:quotes[offer.templateId]??'先把 Offer 亮出来。'};
  }
}
/** Optional endpoints have separate configuration and exchange plain structured JSON. */
export class RemoteTextProvider implements TextProvider {
  async generateCreative(offer:OfferDefinition):Promise<CreativeResult> {
    const response=await fetch(process.env.TEXT_PROVIDER_URL!,{method:'POST',headers:{'Content-Type':'application/json',...(process.env.TEXT_PROVIDER_KEY?{Authorization:`Bearer ${process.env.TEXT_PROVIDER_KEY}`}:{})},body:JSON.stringify({model:process.env.TEXT_MODEL,offer,instruction:'仅生成中文卡名、角色描述与短台词，返回 name, description, quote；不得修改游戏属性。'}),signal:AbortSignal.timeout(25000)});
    if(!response.ok) throw new Error(`文案服务返回 ${response.status}`);
    const value=await response.json() as CreativeResult;
    if(!value || !['name','description','quote'].every(k=>typeof value[k as keyof CreativeResult]==='string')) throw new Error('文案服务格式错误，需返回 name、description、quote');
    return {name:value.name.slice(0,80),description:value.description.slice(0,500),quote:value.quote.slice(0,120)};
  }
}
export class RemoteImageProvider implements ImageProvider {
  async generateCharacter(offer:OfferDefinition) {
    const response=await fetch(process.env.IMAGE_PROVIDER_URL!,{method:'POST',headers:{'Content-Type':'application/json',...(process.env.IMAGE_PROVIDER_KEY?{Authorization:`Bearer ${process.env.IMAGE_PROVIDER_KEY}`}:{})},body:JSON.stringify({model:process.env.IMAGE_MODEL,offer,size:'1024x1024',instruction:'原创成年职场二次元角色，无文字，无品牌标识。'}),signal:AbortSignal.timeout(90000)});
    if(!response.ok) throw new Error(`插画服务返回 ${response.status}`);
    const value=await response.json() as {mime:string;base64:string};
    if(!value || !['image/png','image/jpeg','image/webp'].includes(value.mime) || typeof value.base64!=='string' || value.base64.length>10000000) throw new Error('插画服务需返回 mime 与 base64 图片（上限 7 MB）');
    return value;
  }
}
