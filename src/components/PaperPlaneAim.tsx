import {useCallback,useEffect,useId,useLayoutEffect,useRef,useState,type MutableRefObject} from 'react';
import {createPortal} from 'react-dom';
import {publicUrl,artUrl} from '../deployment';
import {motionDirector,type MotionHandle} from '../motion/MotionDirector';
import {getMotionPreferences,useMotionPreferences} from '../motion/useMotionPreferences';
import '../styles/paper-plane.css';

export type PlaneCard={name:string;art:string;kind:'offer'|'card'|'unit';attack?:number;health?:number;cost?:number;subtitle?:string};
export type PaperPlaneControl={launch:(targetId:string)=>Promise<boolean>};
interface Props {card:PlaneCard;targetIds:string[];epoch:string;controlRef:MutableRefObject<PaperPlaneControl|null>;onCancel:()=>void;onReadyChange?:(ready:boolean)=>void}
type Point={x:number;y:number};
type Aim=Point&{targetId?:string};
type Phase='aiming'|'flying'|'landed';
const FLIGHT_MS=650,REVEAL_MS=350;
const ANCHORS='[data-battle-id],[data-offer-id],[data-hand-id]';
function anchorId(node:HTMLElement){return node.dataset.battleId??node.dataset.offerId??node.dataset.handId}
function visibleTarget(id:string){
 const node=[...document.querySelectorAll<HTMLElement>(ANCHORS)].find(el=>anchorId(el)===id&&el.dataset.departing!=='true');if(!node)return null;
 const rect=node.getBoundingClientRect();if(!rect.width||!rect.height||rect.bottom<=0||rect.right<=0||rect.top>=innerHeight||rect.left>=innerWidth)return null;
 if(getComputedStyle(node).visibility==='hidden'||getComputedStyle(node).display==='none')return null;
 return {node,point:{x:rect.left+rect.width/2,y:rect.top+rect.height/2}};
}
/** Pre-submission illustration only. The caller rechecks its epoch/rules and sends after true. */
export default function PaperPlaneAim({card,targetIds,epoch,controlRef,onCancel,onReadyChange}:Props){
 const scope=`paper-plane:${useId()}`,motion=useMotionPreferences();
 const flight=useRef<HTMLDivElement>(null),plane=useRef<HTMLDivElement>(null),mini=useRef<HTMLDivElement>(null);
 const latest=useRef({card,targetIds,epoch,onCancel,onReadyChange});latest.current={card,targetIds,epoch,onCancel,onReadyChange};
 const alive=useRef(false),phaseRef=useRef<Phase>('aiming'),handle=useRef<MotionHandle|null>(null),serial=useRef(0),cancelNotified=useRef(false);
 const [phase,setPhase]=useState<Phase>('aiming'),[origin,setOrigin]=useState<Point>({x:0,y:0}),[aim,setAim]=useState<Aim>({x:0,y:0}),[planeFallback,setPlaneFallback]=useState(false);
 const targetKey=targetIds.join('\0');
 const updatePhase=(next:Phase)=>{phaseRef.current=next;if(alive.current)setPhase(next)};
 const resetVisuals=()=>{for(const node of [flight.current,mini.current])if(node){node.style.removeProperty('transform');node.style.removeProperty('opacity')}plane.current?.style.removeProperty('opacity')};
 const cancel=useCallback(()=>{
  handle.current?.cancel();handle.current=null;motionDirector.cancelScope(scope);latest.current.onReadyChange?.(false);
  if(!cancelNotified.current){cancelNotified.current=true;latest.current.onCancel()}
 },[scope]);
 const launch=useCallback(async(targetId:string):Promise<boolean>=>{
  const current=latest.current,target=visibleTarget(targetId),prefs=getMotionPreferences();
  if(!alive.current||phaseRef.current!=='aiming'||handle.current||prefs.hidden||document.hidden||!current.targetIds.includes(targetId)||!target||!flight.current||!mini.current||!plane.current)return false;
  const startingEpoch=current.epoch,startingCard=current.card,box=flight.current.getBoundingClientRect(),start={x:box.left+box.width/2,y:box.top+box.height/2},dx=target.point.x-start.x,dy=target.point.y-start.y;
  const root=flight.current,paper=plane.current,face=mini.current;updatePhase('flying');setAim({...target.point,targetId});latest.current.onReadyChange?.(false);
  let completed=false;
  const job=motionDirector.play({cue:'cardFocus',channel:'feedback',scope,id:`send:${++serial.current}`,durationMs:FLIGHT_MS+REVEAL_MS,run:ctx=>{
   // This is an aiming gesture, never a confirmed deploy/attack cue or a speculative rule update.
   if(ctx.reduced){root.style.transform=`translate(${dx}px,${dy}px)`;paper.style.opacity='0';ctx.animate(face,[{opacity:.15,transform:'scale(1.15)'},{opacity:1,transform:'scale(1.15)'}],{duration:ctx.durationMs,fill:'forwards'});return}
   paper.style.transform=`rotate(${Math.atan2(dy,dx)*180/Math.PI+90}deg)`;
   ctx.animate(root,[{transform:'translate(0,0)'},{transform:`translate(${dx*.48}px,${dy*.48-38}px)`,offset:.48},{transform:`translate(${dx}px,${dy}px)`}],{duration:FLIGHT_MS,easing:'cubic-bezier(.25,.1,.25,1)',fill:'forwards'});
   ctx.later(()=>{ctx.animate(paper,[{opacity:1},{opacity:0}],{duration:150,fill:'forwards'});ctx.animate(face,[{transform:'scale(.94) rotateY(-52deg) rotate(-7deg)'},{transform:'scale(1.5) rotateY(0) rotate(0)'}],{duration:REVEAL_MS,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'})},FLIGHT_MS);
  },onSettled:reason=>{
   completed=reason==='finished'&&alive.current&&latest.current.epoch===startingEpoch&&latest.current.card.name===startingCard.name&&latest.current.card.art===startingCard.art&&!document.hidden&&latest.current.targetIds.includes(targetId)&&!!visibleTarget(targetId);
   if(!alive.current)return;
   if(completed){root.style.transform=`translate(${dx}px,${dy}px)`;paper.style.opacity='0';face.style.transform=`scale(${prefs.reduced?1.15:1.5})`;updatePhase('landed')}
   else{resetVisuals();updatePhase('aiming');latest.current.onReadyChange?.(!document.hidden&&!cancelNotified.current)}
  }});
  handle.current=job;await job.finished;if(handle.current===job)handle.current=null;return completed;
 },[scope]);
 useLayoutEffect(()=>{
  alive.current=true;controlRef.current={launch};
  return()=>{alive.current=false;handle.current?.cancel();handle.current=null;motionDirector.cancelScope(scope);if(controlRef.current?.launch===launch)controlRef.current=null;latest.current.onReadyChange?.(false)};
 },[controlRef,launch,scope]);
 useLayoutEffect(()=>{
  handle.current?.cancel();handle.current=null;motionDirector.cancelScope(scope);cancelNotified.current=false;resetVisuals();updatePhase('aiming');
  latest.current.onReadyChange?.(!document.hidden);
  return()=>{handle.current?.cancel();handle.current=null;motionDirector.cancelScope(scope)};
 },[epoch,targetKey,card.name,card.art,scope]);
 useEffect(()=>{
  let frame=0,pointer:Point|null=null,focusId:string|undefined;
  const marked=targetIds.flatMap(id=>{const target=visibleTarget(id);if(!target)return [];const old=target.node.getAttribute('data-plane-target');target.node.setAttribute('data-plane-target','true');return [{node:target.node,old}]});
  const refresh=()=>{
   frame=0;if(!alive.current||phaseRef.current!=='aiming'||!flight.current)return;
   const box=flight.current.getBoundingClientRect(),start={x:box.left+box.width/2,y:box.top+box.height/2};setOrigin(start);
   const locked=focusId&&latest.current.targetIds.includes(focusId)?visibleTarget(focusId):null;
   if(locked)setAim({...locked.point,targetId:focusId});else setAim(pointer??{x:Math.max(24,start.x-90),y:Math.max(24,start.y-160)});
  };
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(refresh)};
  const pointerMove=(event:PointerEvent)=>{if(phaseRef.current!=='aiming')return;pointer={x:event.clientX,y:event.clientY};const node=event.target instanceof Element?event.target.closest<HTMLElement>(ANCHORS):null;const id=node&&anchorId(node);focusId=id&&latest.current.targetIds.includes(id)?id:undefined;schedule()};
  const focus=(event:FocusEvent)=>{const node=event.target instanceof Element?event.target.closest<HTMLElement>(ANCHORS):null;const id=node&&anchorId(node);focusId=id&&latest.current.targetIds.includes(id)?id:undefined;schedule()};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();cancel()}};
  const visibility=()=>{if(document.hidden)cancel();else schedule()};
  document.addEventListener('pointermove',pointerMove,{passive:true});document.addEventListener('focusin',focus);document.addEventListener('keydown',escape);document.addEventListener('visibilitychange',visibility);window.addEventListener('resize',schedule);document.addEventListener('scroll',schedule,true);schedule();
  return()=>{if(frame)cancelAnimationFrame(frame);document.removeEventListener('pointermove',pointerMove);document.removeEventListener('focusin',focus);document.removeEventListener('keydown',escape);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('resize',schedule);document.removeEventListener('scroll',schedule,true);for(const {node,old} of marked){if(old===null)node.removeAttribute('data-plane-target');else node.setAttribute('data-plane-target',old)}};
 },[epoch,targetKey,card.name,card.art,cancel]);
 const previousReduced=useRef(motion.reduced);
 useEffect(()=>{if(previousReduced.current!==motion.reduced){previousReduced.current=motion.reduced;cancel()}},[motion.reduced,cancel]);
 const angle=Math.atan2(aim.y-origin.y,aim.x-origin.x),tip={x:origin.x+Math.cos(angle)*70,y:origin.y+Math.sin(angle)*70};
 return createPortal(<div className={`paper-plane-aim phase-${phase}`} data-paper-plane="true" data-reduced={motion.reduced} data-valid-target={!!aim.targetId}>
  {phase==='aiming'&&!motion.reduced&&<svg className="paper-plane-sight" aria-hidden="true"><path d={`M ${tip.x} ${tip.y} Q ${(tip.x+aim.x)/2} ${(tip.y+aim.y)/2-28} ${aim.x} ${aim.y}`} /><g transform={`translate(${aim.x},${aim.y})`}><circle r="15"/><path d="M -23 0 H -8 M 8 0 H 23 M 0 -23 V -8 M 0 8 V 23"/></g></svg>}
  <div className="paper-plane-flight" ref={flight} aria-hidden="true">
   <div className="paper-plane-mini" ref={mini}>
    <div className="paper-plane-card-art">{card.art&&<img src={artUrl(card.art)} crossOrigin="anonymous" alt=""/>}</div>
    {card.cost!==undefined&&<b className="paper-plane-cost">{card.cost}<small>时</small></b>}
    <strong className="paper-plane-card-name">{card.name}</strong>
    <span className="paper-plane-card-kind">{card.kind==='offer'?'Offer':card.kind==='unit'?'角色':'卡牌'}</span>
    {card.subtitle&&<span className="paper-plane-card-subtitle">{card.subtitle}</span>}
    {(card.attack!==undefined||card.health!==undefined)&&<div className="paper-plane-stats"><b>{card.attack??'—'}</b><span>排面 / 底气</span><b>{card.health??'—'}</b></div>}
   </div>
   <div className="paper-plane-vehicle" ref={plane} style={{transform:`rotate(${angle*180/Math.PI+90}deg)`}}>
    {planeFallback?<svg viewBox="0 0 128 128"><path d="M64 5 115 112 65 88 14 112Z" fill="#fff7e7" stroke="#79594e" strokeWidth="3"/><path d="M64 5 65 88 46 104 48 54Z" fill="#d7bda0" stroke="#79594e" strokeWidth="2"/></svg>:<img src={publicUrl('/art/paper-plane.webp')} alt="" onError={()=>setPlaneFallback(true)}/>}
   </div>
  </div>
  <div className="paper-plane-controls"><p role="status" aria-live="polite">{phase==='aiming'?`为「${card.name}」选择目标`:phase==='flying'?`正在递出「${card.name}」`:'卡牌已展开'}</p><button type="button" aria-label="取消瞄准" onClick={cancel}>取消瞄准 <kbd>Esc</kbd></button></div>
 </div>,document.body);
}
