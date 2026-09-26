import {useEffect,useLayoutEffect,useRef,useState,type RefObject} from 'react';
import {createPortal} from 'react-dom';
import {publicUrl} from '../deployment';
import type {BattleAnchor,BattleChange,BattleCue,MatchView} from '../game/types';
import {cueOffset,ATTACK_TIMING,type MotionGroup,type Point} from './battle-motion';
import {motionDirector,type MotionContext,type MotionEndReason} from '../motion/MotionDirector';
import {BattleEventAdapter,commandUsesUnstableTarget,groupActors,motionKey,type BattleMotionControl} from '../motion/eventAdapter';
import {clonePaperRig,paperRig} from '../motion/paperRig';
import {useMotionPreferences,getMotionPreferences} from '../motion/useMotionPreferences';
import {playResultMotion} from './result-motion';
import '../styles/battle-effects.css';
import '../styles/result-motion.css';

interface Props {view:MatchView;arenaRef:RefObject<HTMLElement|null>;onBusyChange?:(busy:boolean)=>void;onDepartureComplete?:(id:string)=>void;onResultPending?:(pending:boolean)=>void;controlRef?:RefObject<BattleMotionControl|null>}
interface Anchor {point:Point;rect:{left:number;top:number;width:number;height:number};clone?:HTMLElement}
interface Pending {group:MotionGroup;actors:Set<string>}
const gold='#e9b665',teal='#85c4ad';
let instance=0;
/** One public event consumer. The director owns all temporary nodes, animations and callbacks. */
export default function BattleEffects({view,arenaRef,onBusyChange,onDepartureComplete,onResultPending,controlRef}:Props){
 const layerRef=useRef<HTMLDivElement>(null),cache=useRef(new Map<string,Anchor>()),adapter=useRef(new BattleEventAdapter());
 const scope=useRef(`battle:${view.matchId}:${++instance}`).current,pending=useRef(new Map<string,Pending>()),alive=useRef(true);
 const current=useRef(view);current.current=view;
 const callbacks=useRef({onBusyChange,onDepartureComplete,onResultPending});callbacks.current={onBusyChange,onDepartureComplete,onResultPending};
 const prefs=useMotionPreferences(),[busy,setBusy]=useState(false),[kind,setKind]=useState(''),[catchUps,setCatchUps]=useState(0),[diagnostics,setDiagnostics]=useState(()=>motionDirector.diagnostics());
 const [effectiveReduced,setEffectiveReduced]=useState(prefs.reduced);
 const lastPhase=useRef(view.phase),terminal=useRef(false);
 const find=(id?:string)=>id?[...(arenaRef.current?.querySelectorAll<HTMLElement>('[data-battle-id]')??[])].find(el=>el.dataset.battleId===id):undefined;
 function announce(){if(!alive.current)return;const active=pending.current.size>0;setBusy(active);if(!active)setKind('');callbacks.current.onBusyChange?.(active)}
 function completeDepartures(group:MotionGroup){for(const cue of group.cues)if(cue.kind==='retire'||cue.kind==='bounce'){const id=cue.kind==='bounce'?cue.sourceId:cue.targetId??cue.sourceId;if(id)callbacks.current.onDepartureComplete?.(id)}}
 function catchUp(reason='catch-up'){
  motionDirector.cancelScope(scope,reason==='hidden'?'hidden':'catch-up');
  for(const {group}of pending.current.values())completeDepartures(group);pending.current.clear();
  adapter.current.sync(current.current);terminal.current=false;callbacks.current.onResultPending?.(false);
  if(alive.current)setCatchUps(value=>value+1);announce();
 }
 if(controlRef)controlRef.current={catchUp,prepare:async(command,version)=>{
  if(current.current.version!==version)return false;
  const unstable=new Set([...pending.current.values()].flatMap(item=>[...item.actors]));for(const id of motionDirector.actorIds(`board:${current.current.matchId}`))unstable.add(id);
  if(commandUsesUnstableTarget(command,current.current,unstable)){
   catchUp('target');motionDirector.catchUp(`board:${current.current.matchId}`);await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
  }
  return current.current.version===version;
 }};
 function capture(){
  const elements=arenaRef.current?.querySelectorAll<HTMLElement>('[data-battle-id],[data-offer-id],[data-hand-id]')??[];
  for(const element of elements){
   if(element.dataset.departing==='true')continue;
   const rect=element.getBoundingClientRect();if(!rect.width||!rect.height)continue;
   const id=element.dataset.battleId??element.dataset.offerId??element.dataset.handId!;
   cache.current.set(id,{point:{x:rect.left+rect.width/2,y:rect.top+rect.height/2},rect:{left:rect.left,top:rect.top,width:rect.width,height:rect.height},clone:clonePaperRig(element)});
  }
  if(cache.current.size>100)for(const id of [...cache.current.keys()].slice(0,cache.current.size-100))cache.current.delete(id);
 }
 function locate(id?:string,anchor?:BattleAnchor):Anchor {
  let element=find(id);
  if(!element&&anchor?.kind==='hand')element=arenaRef.current?.querySelector<HTMLElement>(anchor.playerId===current.current.selfId?'.hand-cards':'.opponent-cards')??undefined;
  if(!element&&anchor?.kind==='deck')element=arenaRef.current?.querySelector<HTMLElement>(anchor.playerId===current.current.selfId?'.hand-label':'.opponent-cards')??undefined;
  if(element){const rect=element.getBoundingClientRect();return {point:{x:rect.left+rect.width/2,y:rect.top+rect.height/2},rect:{left:rect.left,top:rect.top,width:rect.width,height:rect.height},clone:cache.current.get(id??'')?.clone??clonePaperRig(element)}}
  if(id&&cache.current.has(id))return cache.current.get(id)!;
  const arena=arenaRef.current?.getBoundingClientRect();const row=[...(arenaRef.current?.querySelectorAll<HTMLElement>('[data-battle-row]')??[])].find(el=>el.dataset.battleRow===anchor?.playerId)?.getBoundingClientRect();
  const point=row?{x:row.left+row.width*(.125+.25*Math.min(3,anchor?.slot??1)),y:row.top+row.height/2}:{x:(arena?.left??0)+(arena?.width??innerWidth)/2,y:(arena?.top??0)+(arena?.height??innerHeight)*.42};
  return {point,rect:{left:point.x-48,top:point.y-60,width:96,height:120}};
 }
 function present(group:MotionGroup,ctx:MotionContext,options:{final?:boolean}={}){
  const scale=options.final?1:Math.min(1,ctx.durationMs/group.duration);
  const later=(fn:()=>void,ms:number)=>ctx.later(fn,Math.max(0,ms*scale));
  const animate=(node:Element,frames:Keyframe[],ms:number,extra:KeyframeAnimationOptions={})=>ctx.animate(node,frames,{duration:Math.max(1,ms*scale),fill:'both',...extra});
  const append=(node:HTMLElement)=>{layerRef.current?.append(node);ctx.addCleanup(()=>node.remove());return node};
  const pointNode=(className:string,point:Point)=>{const node=document.createElement('div');node.className=className;node.style.left=point.x+'px';node.style.top=point.y+'px';return append(node)};
  function burst(point:Point,color=gold){
   if(ctx.reduced)return;
   const ring=pointNode('paper-fx-ring',point);ring.style.borderColor=color;
   animate(ring,[{opacity:.8,transform:'translate(-50%,-50%) scale(.25)'},{opacity:0,transform:'translate(-50%,-50%) scale(1.4)'}],240);
   const count=ctx.quality==='compact'?3:9;
   for(let i=0;i<count;i++){const particle=pointNode('paper-fx-chip',point);particle.style.background=i%3?color:'#fff6dc';const angle=i/count*Math.PI*2,distance=25+(i%3)*14;
    animate(particle,[{opacity:1,transform:'translate(0,0) rotate(0)'},{opacity:0,transform:`translate(${Math.cos(angle)*distance}px,${Math.sin(angle)*distance+15}px) rotate(${i*37}deg)`}],280);
   }
  }
  function label(point:Point,text:string,tone='skill',delay=0){later(()=>{const node=pointNode(`battle-fx-number ${tone}`,point);node.textContent=text;animate(node,ctx.reduced?[{opacity:0},{opacity:1,offset:.3},{opacity:0}]:[{opacity:0,transform:'translate(-50%,0)'},{opacity:1,transform:'translate(-50%,-9px)',offset:.25},{opacity:0,transform:'translate(-50%,-27px)'}],ctx.reduced?90:280)},delay)}
  function numbers(changes:BattleChange[]|undefined,cue:BattleCue,delay=0){
   const totals=new Map<string,{damage:number;heal:number;attack:number;health:number}>();
   for(const change of changes??[]){const row=totals.get(change.targetId)??{damage:0,heal:0,attack:0,health:0};if(change.stat==='mind'||change.stat==='health'){if(change.amount<0)row.damage+=change.amount;else row.heal+=change.amount}if(change.stat==='attack')row.attack+=change.amount;if(change.stat==='maxHealth')row.health+=change.amount;totals.set(change.targetId,row)}
   for(const [id,value]of totals){const point=locate(id,id===cue.sourceId?cue.source:cue.target).point;if(value.damage)label(point,String(value.damage),'damage',delay);if(value.heal&&!value.health)label(point,'+'+value.heal,'heal',delay);if(value.attack||value.health)label(point,`${value.attack>=0?'+':''}${value.attack} / ${value.health>=0?'+':''}${value.health}`,'buff small',delay)}
  }
  function hit(cue:BattleCue,delay=0,healing=false){later(()=>{
   const anchor=locate(cue.targetId,cue.target);burst(anchor.point,healing?teal:gold);
   const target=find(cue.targetId);if(!target)return;const rig=paperRig(target);
   target.classList.add('paper-hit-outline');ctx.addCleanup(()=>target.classList.remove('paper-hit-outline'));
   if(!ctx.reduced){const from=locate(cue.sourceId,cue.source).point,sign=from.x>anchor.point.x?-1:1;animate(rig.body,healing?[{transform:'scaleY(.98)'},{transform:'scaleY(1)'}]:[{transform:'rotate(0)'},{transform:`rotate(${sign*6}deg) skewX(${sign*2}deg)`,offset:.25},{transform:'rotate(0) skewX(0)'}],180)}
  },delay)}
  const fallenFlights=new Map<string,Anchor>();
  function flight(cue:BattleCue){
   const from=locate(cue.sourceId,cue.source),to=locate(cue.targetId,cue.target),duration=ATTACK_TIMING.duration,contact=ATTACK_TIMING.contact;
   if(ctx.reduced){numbers(cue.changes,cue);hit(cue);return}
   const wrapper=pointNode('battle-fx-flight battle-fit',from.point);wrapper.dataset.kind='attack';Object.assign(wrapper.style,{left:from.rect.left+'px',top:from.rect.top+'px',width:from.rect.width+'px',height:from.rect.height+'px'});
   const clone=from.clone?clonePaperRig(from.clone):document.createElement('div');
   if(!from.clone)clone.className='battle-fx-card-back';
   clone.querySelectorAll('.unit-info,.unit-status,.notice-stamp').forEach(node=>node.remove());wrapper.append(clone);
   const dx=to.point.x-from.point.x,dy=to.point.y-from.point.y;
   const died=cue.source?.kind==='unit'&&!current.current.players.some(player=>player.board.some(unit=>unit.id===cue.sourceId));
   const frames:Keyframe[]=[{transform:'translate(0,0)'},{transform:`translate(${-dx*.04}px,${-dy*.04}px)`,offset:.16},{transform:`translate(${dx}px,${dy}px)`,offset:contact/duration},{transform:`translate(${dx}px,${dy}px)`,offset:.68},{transform:died?`translate(${dx}px,${dy}px)`:'translate(0,0)'}];
   animate(wrapper,frames,duration,{easing:'linear'});animate(paperRig(clone).body,[{transform:'rotate(0)'},{transform:`rotate(${dx>0?5:-5}deg)`,offset:.5},{transform:'rotate(0)'}],duration);
   const original=find(cue.sourceId);
   if(original){const previous=original.style.visibility;original.style.visibility='hidden';original.dataset.inFlight='true';ctx.addCleanup(()=>{original.style.visibility=previous;delete original.dataset.inFlight})}
   if(died&&cue.sourceId){fallenFlights.set(cue.sourceId,{point:to.point,rect:{...from.rect,left:from.rect.left+dx,top:from.rect.top+dy},clone:from.clone});later(()=>wrapper.remove(),contact)}
   const actorName=cue.source?.name||clone.querySelector('.unit-name')?.textContent||'角色';
   const targetName=cue.target?.name||find(cue.targetId)?.querySelector('.unit-name')?.textContent||current.current.players.find(p=>p.id===cue.targetId)?.name||'目标';
   const caption=pointNode('battle-attack-caption',{x:innerWidth/2,y:Math.min(from.point.y,to.point.y)-65});caption.textContent=`${actorName}  →  ${targetName}`;
   animate(caption,[{opacity:0},{opacity:1,offset:.1},{opacity:1,offset:.85},{opacity:0}],duration);
   const target=find(cue.targetId);target?.classList.add('paper-attack-target');ctx.addCleanup(()=>target?.classList.remove('paper-attack-target'));
   later(()=>wrapper.remove(),duration);hit(cue,contact);numbers(cue.changes,cue,contact);

  }
  function departure(cue:BattleCue,delay:number){later(()=>{
   const id=cue.kind==='bounce'?cue.sourceId:cue.targetId??cue.sourceId;const anchor=fallenFlights.get(id??'')??locate(id,cue.kind==='bounce'?cue.source:cue.target??cue.source);
   const original=find(id);if(original?.dataset.departing==='true'){original.style.visibility='hidden';ctx.addCleanup(()=>{original.style.visibility=''})}
   if(anchor.clone){const ghost=pointNode('battle-fx-ghost battle-fit',anchor.point);ghost.dataset.departureId=id;Object.assign(ghost.style,{left:anchor.rect.left+'px',top:anchor.rect.top+'px',width:anchor.rect.width+'px',height:anchor.rect.height+'px'});const clone=clonePaperRig(anchor.clone);ghost.append(clone);
    const owner=cue.source?.playerId??cue.target?.playerId??cue.playerId;const destination=locate(`${owner}:hand`,{kind:'hand',id:`${owner}:hand`,playerId:owner??current.current.selfId});
    animate(ghost,ctx.reduced?[{opacity:1},{opacity:0}]:[{opacity:1,transform:'translate(0,0)'},{opacity:0,transform:cue.kind==='bounce'?`translate(${destination.point.x-anchor.point.x}px,${destination.point.y-anchor.point.y}px)`:'translate(0,22px)'}],ATTACK_TIMING.departure);
    if(!ctx.reduced)animate(paperRig(clone).body,[{transform:'rotate(0) scaleY(1)'},{transform:cue.kind==='bounce'?'rotateY(65deg) scale(.45)':'rotate(13deg) scaleY(.14)'}],ATTACK_TIMING.departure);
    later(()=>ghost.remove(),ATTACK_TIMING.departure);
   }
   later(()=>{if(id)callbacks.current.onDepartureComplete?.(id)},ATTACK_TIMING.departure);
  },delay);numbers(cue.changes,cue,delay+100)}
  function video(point:Point){
   if(ctx.reduced||ctx.quality==='compact')return;
   const node=document.createElement('video');node.className='battle-fx-video';node.src=publicUrl('/assets/animations/alumni-burst.mp4');node.muted=true;node.playsInline=true;node.playbackRate=5.5;node.style.left=point.x+'px';node.style.top=point.y+'px';append(node);ctx.addCleanup(()=>{node.pause();node.removeAttribute('src');node.load()});void node.play().catch(()=>node.remove());
  }
  function cue(cue:BattleCue,index:number){const offset=ctx.reduced?0:cueOffset(group,index),to=locate(cue.targetId??cue.playerId,cue.target);
   if(cue.kind==='attack'){flight(cue);return}
   if(cue.kind==='retire'||cue.kind==='bounce'){departure(cue,offset);return}
   if(cue.kind==='damage'){hit(cue,offset);numbers(cue.changes,cue,offset);return}
   if(cue.kind==='heal'||cue.kind==='buff'){hit(cue,offset,true);numbers(cue.changes,cue,offset);return}
   if(cue.kind==='deploy'){
    later(()=>{const target=find(cue.targetId);if(!target)return;const unit=current.current.players.flatMap(player=>player.board).find(unit=>unit.id===cue.targetId);const from=unit?.offerId?cache.current.get(unit.offerId):undefined;const body=paperRig(target);const dx=from?from.point.x-to.point.x:0,dy=from?from.point.y-to.point.y:-55;
     animate(body.move,ctx.reduced?[{opacity:0},{opacity:1}]:[{opacity:0,transform:`translate(${dx}px,${dy}px) scaleY(1)`},{opacity:1,transform:'translate(0,2px) scaleY(.97)',offset:.75},{transform:'translate(0,0) scaleY(1)'}],340);
     if(body.shadow&&!ctx.reduced)animate(body.shadow,[{opacity:0,transform:'scale(.6)'},{opacity:.25,transform:'scale(1)'}],340);burst(to.point);
    },offset);return;
   }
   if(cue.kind==='primary_skill'||cue.kind==='secondary_skill'){
    const from=locate(cue.sourceId,cue.source).point;later(()=>{burst(from,teal);burst(to.point);if(cue.kind==='secondary_skill'||cue.effectId==='jlu_ultimate')video({x:(from.x+to.point.x)/2,y:(from.y+to.point.y)/2})},offset);label({x:to.point.x,y:to.point.y-35},cue.label??'技能生效','skill small',offset);numbers(cue.changes,cue,offset+160);return;
   }
   if(cue.kind==='retort'){
    later(()=>{const note=pointNode('battle-fx-retort paper-contract',to.point);note.textContent='合同生效';animate(note,ctx.reduced?[{opacity:0},{opacity:1}]:[{opacity:0,transform:'translate(-50%,-50%) rotateY(-70deg)'},{opacity:1,transform:'translate(-50%,-50%) rotateY(0deg)',offset:.45},{opacity:0,transform:'translate(-50%,-55%)'}],300)},offset);numbers(cue.changes,cue,offset+120);return;
   }
   if(cue.kind==='draw'){
    if(ctx.reduced)return;const from=locate(cue.sourceId,cue.source).point;later(()=>{const back=pointNode('paper-fx-draw',from);animate(back,[{opacity:.3,transform:'translate(-50%,-50%)'},{opacity:1,offset:.3},{opacity:0,transform:`translate(calc(-50% + ${to.point.x-from.x}px),calc(-50% + ${to.point.y-from.y}px))`}],280)},offset);return;
   }
   if(cue.kind==='status'||cue.kind==='topic'){
    const note=cue.effectId==='notice'?'优化通知 · 到己方回合开始检查':cue.effectId==='management'?'已转管理 · 不再具有一线标签':cue.effectId==='age'?cue.label??'年龄更新':cue.label??'状态更新';
    label({x:to.point.x,y:to.point.y-25},note,'skill small',offset);numbers(cue.changes,cue,offset);return;
   }
   if(cue.kind==='card'){label({x:to.point.x,y:to.point.y-25},cue.label??'行动生效','skill small',offset);return}
  }
  if(options.final){
   const result=group.cues.find(cue=>cue.kind==='result')!;const attack=[...group.cues].reverse().find(cue=>cue.kind==='attack');
   if(attack&&!ctx.reduced)flight(attack);
   const start=()=>{if(!layerRef.current||!arenaRef.current)return;const motion=playResultMotion({layer:layerRef.current,arena:arenaRef.current,view:current.current,cue:result,reduced:ctx.reduced,later:(fn,ms)=>ctx.later(fn,ms),animate:(node,frames,options)=>ctx.animate(node,frames,options)!});ctx.addCleanup(()=>motion.dispose())};
   if(attack&&!ctx.reduced)ctx.later(start,ATTACK_TIMING.duration);else start();return;
  }
  group.cues.forEach(cue);
 }
 function enqueue(group:MotionGroup,final=false){
  const actors=new Set(groupActors(group));for(const cue of group.cues)if(cue.kind==='retire'||cue.kind==='bounce')if(cue.target?.playerId||cue.source?.playerId)actors.add(cue.target?.playerId??cue.source!.playerId);
  pending.current.set(group.id,{group,actors});announce();
  motionDirector.play({cue:final?'resultCurtain':motionKey(group.cues[0]),channel:final?'attention':'battle',id:group.id,scope,confirmed:true,durationMs:group.duration,actorIds:[...actors],run:ctx=>{if(alive.current)setKind(final?'result':group.cues[0].kind);present(group,ctx,{final})},onSettled:(reason:MotionEndReason)=>{
   pending.current.delete(group.id);completeDepartures(group);if(final){terminal.current=false;callbacks.current.onResultPending?.(false)}
   if(reason==='catch-up'&&alive.current)setCatchUps(value=>value+1);announce();
  }});
 }
 useLayoutEffect(()=>{
  capture();
  const batch=adapter.current.consume(view,effectiveReduced,prefs.hidden);
  const finished=view.phase==='finished'&&lastPhase.current!=='finished';lastPhase.current=view.phase;
  if(batch.hidden){catchUp('hidden');return}
  if(finished){
   motionDirector.catchUp(`board:${view.matchId}`);
   const result=batch.fresh.find(cue=>cue.kind==='result');
   if(result){catchUp('result');terminal.current=true;callbacks.current.onResultPending?.(true);enqueue({id:result.id,cues:batch.fresh,duration:(batch.fresh.some(c=>c.kind==='attack')?ATTACK_TIMING.duration:0)+650},true)}
   else callbacks.current.onResultPending?.(false);
   return;
  }
  if(batch.newOwnTurn){
   catchUp('new-turn');motionDirector.catchUp(`board:${view.matchId}`);
   motionDirector.play({cue:'turnBanner',id:`turn:${view.version}`,scope,confirmed:true,run:ctx=>{
    const node=document.createElement('div');node.className='turn-flash';node.textContent='轮到你了';const line=document.createElement('small');line.textContent='让这份 Offer 说话';node.append(line);layerRef.current?.append(node);ctx.addCleanup(()=>node.remove());ctx.animate(node,[{opacity:0},{opacity:1,offset:.25},{opacity:1,offset:.8},{opacity:0}],{duration:ctx.durationMs});
   }});return;
  }
  for(const group of batch.groups)enqueue(group);
 },[view.matchId,view.version,view.visualCues]);
 useEffect(()=>{
  alive.current=true;capture();const unsubscribe=motionDirector.subscribe(()=>{if(alive.current)setDiagnostics(motionDirector.diagnostics())});
  const resize=()=>{catchUp('resize');capture()};window.addEventListener('resize',resize);
  return()=>{alive.current=false;motionDirector.cancelScope(scope,'disposed');pending.current.clear();cache.current.clear();window.removeEventListener('resize',resize);unsubscribe();callbacks.current.onBusyChange?.(false);callbacks.current.onResultPending?.(false);if(controlRef)controlRef.current=null};
 },[scope]);
 useEffect(()=>setEffectiveReduced(prefs.reduced),[prefs.reduced]);
 useEffect(()=>{if(prefs.hidden)catchUp('hidden');else adapter.current.sync(current.current)},[prefs.hidden]);
 // Legacy integrations changed data-reduced directly. Keep that explicit action compatible.
 useEffect(()=>{const observer=new MutationObserver(()=>{const requested=document.documentElement.dataset.reduced==='true';setEffectiveReduced(requested);if(requested!==getMotionPreferences().reduced)motionDirector.setPreferences({...getMotionPreferences(),reduced:requested})});observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-reduced']});return()=>observer.disconnect()},[]);
 return createPortal(<><div ref={layerRef} className="battle-effects" data-busy={busy} data-kind={kind||undefined} data-reduced-motion={effectiveReduced} data-phase={view.phase} data-version={view.version} data-owned-jobs={pending.current.size} data-director-active={diagnostics.active} data-director-timers={diagnostics.timers} data-director-errors={diagnostics.errors} data-catch-ups={catchUps} aria-hidden="true"/>{catchUps>0&&<span className="motion-status" role="status">演出已对齐当前牌桌，完整事件保留在战斗记录中。</span>}</>,document.body);
}
