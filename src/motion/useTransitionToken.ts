import {useEffect,useRef} from 'react';
import {motionDirector} from './MotionDirector';
let nextTransition=0;
/** A navigation scope cancels its WAAPI work and delayed callbacks when the intent changes. */
export function useTransitionToken(sceneId:string){
 const value=useRef({sceneId,token:`navigation:${sceneId}:${++nextTransition}`});
 if(value.current.sceneId!==sceneId){motionDirector.cancelScope(value.current.token,'superseded');value.current={sceneId,token:`navigation:${sceneId}:${++nextTransition}`}}
 const token=value.current.token;
 useEffect(()=>()=>motionDirector.cancelScope(token),[token]);
 return {token,cancel:()=>motionDirector.cancelScope(token)};
}
