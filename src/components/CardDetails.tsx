import {Modal,OfferCard,CommonCard} from '../ui';
import {cardById,templateById,benefitById} from '../game/catalog';
import type {OfferDefinition,UnitView} from '../game/types';
export type ReadingCard={offer:OfferDefinition;unit?:UnitView;cost?:number;private?:boolean}|{cardId:string;cost?:number;unit?:UnitView};
export function CardDetails({card,onClose,children}:{card:ReadingCard;onClose:()=>void;children?:React.ReactNode}){
 const offer='offer'in card?card.offer:undefined,common='cardId'in card?cardById[card.cardId]:undefined;
 const unit=card.unit,t=offer&&templateById[offer.templateId],benefit=offer?.benefitId&&benefitById[offer.benefitId];
 return <Modal title={offer?.name||common?.name||'卡牌详情'} onClose={onClose} wide><div className="paper-card-details">
  <div className="detail-portrait">{offer?<OfferCard offer={offer}/>:<CommonCard id={common!.id}/>}</div>
  <section className="detail-rules"><span className="detail-origin">{offer?('private'in card&&card.private?'私人收藏':'公开体验 / 对局公开牌'):common?.type==='support'?'助阵':common?.type==='retort'?'反话':'行动'}</span>
   {offer&&<p><strong>{offer.role}</strong><br/>{offer.company}</p>}
   <dl className="detail-stats"><div><dt>当前耗时</dt><dd>{card.cost??offer?.originalTime??common?.time_cost} 小时</dd></div><div><dt>原始耗时</dt><dd>{offer?.originalTime??common?.time_cost} 小时</dd></div>{(offer||unit||common?.type==='support')&&<><div><dt>{unit?'当前 / 基础排面':'排面'}</dt><dd>{unit?`${unit.attack} / `:''}{offer?.baseAttack??common?.attack}</dd></div><div><dt>{unit?'当前 / 基础底气':'底气'}</dt><dd>{unit?`${unit.health} / `:''}{offer?.baseHealth??common?.max_health}</dd></div></>}</dl>
   <h3>这张牌怎么用</h3><p>{t?.main_effect||common?.rules_text}</p>{benefit&&<p><strong>条款 · {benefit.name}</strong><br/>{benefit.text}</p>}
   {unit&&<><h3>本次上桌状态</h3><p>{unit.age?`${unit.age} 岁 · `:''}{unit.canAttack?'可以开怼':'本回合不能开怼'}{unit.notice?' · 已挂优化通知，发出通知的一方下次回合开始时检查是否仍在一线':''}</p><p>已受伤 {unit.damage} 点。回手保留年龄；伤害、本次强化和通知按规则清除。</p>{unit.modifiers?.length>0&&<ul>{unit.modifiers.map((m,i)=><li key={i}>{m.source}：排面 {m.attack>=0?'+':''}{m.attack}，底气 {m.health>=0?'+':''}{m.health}{m.expiresOwnerTurn!==undefined?`，到第 ${m.expiresOwnerTurn} 次回合结束`:''}</li>)}</ul>}</>}
   {offer?.tuning&&<details><summary>数值从哪里来</summary><p>年包档位 {offer.tuning.salaryCost} 小时；工作修正 {offer.tuning.costAdjustment>=0?'+':''}{offer.tuning.costAdjustment}；身材倾向 {offer.tuning.appliedTilt>=0?'+':''}{offer.tuning.appliedTilt}。</p><ul>{offer.tuning.contributions.map(c=><li key={c.key}>{c.label}：{c.detail}</li>)}</ul><p>条款付出：排面 −{offer.tuning.benefitPenalty.attack}，底气 −{offer.tuning.benefitPenalty.health}。</p></details>}
   {offer&&<details><summary>定义与公开信息</summary><p>造卡规则 {offer.rulesVersion} · 定义修订 {offer.definitionRevision||1}</p><p>联机公开卡面的公司、岗位和数值；原始录入文件与工作详情不会发送给对手。分享时可以另外选择公开字段。</p></details>}{children}
  </section></div></Modal>
}
