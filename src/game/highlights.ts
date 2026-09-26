import {cardById} from './catalog';
import type {BattleAnchor,GameEvent,MatchView} from './types';
export interface MatchHighlight {
 id:string;kind:string;sequence:number;endSequence:number;eventSequences:number[];round:number;
 title:string;text:string;learning:string;score:number;
 participants:{id:string;side:'self'|'opponent';label:string}[];
 outcome:{removedIds:string[];mindDelta:{self:number;opponent:number};cancelled:boolean};
}
interface Node {events:GameEvent[];round:number;turn:number;actorId?:string}
const leaders=new Set(['play','attack','education','negotiate']);
/** Public-event causality only. Never reads raw log text, concealed cards, persona or salary. */
export function extractHighlights(view:MatchView):MatchHighlight[]{
 const events=view.events.filter(e=>!e.privateTo||e.privateTo===view.selfId).sort((a,b)=>a.sequence-b.sequence),nodes:Node[]=[],anchors=new Map<string,BattleAnchor>();
 const rounds=new Map<number,number>();let round=1,turn=0,started=false,node:Node|undefined;
 for(const e of events){
  for(const a of [e.visual?.source,e.visual?.target,...(e.visual?.targets??[])])if(a)anchors.set(a.id,a);
  if(e.type==='turn_start'){if(started&&e.actorId===view.firstPlayerId)round++;started=true;turn++;node=undefined;}
  rounds.set(e.sequence,Math.min(view.round,round));
  if(!node||leaders.has(e.type)){node={events:[],round:Math.min(view.round,round),turn,actorId:e.actorId};nodes.push(node)}node.events.push(e);
 }
 // Imported/special fixtures may begin mid-match with no turn markers. Do not invent an earlier round.
 if(started&&round!==view.round){const offset=view.round-round;for(const n of nodes)n.round+=offset;for(const [seq,r]of rounds)rounds.set(seq,r+offset)}
 if(!started)for(const n of nodes){n.round=view.round;for(const e of n.events)rounds.set(e.sequence,view.round)}
 const side=(id?:string)=>id===view.selfId?'我方':'对方';
 const cost=(id?:string)=>id?(cardById[id]?.time_cost??view.players.flatMap(p=>p.offerZone).find(o=>o.definition.id===id)?.definition.originalTime):undefined;
 const result:MatchHighlight[]=[];
 function add(kind:string,title:string,text:string,learning:string,relevant:GameEvent[],score:number){
  if(!relevant.length)return;const sorted=[...new Map(relevant.map(e=>[e.sequence,e])).values()].sort((a,b)=>a.sequence-b.sequence),ids=[...new Set(sorted.flatMap(e=>[e.visual?.sourceId,e.targetId,e.visual?.targetId].filter((id):id is string=>!!id)))];
  const mindDelta={self:0,opponent:0};for(const e of sorted)for(const c of e.visual?.changes??[])if(c.stat==='mind')mindDelta[c.playerId===view.selfId?'self':'opponent']+=c.amount;
  result.push({id:`${kind}:${sorted[0].sequence}`,kind,title,text,learning,sequence:sorted[0].sequence,endSequence:sorted.at(-1)!.sequence,eventSequences:sorted.map(e=>e.sequence),round:rounds.get(sorted[0].sequence)??view.round,score,participants:ids.map(id=>{const owner=anchors.get(id)?.playerId??(view.players.some(p=>p.id===id)?id:undefined);return {id,side:owner===view.selfId?'self':'opponent',label:`${side(owner)}${view.players.some(p=>p.id===id)?'主角':'角色'}`}}),outcome:{removedIds:sorted.filter(e=>e.type==='retire').map(e=>e.targetId!).filter(Boolean),mindDelta,cancelled:sorted.some(e=>e.type==='cancel')}});
 }
 for(const [index,n]of nodes.entries()){
  const head=n.events[0],retired=n.events.filter(e=>e.type==='retire'),cancel=n.events.find(e=>e.type==='cancel');
  if(cancel)add('retort-cancel','反话被试出',`${side(head.actorId)}的一次行动触发了已揭示的反话；整张行动牌效果被取消。`,'留意反话实际揭示的位置，再判断后续行动；这里不推断玩家是否有意试探。',n.events,7);
  if(head.type==='negotiate'){
   const deployment=n.events.find(e=>e.type==='deploy'&&e.actorId===head.actorId);
   if(deployment)add('negotiation','谈薪后抢先上桌',`${side(head.actorId)}牺牲一份 Offer，优惠部署了另一份 Offer。`,'谈薪会永久失去筹码。回看这次上桌后，角色是否获得了足够的行动机会。',[head,deployment],6);
  }
  if(!cancel&&head.type==='play'&&retired.length){
   const paid=cost(head.cardId),expensive=retired.filter(e=>{const value=cost(e.visual?.target?.definitionId??e.visual?.source?.definitionId);return paid!==undefined&&paid<=3&&value!==undefined&&value>=paid+2});
   if(expensive.length)add('efficient-removal','小牌拆掉高费角色',`${side(head.actorId)}用一张基础费用 ${paid} 小时的行动牌，让 ${expensive.length} 个更高费角色退场。`,'比较费用之外，也检查退场是否额外扣了心态；不把基础费用当成本次实际支付费用。',n.events,9);
  }
  const offerDeaths=retired.filter(e=>e.visual?.changes?.some(c=>c.stat==='mind'&&c.amount===-2));
  if(offerDeaths.length)add('offer-retired',offerDeaths.length>1?'同一结算，多个 Offer 退场':'Offer 退场的额外代价',`${offerDeaths.length} 个 Offer 在同一行动结算中退场，合计额外失去 ${offerDeaths.length*2} 点心态。`,'Offer 退场还会扣除所属主角的心态；安排交换时把这部分代价算进去。',n.events,offerDeaths.length>1?10:4);
  const previous=nodes[index-1];
  if(previous&&previous.turn===n.turn&&previous.actorId===n.actorId&&['play','attack','education'].includes(head.type)&&!cancel&&!previous.events.some(e=>e.type==='cancel')&&retired.length>=2){
   const weakened=new Set(previous.events.flatMap(e=>(e.visual?.changes??[]).filter(c=>c.stat==='health'&&c.amount<0).map(c=>c.targetId)));
   if(retired.some(e=>weakened.has(e.targetId!)))add('combined-clear','前后行动配合清场',`${side(n.actorId)}连续两次行动，先削弱角色，再使 ${retired.length} 个角色退场。`,'回放两次行动之间的顺序，观察先削弱再收尾的效果；这不是最优解证明。',[...previous.events,...n.events],11);
  }
 }
 const notices=new Map<string,GameEvent>(),management=new Map<string,GameEvent>();
 for(const e of events){
  if(e.type==='notice'&&e.targetId)notices.set(e.targetId,e);
  if(e.type==='management'&&e.targetId)management.set(e.targetId,e);
  if(e.type==='notice_expired'){
   const managed=management.get(e.targetId!),notice=notices.get(e.targetId!);
   if(notice&&managed&&notice.sequence<managed.sequence&&managed.sequence<e.sequence)add('managed-notice','转管理后，通知检查失效','同一角色收到通知后转为管理，随后检查时通知失效，角色留在场上。','挂上通知不等于已经优化：检查时仍要满足年龄与一线身份条件。',[notice,managed,e],12);
   else add('notice-expired','通知检查失效','一张优化通知检查失效，角色留在场上。','查看检查时的年龄和身份；不要把挂通知记作成功退场。',[e],5);
  }
  if(e.type==='optimization')add('optimization','通知实际生效','优化通知完成条件检查，要求对应角色退场。','通知在约定的回合开始检查，只有实际生效才计入优化。',[e,...events.filter(x=>x.type==='retire'&&x.targetId===e.targetId&&x.sequence>e.sequence&&x.sequence<e.sequence+3)],6);
 }
 if(view.result?.winnerId){
  const winner=view.result.winnerId,minds=new Map(view.players.map(p=>[p.id,p.mind]));let low:{event:GameEvent;mind:number}|undefined;
  for(const e of [...events].reverse()){
   for(const c of e.visual?.changes??[])if(c.stat==='mind')minds.set(c.playerId,(minds.get(c.playerId)??30)-c.amount);
   const value=minds.get(winner)??30,enemy=[...minds.entries()].find(([id])=>id!==winner)?.[1]??30;
   if(value>0&&value<=6&&value<enemy)low={event:e,mind:value};
  }
  const final=events.findLast(e=>e.type==='result');
  if(low&&final)add('low-mind-win','低心态下拿下这一局',`${side(winner)}曾只剩 ${low.mind} 点心态且落后，最终赢得本局。`,'回看低心态节点后的实际行动；仅凭结果不能断言存在唯一最优路线。',[low.event,final],14);
 }
 return result.sort((a,b)=>b.score-a.score||b.endSequence-a.endSequence);
}
export function matchLearning(view:MatchView){
 const highlights=extractHighlights(view),key=highlights[0];
 const final=view.events.findLast(e=>!e.privateTo&&['attack','damage','retire','optimization','concede','timeout','turn_end'].includes(e.type));
 const last=final?{sequence:final.sequence,text:final.type==='attack'?'最后一次已确认开怼推动了终局。':final.type==='retire'?'最后一次退场结算后，对局结束。':final.type==='concede'?'对方或我方确认认输后，对局结束。':final.type==='turn_end'?'回合结束检查后，对局结算。':'最后一次已确认结算后，对局结束。'}:undefined;
 return {highlights,key,last,learning:key?.learning??'这份记录没有足够的结构化转折证据。可以逐步回放实际行动，不根据胜负推断最优解。'};
}
