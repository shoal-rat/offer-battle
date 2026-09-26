import {useEffect,useId} from 'react';
import {motionDirector} from './MotionDirector';
/** A single app-level event delegation; visual feedback never handles click business logic. */
export function useInterfaceMotion(){
 const scope=useId();
 useEffect(()=>{let serial=0;const signal=(event:Event)=>{const node=(event.target as Element)?.closest<HTMLElement>('button,[role="button"],summary');if(!node||node.matches(':disabled'))return;
   if(event.type==='pointerover'&&(event as PointerEvent).relatedTarget instanceof Node&&node.contains((event as PointerEvent).relatedTarget as Node))return;
   const card=node.matches('.offer-card,.common-card'),press=event.type==='pointerdown'||event.type==='keydown';if(event instanceof KeyboardEvent&&!['Enter',' '].includes(event.key))return;
   motionDirector.play({cue:press?'press':card?'cardFocus':'hoverFocus',id:String(++serial),scope,run:ctx=>{ctx.animate(node,press?[{filter:'brightness(1)'},{filter:'brightness(.94)',offset:.4},{filter:'brightness(1)'}]:[{boxShadow:'0 0 0 0 #ac8c5500'},{boxShadow:'0 0 0 3px #ac8c5555',offset:.4},{boxShadow:'0 0 0 0 #ac8c5500'}],{duration:ctx.durationMs})}});
  };
  for(const event of ['pointerdown','keydown','pointerover','focusin'])document.addEventListener(event,signal,true);
  return()=>{for(const event of ['pointerdown','keydown','pointerover','focusin'])document.removeEventListener(event,signal,true);motionDirector.cancelScope(scope)};
 },[scope]);
}
