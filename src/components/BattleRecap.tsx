import {useEffect,useMemo,useRef} from 'react';
import type {MatchView} from '../game/types';
import {matchLearning} from '../game/highlights';
import {motionDirector} from '../motion/MotionDirector';
import '../styles/battle-recap.css';
export default function BattleRecap({view,onReplay}:{view:MatchView;onReplay:(sequence:number)=>void}){
 const recap=useMemo(()=>matchLearning(view),[view]),root=useRef<HTMLElement>(null),scope=`recap:${view.matchId}`;
 useEffect(()=>{motionDirector.play({cue:'recapCard',id:`recap:${view.version}`,scope,confirmed:true,run:ctx=>{if(root.current)ctx.animate(root.current,ctx.reduced?[{opacity:0},{opacity:1}]:[{opacity:0,translate:'0 8px'},{opacity:1,translate:'0 0'}])}});return()=>motionDirector.cancelScope(scope)},[scope]);
 return <section className="battle-recap" ref={root} aria-label="本局复盘">
  {recap.last&&<p className="recap-final">{recap.last.text}<button className="text-btn" onClick={()=>onReplay(recap.last!.sequence)}>回看终局</button></p>}
  {recap.key&&<article><span className="eyebrow">关键回合 · 第 {recap.key.round} 轮</span><h3>{recap.key.title}</h3><p>{recap.key.text}</p><button className="text-btn" onClick={()=>onReplay(recap.key!.sequence)}>跳到事件 {recap.key.sequence}{recap.key.endSequence!==recap.key.sequence?`—${recap.key.endSequence}`:''} →</button></article>}
  <div className="recap-learning"><strong>这局可以学到什么</strong><p>{recap.learning}</p></div>
  {recap.highlights.length>1&&<details><summary>其余名场面（{recap.highlights.length-1}）</summary><ol>{recap.highlights.slice(1,5).map(h=><li key={h.id}><strong>{h.title}</strong><p>{h.text}</p><button className="text-btn" onClick={()=>onReplay(h.sequence)}>回看事件 {h.sequence}</button></li>)}</ol></details>}
 </section>
}
