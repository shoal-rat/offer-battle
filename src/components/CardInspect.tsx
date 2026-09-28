import {useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {OfferCard,CommonCard} from '../ui';
import {cardById} from '../game/catalog';
import type {OfferDefinition} from '../game/types';
import {getMotionPreferences} from '../motion/useMotionPreferences';

export interface InspectRect {left:number;top:number;width:number;height:number}
interface Props {
 offer?:OfferDefinition;cardId?:string;cost?:number;from?:InspectRect;
 status:string;canUse:boolean;onUse:()=>void;onDetails:()=>void;onClose:()=>void;children?:ReactNode;
}
/** Clicking a card brings it close to read, the way you lift a card from your hand; it is played by dragging it
 * out of the hand. A tap anywhere else puts it back. "使用这张牌" stays for keyboards and screen readers. */
export default function CardInspect({offer,cardId,cost,from,status,canUse,onUse,onDetails,onClose}:Props){
 const panel=useRef<HTMLDivElement>(null),card=useRef<HTMLDivElement>(null),use=useRef<HTMLButtonElement>(null);
 const [leaving,setLeaving]=useState(false),closing=useRef(false),latest=useRef(onClose);latest.current=onClose;
 const reduced=getMotionPreferences().reduced;
 function flipFrom(){
  const node=card.current;if(!node||!from)return undefined;
  const to=node.getBoundingClientRect();if(!to.width)return undefined;
  const dx=from.left+from.width/2-(to.left+to.width/2),dy=from.top+from.height/2-(to.top+to.height/2),scale=from.width/to.width;
  return `translate(${dx}px,${dy}px) scale(${scale})`;
 }
 const close=()=>{
  if(closing.current)return;closing.current=true;setLeaving(true);
  const node=card.current,back=flipFrom();
  if(!node||reduced||!back){latest.current();return}
  const animation=node.animate([{transform:'none',opacity:1},{transform:back,opacity:.4}],{duration:240,easing:'cubic-bezier(.5,0,.8,.4)',fill:'forwards'});
  animation.finished.then(()=>latest.current(),()=>latest.current());
 };
 useLayoutEffect(()=>{
  const node=card.current,start=flipFrom();
  if(node&&start&&!reduced)node.animate([{transform:start,opacity:.6},{transform:'translateY(-10px) scale(1.03)',opacity:1,offset:.7},{transform:'none',opacity:1}],{duration:340,easing:'cubic-bezier(.2,.9,.3,1.15)'});
  use.current?.focus({preventScroll:true});
 },[]);
 useEffect(()=>{
  // Anything outside the lifted card puts it back — and lets that press carry on (a drag, another card, a target).
  const press=(event:PointerEvent)=>{if(!panel.current?.contains(event.target as Node))close()};
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.stopPropagation();close()}};
  document.addEventListener('pointerdown',press,true);document.addEventListener('keydown',key,true);
  return()=>{document.removeEventListener('pointerdown',press,true);document.removeEventListener('keydown',key,true)};
 },[]);
 const name=offer?.name??(cardId?cardById[cardId]?.name:'')??'';
 return createPortal(<div className={`card-inspect ${leaving?'leaving':''}`} role="dialog" aria-modal="false" aria-label={`细看「${name}」`}>
  <div className="card-inspect-panel" ref={panel}>
   <div className="card-inspect-card" ref={card} data-inspect-card="true">{offer?<OfferCard offer={offer} cost={cost}/>:cardId?<CommonCard id={cardId} cost={cost}/>:null}</div>
   <aside className="card-inspect-note">
    <strong>{name}</strong>
    <p className="card-inspect-status" role="status">{status}</p>
    <p className="card-inspect-how">{canUse?'把它拖出手牌区，放到牌桌上任意位置就会打出；需要目标时，直接拖到发光的目标上。':'现在还不能打出。点任意空白处放回手牌。'}</p>
    <div className="card-inspect-actions">
     <button ref={use} className="btn gold" disabled={!canUse} onClick={()=>{closing.current=true;onUse()}}>使用这张牌</button>
     <button className="btn subtle" onClick={onDetails}>完整规则</button>
     <button className="text-btn" onClick={close}>放回</button>
    </div>
   </aside>
  </div>
 </div>,document.body);
}
