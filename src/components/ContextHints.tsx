import {useState} from 'react';
import type {MatchView} from '../game/types';
import {Icon} from '../ui';
type Hint={id:string;title:string;text:string};
const read=()=>{try{return JSON.parse(localStorage.getItem('offer-hints-dismissed-v22')||'[]') as string[]}catch{return []}};
/** Hints read the same public view as the player. They never pause or submit a turn. */
export function contextualHint(view:MatchView,seen:readonly string[]):Hint|null{
 if(view.phase!=='playing'||view.activePlayerId!==view.selfId)return null;
 const me=view.players.find(p=>p.id===view.selfId)!,foe=view.players.find(p=>p.id!==view.selfId)!;
 const candidates:Hint[]=[];
 if(me.board.some(u=>u.notice))candidates.push({id:'notice',title:'先看红色通知',text:'优化通知将在发出通知的一方下次回合开始检查。点角色详情查看年龄与通知；转管理或回手是否适用，以当前合法操作为准。'});
 if(foe.board.some(u=>u.taunt))candidates.push({id:'taunt',title:'这句话有人挡',text:'对方有挡话角色，普通攻击需要先处理它。行动牌和技能按照各自规则选择目标。'});
 if(view.round>=4&&!me.education.secondaryUsed)candidates.push({id:'secondary',title:'进修技能已到解锁轮次',text:'第二学历每局只能用一次，和主技能共享每回合一次机会。点击技能可查询耗时和当前能否使用。'});
 if(me.board.some(u=>u.canAttack))candidates.push({id:'attack',title:'现在可以开怼了',text:'点自己的可攻击角色，再点击发光目标。角色会冲向选定的目标；选目标时可按 Esc 取消。'});
 if(view.legalActions.some(c=>c.type==='DEPLOY_OFFER'))candidates.push({id:'deploy',title:'让 Offer 上桌',text:'打开「我的 Offer」，把卡牌拖到牌桌上即可上桌；单击只会拿近细看。耗时和空位足够时才能上桌；新角色通常要等下个己方回合开怼。'});
 if(me.board.some(u=>u.kind==='offer')||foe.board.some(u=>u.kind==='offer'))candidates.push({id:'retire',title:'Offer 退场有额外代价',text:'Offer 底气耗尽退场时，其主人还会失去 2 点心态。普通助阵的退场没有这项额外损失。'});
 candidates.push({id:'time',title:'拖出手牌就是出牌',text:'时间每轮增加到最多 8 小时。把牌拖出手牌区就会打出；单击一张牌可以拿近细看，点空白处放回。'});
 return candidates.find(h=>!seen.includes(h.id))??null;
}
export default function ContextHints({view}:{view:MatchView}){
 const [enabled,setEnabled]=useState(()=>localStorage.getItem('offer-context-hints')!=='0'),[seen,setSeen]=useState(read),[dismissedAt,setDismissedAt]=useState(-1);
 if(!enabled||dismissedAt===view.version)return null;const hint=contextualHint(view,seen);if(!hint)return null;
 const dismiss=()=>{const next=[...seen,hint.id];setSeen(next);setDismissedAt(view.version);localStorage.setItem('offer-hints-dismissed-v22',JSON.stringify(next))};
 return <aside className="context-hint" aria-label="边打边学"><Icon name="book" size={20}/><div><strong>{hint.title}</strong><p>{hint.text}</p></div><div><button className="text-btn" onClick={dismiss}>知道了</button><button className="text-btn" onClick={()=>{setEnabled(false);localStorage.setItem('offer-context-hints','0')}}>关闭提示</button></div></aside>
}
