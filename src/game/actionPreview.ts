import type {Command,MatchView} from './types';
import {applyCommand,unitStats} from './engine';
import {sampleObservation,possibleRetorts} from './ai/belief';
export interface ActionPreview {version:number;available:boolean;uncertain:boolean;lines:string[];warning?:string}
const range=(values:number[])=>{const min=Math.min(...values),max=Math.max(...values);return min===max?String(min):`${min}～${max}`};
const commandKey=(command:Command)=>JSON.stringify(command,Object.keys(command).sort());
/** Simulation uses only a legal player observation and the authoritative engine. Never accepts a hidden MatchState. */
export function previewAction(view:MatchView,command:Command):ActionPreview {
 if(!view.legalActions.some(c=>commandKey(c)===commandKey(command)))return {version:view.version,available:false,uncertain:false,lines:[],warning:'这个行动已经不可用，请重新选择。'};
 const enemy=view.players.find(p=>p.id!==view.selfId)!,covered=!!enemy.retort?.covered&&!enemy.retort?.definitionId;
 const candidates=covered?possibleRetorts(view):[null];
 const outcomes=candidates.map((retort,index)=>{const before=sampleObservation(view,undefined,2260901,index),foe=before.players.find(p=>p.id===enemy.id)!;if(retort&&foe.retort)foe.retort.definitionId=retort;return applyCommand(before,view.selfId,command)}).filter(o=>!o.error);
 if(!outcomes.length)return {version:view.version,available:false,uncertain:covered,lines:[],warning:'当前没有可确认的合法结果。'};
 const me=view.players.find(p=>p.id===view.selfId)!,lines:string[]=[];
 const cost=outcomes.map(o=>me.timeRemaining-o.state.players.find(p=>p.id===me.id)!.timeRemaining);
 lines.push(`花费 ${range(cost)} 小时`);
 for(const p of view.players){const change=outcomes.map(o=>o.state.players.find(x=>x.id===p.id)!.mind-p.mind);if(change.some(n=>n!==0))lines.push(`${p.id===me.id?'我方':'对方'}心态：${p.mind} → ${range(change.map(n=>p.mind+n))}`)}
 for(const p of view.players)for(const unit of p.board){
  const next=outcomes.map(o=>{const u=o.state.players.find(x=>x.id===p.id)!.board.find(x=>x.id===unit.id);return u?unitStats(o.state,u).health:0});
  if(next.some(n=>n!==unit.health)){const retired=next.every(n=>n<=0);lines.push(`${unit.name}：${retired?'退场':`底气 ${unit.health} → ${range(next)}`}${retired&&unit.kind==='offer'?'（额外扣除 2 心态，已计入上方）':''}`)}
 }
 const unknownDraw=outcomes.some(o=>o.events.some(e=>['draw','choice','covered','retort','school_tax'].includes(e.type))),uncertain=covered||unknownDraw;
 return {version:view.version,available:true,uncertain,lines,warning:covered?'对方留有未揭示反话；这是公开信息下的可能范围，不保证实际结果。':unknownDraw?'抽牌或新信息尚未揭示，后续结果不作预测。':undefined};
}
