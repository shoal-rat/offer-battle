import {useEffect,useState} from 'react';
import {api,type Profile} from '../api';
import {challengeCatalog,bossCatalog,achievementCatalog,type ExperimentFlags} from '../game/experiments';
import {Icon,Badge} from '../ui';
export interface ExperimentStart {kind:'challenge'|'boss'|'series';id?:string}
export const experimentLabels:Record<keyof ExperimentFlags,string>={tempo:'先后手节奏实验',challenges:'固定残局挑战',series:'三局两胜',boss:'特殊 Boss 关卡',achievements:'操作成就与纸贴纸'};
export default function ExperimentHub({flags,profile,busy,onStart,onSettings}:{flags:ExperimentFlags;profile:Profile|null;busy:boolean;onStart:(request:ExperimentStart)=>void;onSettings:()=>void}){
 const [capabilities,setCapabilities]=useState<{challenges?:boolean;boss?:boolean;bestOfThree?:boolean;achievements?:boolean}>({}),[loaded,setLoaded]=useState(false);
 useEffect(()=>{let live=true;void api('/api/capabilities').then(c=>{if(live){setCapabilities(c.experimental??{});setLoaded(true)}}).catch(()=>{if(live)setLoaded(true)});return()=>{live=false}},[]);
 return <main className="page experiment-page"><div className="page-heading"><div><span className="eyebrow">小小实验室</span><h1>换个局面，<em>试一招。</em></h1><p>实验入口默认关闭，独立于标准对局。关卡条件都会提前说明。</p></div><button className="btn subtle" onClick={onSettings}>实验开关</button></div>
 {flags.challenges&&<section><h2>固定残局挑战</h2><p>每道题都有固定初始状态，解答通过正常规则引擎验证。可以从任意一题开始。</p><div className="experiment-cards">{challengeCatalog.map(c=><article key={c.id}><Badge>固定残局</Badge><h3>{c.title}</h3><p>{c.goal}</p><button className="btn gold" disabled={busy||!capabilities.challenges} onClick={()=>onStart({kind:'challenge',id:c.id})}>摆好这道题<Icon name="arrow"/></button></article>)}</div>{loaded&&!capabilities.challenges&&<p>当前服务未启用残局实验。静态游客版本可在本机体验。</p>}</section>}
 {flags.series&&<section><h2>三局两胜</h2><p>同一组比赛锁定学历、三份 Offer 与 12 张基础牌，只在局间调整 3 张应对牌。先拿到两胜获胜，平局不计胜场，最多九局。</p><button className="btn gold" disabled={busy||!capabilities.bestOfThree} onClick={()=>onStart({kind:'series'})}>与人机开始系列赛<Icon name="sword"/></button>{loaded&&!capabilities.bestOfThree&&<p>当前服务尚未启用系列实验。静态游客版本可在本机体验。</p>}</section>}
 {flags.boss&&<section><h2>特殊关卡</h2>{bossCatalog.map(b=><article className="boss-conditions" key={b.id}><Badge>非标准 · 条件公开</Badge><h3>{b.title}</h3><ul>{b.rules.map(rule=><li key={rule}>{rule}</li>)}</ul><button className="btn gold" disabled={busy||!capabilities.boss} onClick={()=>onStart({kind:'boss',id:b.id})}>接受这些条件，开始挑战</button></article>)}</section>}
 {flags.achievements&&<section><h2>操作留下的小纪念</h2><p>开启后，新对局会记录真实达成的操作。奖励仅是纸贴纸，不增加排面、底气或时间。</p><div className="experiment-cards">{achievementCatalog.map(a=><article key={a.id} className={profile?.achievements?.some(e=>e.id===a.id)?'earned':''}><Icon name={a.id==='notice-cleared'?'shield':a.id==='low-mind-win'?'heart':'spark'} size={36}/><h3>{a.title}</h3><p>{a.description}</p><Badge>{profile?.achievements?.some(e=>e.id===a.id)?'已获得纸贴纸':'尚未获得'}</Badge></article>)}</div></section>}
 {flags.tempo&&<section><h2>先后手节奏观察</h2><p>当前实验只比较“先手初始心态 −1”这一项变量；标准对局仍保持原来的数值。开发者可以重跑仓库中的配对模拟，每个种子交换双方座位。</p><p>完整结果随版本附在实验报告中。小样本不能证明平衡，因此这项开关不会改动你的普通对局。</p></section>}
 {!Object.values(flags).some(Boolean)&&<p>还没有开启任何实验。点击「实验开关」选择想试的一项。</p>}
 </main>
}
