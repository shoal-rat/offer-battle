import {useCallback,useEffect,useId} from 'react';
import {motionDirector} from './MotionDirector';
import type {MotionCueKey} from './cues';
/** Call only after the corresponding real event. Cleanup follows the owning page. */
export function usePaperFeedback(){
 const scope=useId();useEffect(()=>()=>motionDirector.cancelScope(scope),[scope]);
 return useCallback((cue:MotionCueKey,target:Element|string,id:string)=>{
  motionDirector.play({cue,id,scope,confirmed:true,run:ctx=>{
   ctx.later(()=>{const element=typeof target==='string'?document.querySelector(target):target;if(!element)return;
    const frames=ctx.reduced?[{opacity:.65},{opacity:1}]:cue==='errorNote'?[{translate:'-3px 0'},{translate:'3px 0'},{translate:'0 0'}]:[{translate:'0 5px',opacity:.6},{translate:'0 -2px',opacity:1,offset:.65},{translate:'0 0',opacity:1}];
    ctx.animate(element,frames,{duration:ctx.durationMs});
   },16);
  }});
 },[scope]);
}
