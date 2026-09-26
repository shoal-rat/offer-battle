import {useState} from 'react';
import {rules,education} from '../game/catalog';
import type {PlayerView} from '../game/types';
import {Icon,Modal,schoolName} from '../ui';
import '../styles/opponent-skills.css';

const primarySummary:Record<string,string>={
 H01:'看你的手牌，标记1张：你下回合使用它多花1小时。',
 H02:'看牌库顶3选1置顶；下一张原始5小时以上Offer减1小时。',
 H03:'其一名角色本回合排面+2；自身心态−1。',
 H04:'抽1张牌。',H05:'其一名角色恢复2底气；自身恢复1心态。',
 H06:'召唤1/2实习生；场上角色比你少时改为2/2。',
 H07:'收回己方Offer；它下次返场减1小时，便条有期限。',
 H08:'其一名助阵角色获得+1排面、+1底气上限。',
 H09:'把1张通用手牌放牌库底，再抽1张。',
};
const secondarySummary:Record<string,string>={
 S00:'自身恢复2心态，然后抽1张牌。',S01:'看你的手牌，标记1张：你下回合使用它多花2小时。',
 S02:'下一张原始5小时以上Offer减2小时；自身恢复2心态。',
 S03:'其一名角色获得+2排面、+2底气上限；自身心态−1。',
 S04:'抽2张牌。',S05:'其一名角色恢复3底气；自身恢复3心态。',
 S06:'召唤2/3项目搭子，当回合能开怼角色，不能怼主角。',
 S07:'收回己方Offer，然后抽1张牌。',S08:'其1至2名角色各获得+1排面、+1底气上限。',
 S09:'使你的一名角色失去3底气；原始5小时以上则失去4。',
 S10:'其一张Offer获得+2排面、+2底气上限。',
};
export default function OpponentSkills({player,round,activePlayerId}:{player:PlayerView;round:number;activePlayerId:string}){
 const [open,setOpen]=useState(false),state=player.education;
 const primary=rules.heroes.find(h=>h.id===state.primaryId)!,secondary=education.secondary.find(h=>h.id===state.secondaryId)!;
 const jlu=state.jluUltimateUsed?{name:'校友饭局',text:'自身恢复2心态。'}:state.jluSignins>=2?{name:'全校撑腰',text:'其一张Offer获得+4排面、+4底气上限；大招每局1次。'}:{name:'校友集合',text:`自身恢复1心态并签到；已签到${state.jluSignins}/2次，满2次后解锁大招。`};
 const name=primary.id==='H10'?jlu.name:primary.skill;
 const primaryStatus=activePlayerId!==player.id?'等对方回合':state.usedThisOwnTurn?'本回合已用':player.timeRemaining<primary.time_cost?'时间不足':'每回合1次';
 const secondaryStatus=state.secondaryUsed?'本局已用':round<4?'第4轮解锁':activePlayerId===player.id&&state.usedThisOwnTurn?'本回合已用学历技能':'每局1次';
 return <>
  <div className="opponent-skills" aria-label="对方两项技能">
   <button className="opponent-skill primary" data-opponent-skill="primary" onClick={()=>setOpen(true)} aria-label={`查看对方主技能：${name}`}>
    <span className="opponent-skill-heading"><small>主学历 · {schoolName(state.primaryId)}</small><b>{primary.time_cost} 小时</b></span>
    <span className="opponent-skill-name"><strong><Icon name="crown" size={13}/>{name}</strong><em>{primaryStatus}</em></span>
    <span className="opponent-skill-effect">{primary.id==='H10'?jlu.text:primarySummary[primary.id]}</span>
   </button>
   <button className={`opponent-skill secondary ${state.secondaryUsed?'used':''}`} data-opponent-skill="secondary" onClick={()=>setOpen(true)} aria-label={`查看对方进修技能：${secondary.skill}`}>
    <span className="opponent-skill-heading"><small>进修 · {schoolName(state.secondaryId)}</small><b>{secondary.time_cost} 小时</b></span>
    <span className="opponent-skill-name"><strong><Icon name={round<4?'lock':'spark'} size={13}/>{secondary.skill}</strong><em>{secondaryStatus}</em></span>
    <span className="opponent-skill-effect">{secondarySummary[secondary.id]}</span>
   </button>
  </div>
  {open&&<Modal title="知己知彼 · 对方的两项技能" onClose={()=>setOpen(false)}>
   <p className="opponent-skill-perspective">以下完整规则中的“自己／己方”均指对手，“对手／敌方”均指你。</p>
   <section className="opponent-skill-detail"><small>主学历 · {schoolName(state.primaryId)} · {primary.time_cost} 小时</small><h3>{name}<span>{primaryStatus}</span></h3><p>{primary.text}</p></section>
   <section className="opponent-skill-detail"><small>进修 · {schoolName(state.secondaryId)} · {secondary.time_cost} 小时</small><h3>{secondary.skill}<span>{secondaryStatus}</span></h3><p>{secondary.text}</p></section>
   <p className="opponent-skill-shared">两项技能共享对手每个回合的 1 次学历行动。进修从第 4 轮开放，每局只能发动一次。卡面展示核心效果，目标限制、便条期限和强化持续时间以上方完整规则为准。</p>
  </Modal>}
 </>;
}
