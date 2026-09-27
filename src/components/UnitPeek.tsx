import {createPortal} from 'react-dom';
import {cardById,templateById,benefitById} from '../game/catalog';
import type {UnitView} from '../game/types';

export interface PeekTarget {unit:UnitView;rect:{left:number;top:number;right:number;bottom:number;width:number};own:boolean;frozen:boolean}
/** A paper note beside a hovered stand-up: the numbers and rules a player would otherwise open a dialog for.
 * Read-only and pointer-transparent; the (i) button and dialog stay the complete, accessible source. */
export default function UnitPeek({target}:{target:PeekTarget|null}){
 if(!target)return null;
 const {unit,rect,own,frozen}=target,width=236;
 const rules=unit.templateId?templateById[unit.templateId]?.main_effect:cardById[unit.definitionId]?.rules_text;
 const benefit=unit.benefitId?benefitById[unit.benefitId]:undefined;
 const right=rect.right+14+width<innerWidth,left=right?rect.right+14:Math.max(8,rect.left-14-width);
 const top=Math.max(8,Math.min(innerHeight-260,rect.top-6));
 const tags=[unit.taunt&&'挡话：普通开怼要先处理它',frozen&&'暂停开怼：下个己方回合不能主动开怼',unit.notice&&'优化通知：将在发出方下回合开始检查',unit.managed&&'已转管理'].filter(Boolean) as string[];
 return createPortal(<aside className={`unit-peek ${own?'own':'foe'}`} style={{left,top,width}} aria-hidden="true">
  <header><strong>{unit.name}</strong><span>{own?'己方':'对方'}{unit.age?` · ${unit.age} 岁`:''}</span></header>
  <div className="unit-peek-stats"><span className="peek-attack">{unit.attack}<small>排面</small></span><span className="peek-health">{unit.health}<small>底气{unit.damage?` · 已受 ${unit.damage}`:''}</small></span></div>
  {rules&&<p>{rules}</p>}
  {benefit&&<p className="unit-peek-benefit">{benefit.name}：{benefit.text}</p>}
  {tags.map(tag=><p key={tag} className="unit-peek-tag">{tag}</p>)}
  {own&&unit.canAttack&&<p className="unit-peek-ready">可以开怼：点它，再点发光的目标</p>}
 </aside>,document.body);
}
