import {useEffect,useRef,useState,type RefObject} from 'react';
import {createPortal} from 'react-dom';

/** A folded paper-strip arrow from the chosen attacker to the pointer while a target is picked.
 * Purely visual: clicks still go to the real targets underneath (pointer-events: none). */
export default function AttackArrow({sourceId,arenaRef}:{sourceId?:string;arenaRef:RefObject<HTMLElement|null>}){
 const [pointer,setPointer]=useState<{x:number;y:number;locked:boolean}|null>(null),frame=useRef(0);
 useEffect(()=>{
  const move=(event:PointerEvent)=>{
   cancelAnimationFrame(frame.current);
   frame.current=requestAnimationFrame(()=>{
    const hit=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('.targetable [data-battle-id],.targetable.battle-unit,.battle-hero.targetable .hero-avatar,.battle-unit.targetable');
    const target=hit?.closest<HTMLElement>('[data-battle-id]')??hit;
    if(target){const r=target.getBoundingClientRect();setPointer({x:r.left+r.width/2,y:r.top+r.height/2,locked:true})}
    else setPointer({x:event.clientX,y:event.clientY,locked:false});
   });
  };
  window.addEventListener('pointermove',move,{passive:true});
  return()=>{window.removeEventListener('pointermove',move);cancelAnimationFrame(frame.current)};
 },[]);
 const source=sourceId?[...(arenaRef.current?.querySelectorAll<HTMLElement>('[data-battle-id]')??[])].find(node=>node.dataset.battleId===sourceId):undefined;
 if(!source||!pointer||matchMedia('(pointer: coarse)').matches)return null;
 const r=source.getBoundingClientRect(),from={x:r.left+r.width/2,y:r.top+r.height*.42},to=pointer;
 const dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy);
 if(length<40)return null;
 // Bend the strip sideways so it reads as paper, not a laser.
 const bend=Math.min(90,length*.22),nx=-dy/length,ny=dx/length,control={x:(from.x+to.x)/2+nx*bend*(dx>0?-1:1),y:(from.y+to.y)/2+ny*bend*(dx>0?-1:1)};
 const end={x:to.x-(to.x-control.x)/Math.hypot(to.x-control.x,to.y-control.y)*26,y:to.y-(to.y-control.y)/Math.hypot(to.x-control.x,to.y-control.y)*26};
 const angle=Math.atan2(to.y-control.y,to.x-control.x)*180/Math.PI;
 const path=`M${from.x} ${from.y} Q${control.x} ${control.y} ${end.x} ${end.y}`;
 return createPortal(<svg className={`attack-arrow ${pointer.locked?'locked':''}`} aria-hidden="true" width="100%" height="100%">
  <path className="attack-arrow-shadow" d={path} transform="translate(3 5)"/>
  <path className="attack-arrow-edge" d={path}/>
  <path className="attack-arrow-strip" d={path}/>
  <path className="attack-arrow-stitch" d={path}/>
  <g transform={`translate(${to.x} ${to.y}) rotate(${angle})`}>
   <path className="attack-arrow-shadow" d="M4 5 -30 -21 -22 5 -30 31Z"/>
   <path className="attack-arrow-head" d="M0 0 -34 -26 -25 0 -34 26Z"/>
  </g>
  <circle className="attack-arrow-origin" cx={from.x} cy={from.y} r="9"/>
  {pointer.locked&&<g className="attack-arrow-reticle" transform={`translate(${to.x} ${to.y})`}><circle r="40"/><path d="M-52 0h-14M52 0h14M0 -52v-14M0 52v14"/></g>}
 </svg>,document.body);
}
