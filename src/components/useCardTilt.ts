import {useEffect} from 'react';
import {getMotionPreferences} from '../motion/useMotionPreferences';

const HOSTS='.hand-card-wrapper,.offer-hand>div,.collection-card,.loadout-card,.card-inspect-card,.forge-card-stage';
const VARS=['--tilt-x','--tilt-y','--paper-light','--shadow-x','--shadow-y'];
/** Cards lean toward the pointer the way a held card does in a card game. The light is a matte paper's:
 * a broad, soft brightening on the side that faces the lamp and a little shade on the side that dips away,
 * never a glossy streak. The card's shadow slides the other way, as if the paper lifted off the table. */
export function useCardTilt(){
 useEffect(()=>{
  if(typeof matchMedia==='undefined'||matchMedia('(pointer: coarse)').matches)return;
  let active:HTMLElement|null=null,frame=0,last:PointerEvent|null=null;
  const reset=()=>{if(!active)return;delete active.dataset.tilting;for(const name of VARS)active.style.removeProperty(name);active=null};
  const apply=()=>{
   frame=0;const event=last;if(!event)return;
   const host=(event.target as Element|null)?.closest?.<HTMLElement>(HOSTS)??null;
   if(host!==active)reset();
   // Pressed buttons mean a drag or a click is under way: the dragged copy must start level.
   if(!host||event.buttons||getMotionPreferences().reduced||document.documentElement.classList.contains('card-drag-in-progress'))return;
   const card=host.querySelector<HTMLElement>('.offer-card,.common-card');if(!card)return;
   const r=card.getBoundingClientRect();if(!r.width||!r.height)return;
   const x=Math.max(-.5,Math.min(.5,(event.clientX-r.left)/r.width-.5)),y=Math.max(-.5,Math.min(.5,(event.clientY-r.top)/r.height-.5));
   const strength=Math.min(1,Math.hypot(x,y)*2),toward=Math.atan2(x,-y)*180/Math.PI;
   active=host;host.dataset.tilting='true';
   host.style.setProperty('--tilt-x',`${(-y*14).toFixed(2)}deg`);
   host.style.setProperty('--tilt-y',`${(x*16).toFixed(2)}deg`);
   host.style.setProperty('--paper-light',`linear-gradient(${toward.toFixed(1)}deg,rgba(255,251,238,${(.26*strength).toFixed(3)}) 0%,rgba(255,251,238,0) 46%,rgba(74,52,30,0) 58%,rgba(74,52,30,${(.16*strength).toFixed(3)}) 100%)`);
   host.style.setProperty('--shadow-x',`${(-x*12).toFixed(1)}px`);
   host.style.setProperty('--shadow-y',`${(9-y*7).toFixed(1)}px`);
  };
  const move=(event:PointerEvent)=>{if(event.pointerType!=='mouse')return;last=event;if(!frame)frame=requestAnimationFrame(apply)};
  const leave=()=>{last=null;reset()};
  const press=()=>reset();
  document.addEventListener('pointermove',move,{passive:true});
  document.addEventListener('pointerdown',press,true);
  document.documentElement.addEventListener('pointerleave',leave);
  window.addEventListener('blur',leave);
  return()=>{cancelAnimationFrame(frame);reset();document.removeEventListener('pointermove',move);document.removeEventListener('pointerdown',press,true);document.documentElement.removeEventListener('pointerleave',leave);window.removeEventListener('blur',leave)};
 },[]);
}
