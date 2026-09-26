import {useCallback,useEffect,useId,useLayoutEffect,useRef} from 'react';
import {motionDirector} from './MotionDirector';
import {remapCloneIds} from './paperRig';
interface Capture {destination:string;clone:Element;rect:{left:number;top:number;width:number;height:number};cardId?:string}
/** Returns immediately: routing and data requests never await a decorative transition. */
export function useSceneBridge(scene:string){
 const scope=useId(),pending=useRef<Capture|null>(null),serial=useRef(0);
 const cancel=useCallback(()=>{pending.current=null;motionDirector.cancelScope(scope,'superseded')},[scope]);
 const onBeforeNavigate=useCallback((destination:string,source?:Element|null)=>{
  cancel();const node=source??document.querySelector(`.hotspot-${CSS.escape(destination)} .stage-prop` )??(destination==='battle'?document.querySelector('.stage-table .stage-prop'):null);
  if(!node||!['svg','img'].includes(node.tagName.toLowerCase()))return;
  const rect=node.getBoundingClientRect();if(!rect.width||!rect.height)return;
  const clone=node.cloneNode(true) as Element;clone.querySelectorAll('text,title,desc,button,input,foreignObject').forEach(el=>el.remove());remapCloneIds(clone);for(const el of [clone,...clone.querySelectorAll('*')]){el.removeAttribute('tabindex');el.removeAttribute('aria-labelledby')};clone.setAttribute('aria-hidden','true');
  pending.current={destination,clone,rect:{left:rect.left,top:rect.top,width:rect.width,height:rect.height},cardId:node.getAttribute('data-bridge-card-id')??undefined};
 },[cancel]);
 const targetRef=useCallback((target:Element|null)=>{
  const from=pending.current;if(!target||!from)return;
  if(target.getAttribute('data-scene-anchor')!==from.destination)return;
  if(from.cardId&&target.getAttribute('data-bridge-card-id')!==from.cardId){cancel();return}
  pending.current=null;const to=target.getBoundingClientRect();if(!to.width||!to.height)return;
  motionDirector.play({cue:from.destination==='create'?'creatorUnfold':from.destination==='collection'?'collectionTurn':from.destination==='battle'?'matchBridge':'panelOpen',id:`bridge:${++serial.current}`,scope,confirmed:true,durationMs:240,run:ctx=>{
   if(ctx.reduced){ctx.animate(target,[{opacity:.65},{opacity:1}],{duration:ctx.durationMs});return}
   const ghost=document.createElement('div');ghost.className='scene-bridge-ghost';ghost.setAttribute('aria-hidden','true');Object.assign(ghost.style,{position:'fixed',left:from.rect.left+'px',top:from.rect.top+'px',width:from.rect.width+'px',height:from.rect.height+'px',zIndex:'65',pointerEvents:'none'});ghost.append(from.clone);const art=from.clone as HTMLElement;Object.assign(art.style,{display:'block',width:'100%',height:'100%',maxWidth:'none'});document.body.append(ghost);ctx.addCleanup(()=>ghost.remove());
   ctx.animate(ghost,[{opacity:1,transformOrigin:'0 0',transform:'translate(0,0) scale(1)'},{opacity:.7,offset:.8},{opacity:0,transformOrigin:'0 0',transform:`translate(${to.left-from.rect.left}px,${to.top-from.rect.top}px) scale(${to.width/from.rect.width},${to.height/from.rect.height})`}],{duration:ctx.durationMs});
   ctx.animate(target,[{opacity:0},{opacity:1}],{duration:ctx.durationMs});
  }});
 },[scope,cancel]);
 useLayoutEffect(()=>{const next=pending.current;if(!next)return;if(next.destination!==scene){cancel();return}const find=()=>{const target=document.querySelector(`[data-scene-anchor="${CSS.escape(scene)}"]`);if(target)targetRef(target)};find();if(!pending.current)return;
  // Lazy pages can mount after the route shell. The observer has a bounded lifetime.
  const observer=new MutationObserver(find);observer.observe(document.body,{childList:true,subtree:true});const timer=setTimeout(()=>{observer.disconnect();pending.current=null},500);
  return()=>{observer.disconnect();clearTimeout(timer)};
 },[scene,cancel,targetRef]);
 useEffect(()=>cancel,[cancel]);
 return {onBeforeNavigate,targetRef,cancel};
}
