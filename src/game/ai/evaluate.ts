import { canAttack, handCost, unitStats } from '../engine';
import { cardById } from '../catalog';
import type { HandCard, MatchState, PlayerState } from '../types';
import type { BotStyle } from './types';
export const WIN=1000000;
export function cardValue(s:MatchState,p:PlayerState,c:HandCard):number {
  const enemy=s.players.find(x=>x.id!==p.id)!,id=c.definitionId,cost=handCost(p,c);
  const baseCost=c.offer?.definition.originalTime??cardById[id]?.time_cost??cost;
  let v=1.7+Math.min(5,baseCost)*0.3-Math.max(0,cost-baseCost)*0.8;
  if(cardById[id]?.type==='support')v+=p.board.length<3?0.7:0;
  if(['N07','N10','N18','N20','N21','F02'].includes(id)&&enemy.board.length)v+=1.2;
  if(['N08','N17'].includes(id))v+=(30-p.mind)*0.12;
  if(['N09','N04'].includes(id)&&!p.deck.length)v-=4;
  if(['N13','F03'].includes(id)&&p.board.some(u=>u.notice))v+=4;
  if(id==='N22'&&enemy.mind<=3)v+=15;
  const nextTime=Math.min(8,s.round+(p.id===s.firstPlayerId?1:0));
  const nextTax=Math.max(0,...c.taxes.filter(t=>t.untilTurn===p.ownTurn+1).map(t=>t.amount));
  if(nextTax){const blocked=baseCost<=nextTime&&baseCost+nextTax>nextTime;v-=blocked?Math.max(2,v*0.8):nextTax*0.5}
  return v;
}
function side(s:MatchState,p:PlayerState,style:BotStyle):number {
  const mindWeight=s.round>=11?9:3.2;
  let value=p.mind*mindWeight-(p.mind<9?(9-p.mind)*2:0)+p.hand.reduce((a,c)=>a+cardValue(s,p,c),0);
  for(const u of p.board){
    const stats=unitStats(s,u),growth=u.templateId==='T04'||u.templateId==='T10';
    value+=stats.attack*(style==='aggressive'?2.6:3.1)+Math.max(0,stats.health)*(style==='control'?1.5:1.35)+2;
    if(canAttack(s,u,true)&&s.activePlayerId===p.id)value+=stats.attack*0.55;
    if(u.taunt)value+=2+(p.mind<10?3:0);
    if(u.frozenUntilTurn>=p.ownTurn+1)value-=stats.attack*1.1;
    if(growth&&s.round<10)value+=style==='growth'?2:0.8;
    if(u.notice&&u.tags.includes('frontline')&&u.ageStage===3)value-=stats.attack+stats.health+6;
    if(u.benefitId==='B01'&&p.mind<30)value+=2;
  }
  value+=p.offerZone.filter(o=>o.status==='available').reduce((a,o)=>a+1+(o.definition.baseAttack+o.definition.baseHealth)*0.15,0);
  if(p.retort)value+=2;
  value+=p.education.referralDiscount*1.6+(p.education.returnTicket?1:0);
  return value;
}
export function evaluateState(s:MatchState,selfId:string,style:BotStyle):number {
  if(s.result)return s.result.winnerId===selfId?WIN:s.result.winnerId===null?0:-WIN;
  const p=s.players.find(x=>x.id===selfId)!,e=s.players.find(x=>x.id!==selfId)!;
  const threat=(attacker:PlayerState,defender:PlayerState)=>{
    const guards=defender.board.filter(u=>u.taunt).reduce((sum,u)=>sum+Math.max(0,unitStats(s,u).health),0);
    const power=attacker.board.filter(u=>u.frozenUntilTurn<attacker.ownTurn+1).reduce((sum,u)=>sum+Math.max(0,unitStats(s,u).attack),0);
    const exposed=Math.max(0,power-guards);
    return exposed>=defender.mind?180+exposed*2:exposed>defender.mind/2?exposed*2:0;
  };
  return side(s,p,style)-side(s,e,'control')-threat(e,p)+threat(p,e)*0.65;
}
