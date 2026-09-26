import type { Command, MatchView } from '../types';
import type { BotStyle } from './types';
export function flexCandidates():Command[] {
  const cards=['F01','F02','F03','F04','F05','F06'],out:Command[]=[];
  for(let i=0;i<4;i++)for(let j=i+1;j<5;j++)for(let k=j+1;k<6;k++)out.push({type:'SELECT_FLEX',flexIds:[cards[i],cards[j],cards[k]]});
  return out;
}
export function mulliganCandidates(ids:string[]):Command[] {
  const out:Command[]=[{type:'MULLIGAN',cardIds:[]}];
  for(let i=0;i<ids.length;i++){out.push({type:'MULLIGAN',cardIds:[ids[i]]});for(let j=i+1;j<ids.length;j++)out.push({type:'MULLIGAN',cardIds:[ids[i],ids[j]]})}
  return out;
}
export function setupScore(view:MatchView,c:Command,style:BotStyle):number {
  const p=view.players.find(p=>p.id===view.selfId)!,e=view.players.find(p=>p.id!==view.selfId)!;
  if(c.type==='SELECT_FLEX'){
    const scores:Record<string,number>={F01:e.offerZone.filter(o=>o.definition.tags.includes('frontline')).length*2,F02:e.offerZone.filter(o=>o.definition.templateId==='T04'||o.definition.benefitId==='B04').length*3,F03:p.offerZone.filter(o=>o.definition.tags.includes('frontline')).length,F04:p.offerZone.filter(o=>o.definition.originalTime>=4).length+1,F05:style==='growth'?2:0.5,F06:style==='control'?3:2};
    return c.flexIds!.reduce((v,id)=>v+scores[id],0);
  }
  const removed=new Set(c.cardIds),keep=p.hand.filter(h=>!removed.has(h.id));
  const cheap=keep.filter(h=>h.cost<=2).length,support=keep.filter(h=>h.type==='support').length;
  // Expected replacement value, using only the retained hand and public curve.
  return keep.reduce((v,h)=>v+(h.cost<=3?3:1)-(keep.filter(x=>x.definitionId===h.definitionId).length>1?0.6:0),0)+cheap*1.6+Math.min(1,support)*2+(c.cardIds?.length??0)*2.8-(keep.length===0?2:0);
}
