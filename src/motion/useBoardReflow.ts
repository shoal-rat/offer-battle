import {useEffect,useLayoutEffect,useRef,type RefObject} from 'react';
import {motionDirector} from './MotionDirector';
import {getMotionPreferences} from './useMotionPreferences';
/** Reflow owns translation only. Text remains horizontal and target IDs never change. */
export function useBoardReflow(arenaRef:RefObject<HTMLElement|null>,matchId:string,revision:unknown){
 const previous=useRef(new Map<string,{x:number;y:number}>()),sequence=useRef(0),scope=`board:${matchId}`;
 useLayoutEffect(()=>{
  const next=new Map<string,{x:number;y:number}>();
  for(const node of arenaRef.current?.querySelectorAll<HTMLElement>('.battle-unit[data-battle-id]')??[]){
   const id=node.dataset.battleId!,position={x:node.offsetLeft,y:node.offsetTop},old=previous.current.get(id);next.set(id,position);
   if(!old||getMotionPreferences().hidden||getMotionPreferences().reduced||Math.abs(old.x-position.x)+Math.abs(old.y-position.y)<1)continue;
   motionDirector.play({cue:'boardReflow',channel:'feedback',id:`${id}:${++sequence.current}`,scope,actorIds:[id],confirmed:true,run:ctx=>{ctx.animate(node,[{transform:`translate(${old.x-position.x}px,${old.y-position.y}px)`},{transform:'translate(0,0)'}],{easing:'cubic-bezier(.25,1.25,.45,1)'})}});
  }
  previous.current=next;
 },[revision,matchId]);
 useEffect(()=>()=>{motionDirector.cancelScope(scope);previous.current.clear()},[scope]);
}
