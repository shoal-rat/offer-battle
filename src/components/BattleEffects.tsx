import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties,type RefObject} from 'react';
import {createPortal} from 'react-dom';
import type {BattleAnchor,BattleChange,BattleCue,MatchView} from '../game/types';
import {ATTACK_REWRITE_AT,ATTACK_REWRITE_MS,ATTACK_TIMING,CARD_TIMING,DEPLOY_TIMING,REWRITE_MS,SKILL_TIMING,attackKeyframes,cueOffset,groupBattleCues,type MotionGroup,type Point} from './battle-motion';
import {motionDirector,type MotionContext,type MotionEndReason} from '../motion/MotionDirector';
import {BattleEventAdapter,commandUsesUnstableTarget,groupActors,motionKey,type BattleMotionControl} from '../motion/eventAdapter';
import {clonePaperRig} from '../motion/paperRig';
import {useMotionPreferences,getMotionPreferences} from '../motion/useMotionPreferences';
import {setBattlePresentationBusy} from '../motion/presentationGate';
import {playResultMotion,resultMotionDuration} from './result-motion';
import {StatLedger} from './stat-holds';
import {banner,confetti,pencilRewrite,popStat,recoil,ring,rosette,shake,sparkles,speedLines,splat,stamp,tear,type Fx} from './battle-fx';
import {BATTLE_SOUND_EVENT,soundsForBatch,soundsForGroup,type CueSound} from '../sound-effects';
import {cardById} from '../game/catalog';
import {CommonCard} from '../ui';
import '../styles/battle-effects.css';
import '../styles/result-motion.css';

interface Props {view:MatchView;arenaRef:RefObject<HTMLElement|null>;onBusyChange?:(busy:boolean)=>void;onInputLockChange?:(locked:boolean)=>void;onDepartureComplete?:(id:string)=>void;onResultPending?:(pending:boolean)=>void;controlRef?:RefObject<BattleMotionControl|null>}
interface Rect {left:number;top:number;width:number;height:number}
interface Anchor {point:Point;rect:Rect;clone?:HTMLElement}
/** `blocking` groups show the opponent's move (or the turn banner): the player waits for them, like at a real table. */
interface Pending {group:MotionGroup;actors:Set<string>;blocking:boolean}
interface Showcase {key:string;cardId:string;ms:number;from:Point;rest:Point;to:Point|null}
interface LeftHand {id:string;definitionId:string;anchor:Anchor}
const TURN_BANNER_MS=1150;
let instance=0;
const rectOf=(element:Element):{point:Point;rect:Rect}=>{const r=element.getBoundingClientRect();return {point:{x:r.left+r.width/2,y:r.top+r.height/2},rect:{left:r.left,top:r.top,width:r.width,height:r.height}}};

/** One public event consumer. The director owns all temporary nodes, animations and callbacks;
 * the stat ledger keeps every number on the table honest to what has been shown so far. */
export default function BattleEffects({view,arenaRef,onBusyChange,onInputLockChange,onDepartureComplete,onResultPending,controlRef}:Props){
 const layerRef=useRef<HTMLDivElement>(null),cache=useRef(new Map<string,Anchor>()),adapter=useRef(new BattleEventAdapter());
 const scope=useRef(`battle:${view.matchId}:${++instance}`).current,pending=useRef(new Map<string,Pending>()),alive=useRef(true);
 const ledgerRef=useRef<StatLedger|null>(null);if(!ledgerRef.current)ledgerRef.current=new StatLedger(()=>arenaRef.current);const ledger=ledgerRef.current;
 const landed=useRef(new Set<string>()),revealed=useRef(new Set<string>()),leftHand=useRef<LeftHand[]>([]),previousView=useRef(view);
 const current=useRef(view);current.current=view;
 const callbacks=useRef({onBusyChange,onInputLockChange,onDepartureComplete,onResultPending});callbacks.current={onBusyChange,onInputLockChange,onDepartureComplete,onResultPending};
 const prefs=useMotionPreferences(),[busy,setBusy]=useState(false),[kind,setKind]=useState(''),[catchUps,setCatchUps]=useState(0),[diagnostics,setDiagnostics]=useState(()=>motionDirector.diagnostics());
 const [showcase,setShowcase]=useState<Showcase|null>(null);
 const [effectiveReduced,setEffectiveReduced]=useState(prefs.reduced);
 const lastPhase=useRef(view.phase),terminal=useRef(false);
 const find=(id?:string)=>id?[...(arenaRef.current?.querySelectorAll<HTMLElement>('[data-battle-id]')??[])].find(el=>el.dataset.battleId===id):undefined;
 const table=()=>arenaRef.current?.querySelector<HTMLElement>('.arena')??null;
 function announce(){
  if(!alive.current)return;
  const active=pending.current.size>0,locked=[...pending.current.values()].some(item=>item.blocking);
  setBusy(active);if(!active)setKind('');setBattlePresentationBusy(active);
  callbacks.current.onBusyChange?.(active);callbacks.current.onInputLockChange?.(locked);
 }
 function departureId(cue:BattleCue){return cue.kind==='bounce'?cue.sourceId:cue.targetId??cue.sourceId}
 function completeDepartures(group:MotionGroup){for(const cue of group.cues)if(cue.kind==='retire'||cue.kind==='bounce'){const id=departureId(cue);if(id)callbacks.current.onDepartureComplete?.(id)}}
 function revealEntrances(ids?:string[]){
  for(const node of arenaRef.current?.querySelectorAll<HTMLElement>('[data-await-entrance]')??[])if(!ids||ids.includes(node.dataset.battleId??node.dataset.handId??''))delete node.dataset.awaitEntrance;
 }
 function revealDrawnCard(){const card=arenaRef.current?.querySelector<HTMLElement>('.hand-card-wrapper[data-await-entrance]');if(card)delete card.dataset.awaitEntrance;return card??null}
 /** Reveal whatever a group still owes the table, whether it finished, was skipped or cancelled. */
 function settle(group:MotionGroup){
  for(const cue of group.cues){
   ledger.landChanges(pendingChanges(cue));
   if(landed.current.has(cue.id))continue;landed.current.add(cue.id);
   if(cue.kind==='deploy'&&cue.targetId)revealEntrances([cue.targetId]);
   if(cue.kind==='draw')revealDrawnCard();
  }
  if(landed.current.size>800)landed.current=new Set([...landed.current].slice(-400));
  completeDepartures(group);
 }
 /** Changes of a cue whose numbers have not been written back yet (each change is revealed exactly once). */
 function pendingChanges(cue:BattleCue,only:(change:BattleChange)=>boolean=()=>true){
  const out:BattleChange[]=[];
  (cue.changes??[]).forEach((change,index)=>{const key=`${cue.id}#${index}`;if(revealed.current.has(key)||!only(change))return;revealed.current.add(key);out.push(change)});
  if(revealed.current.size>1600)revealed.current=new Set([...revealed.current].slice(-800));
  return out;
 }
 function catchUp(reason='catch-up'){
  motionDirector.cancelScope(scope,reason==='hidden'?'hidden':'catch-up');
  for(const {group}of pending.current.values())completeDepartures(group);pending.current.clear();
  ledger.release();revealed.current.clear();revealEntrances();for(const node of arenaRef.current?.querySelectorAll<HTMLElement>('[data-rewrite]')??[])delete node.dataset.rewrite;leftHand.current=[];if(alive.current)setShowcase(null);
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
   const {point,rect}=rectOf(element);if(!rect.width||!rect.height)continue;
   const id=element.dataset.battleId??element.dataset.offerId??element.dataset.handId!;
   cache.current.set(id,{point,rect,clone:clonePaperRig(element)});
  }
  if(cache.current.size>100)for(const id of [...cache.current.keys()].slice(0,cache.current.size-100))cache.current.delete(id);
 }
 /** Live elements are cloned at the moment they move, so a flight shows the numbers held right now. */
 function locate(id?:string,anchor?:BattleAnchor,withClone=false):Anchor {
  let element=find(id);
  if(!element&&anchor?.kind==='hand')element=arenaRef.current?.querySelector<HTMLElement>(anchor.playerId===current.current.selfId?'.hand-cards':'.opponent-cards')??undefined;
  if(!element&&anchor?.kind==='deck')element=arenaRef.current?.querySelector<HTMLElement>(anchor.playerId===current.current.selfId?'.hand-label':'.opponent-cards')??undefined;
  if(element)return {...rectOf(element),clone:withClone?clonePaperRig(element):undefined};
  if(id&&cache.current.has(id))return cache.current.get(id)!;
  const arena=arenaRef.current?.getBoundingClientRect();const row=[...(arenaRef.current?.querySelectorAll<HTMLElement>('[data-battle-row]')??[])].find(el=>el.dataset.battleRow===anchor?.playerId)?.getBoundingClientRect();
  const point=row?{x:row.left+row.width*(.125+.25*Math.min(3,anchor?.slot??1)),y:row.top+row.height/2}:{x:(arena?.left??0)+(arena?.width??innerWidth)/2,y:(arena?.top??0)+(arena?.height??innerHeight)*.42};
  return {point,rect:{left:point.x-48,top:point.y-60,width:96,height:120}};
 }
 function makeFx(ctx:MotionContext,scale=1):Fx{
  return {reduced:ctx.reduced,compact:ctx.quality==='compact',
   later:(fn,ms)=>ctx.later(fn,Math.max(0,ms*scale)),
   animate:(node,frames,ms,extra={})=>ctx.animate(node,frames,{duration:Math.max(1,ms*scale),fill:'both',...extra}),
   append:node=>{layerRef.current?.append(node);ctx.addCleanup(()=>node.remove());return node},
   cleanup:fn=>ctx.addCleanup(fn)};
 }
 function emitSounds(sounds:CueSound[],scale:number){if(sounds.length)window.dispatchEvent(new CustomEvent(BATTLE_SOUND_EVENT,{detail:{sounds,scale}}))}
 function present(group:MotionGroup,ctx:MotionContext,options:{final?:boolean}={}){
  const scale=options.final?1:Math.min(1,ctx.durationMs/group.duration),fx=makeFx(ctx,scale),selfId=current.current.selfId;
  emitSounds(options.final?soundsForBatch(group.cues,selfId,ctx.reduced)[0]?.sounds??[]:soundsForGroup(group,selfId,ctx.reduced).sounds,scale);
  const onTable=(node:Element|null|undefined,frames:Keyframe[],ms:number,extra:KeyframeAnimationOptions={})=>node?fx.animate(node,frames,ms,{fill:'none',...extra}):undefined;
  const box=(className:string,anchor:{rect:Rect})=>{const node=document.createElement('div');node.className=className;Object.assign(node.style,{left:anchor.rect.left+'px',top:anchor.rect.top+'px',width:anchor.rect.width+'px',height:anchor.rect.height+'px'});return fx.append(node)};
  const bodyOf=(element?:HTMLElement)=>element?.classList.contains('hero-avatar')?element:element?.querySelector<HTMLElement>('.unit-portrait')??element;
  const fallen=new Map<string,Anchor>();

  /** Pencil every number a set of changes moves: erase what was there, write what is true now (red for health and mind). */
  function reveal(changes:readonly BattleChange[],fast=false){
   const numbers=new Map<HTMLElement,{from:string;to:string;red:boolean;departing:boolean}>();
   for(const moved of ledger.landChanges(changes)){const prior=numbers.get(moved.element);numbers.set(moved.element,{from:prior?.from??moved.from,to:moved.to,red:moved.slot!=='attack',departing:moved.departing})}
   let pencils=0;
   for(const [element,number]of numbers){
    if(number.from===number.to)continue;
    // A falling stand-up is torn a moment later, and a crowd of pencils would bury the table: those just pop.
    if(number.departing||pencils>=4){popStat(fx,element,Number(number.to)-Number(number.from));continue}
    pencilRewrite(fx,element,number.from,number.to,number.red,fast?ATTACK_REWRITE_MS:REWRITE_MS,pencils*60);pencils++;
   }
  }
  /** The blow itself: a splat, paper chips, recoil and — for real damage — a table shake. */
  function impact(cue:BattleCue,changes:readonly BattleChange[],from?:Point){
   const totals=new Map<string,{damage:number;heal:number;attack:number;health:number}>();
   for(const change of changes){
    const row=totals.get(change.targetId)??{damage:0,heal:0,attack:0,health:0};
    if(change.stat==='mind'||change.stat==='health'){if(change.amount<0)row.damage+=change.amount;else row.heal+=change.amount}
    if(change.stat==='attack')row.attack+=change.amount;if(change.stat==='maxHealth')row.health+=change.amount;
    totals.set(change.targetId,row);
   }
   let heaviest=0;
   for(const [id,value]of totals){
    const element=find(id),anchor=element?rectOf(element):locate(id,id===cue.sourceId?cue.source:cue.target),moving=displaced.get(id),point=moving??anchor.point;
    if(value.damage<0){
     const size=-value.damage;heaviest=Math.max(heaviest,size);
     splat(fx,point,String(value.damage),'damage',(moving?.78:.92)+Math.min(.5,size*.07));ring(fx,point,'damage',.9+Math.min(.6,size*.08));confetti(fx,point,'damage',8+Math.min(10,size*2));
     if(from&&!moving&&Math.hypot(point.x-from.x,point.y-from.y)>20)speedLines(fx,point,Math.atan2(point.y-from.y,point.x-from.x));
     if(!moving)recoil(fx,bodyOf(element),from&&point.x<from.x?-1:1,size>=5);
    }
    if(value.heal>0&&!value.health){splat(fx,point,'+'+value.heal,'heal',.86);sparkles(fx,point,'heal');ring(fx,point,'heal',.8)}
    if(value.attack||value.health){const worse=value.attack<0||value.health<0;splat(fx,{x:point.x,y:point.y-10},`${value.attack>=0?'+':''}${value.attack}/${value.health>=0?'+':''}${value.health}`,worse?'damage':'buff',.82);sparkles(fx,point,worse?'damage':'buff',7)}
   }
   if(heaviest)shake(fx,table(),2.4+heaviest*1.35);
  }
  /** Where a moving figure really is right now (a lunging attacker is beside its target, not in its slot). */
  const displaced=new Map<string,Point>();
  function land(cue:BattleCue,from?:Point){
   if(landed.current.has(cue.id))return;landed.current.add(cue.id);
   const changes=pendingChanges(cue);impact(cue,changes,from);reveal(changes);
  }
  function attack(cue:BattleCue){
   const from=locate(cue.sourceId,cue.source,true),to=locate(cue.targetId,cue.target);
   if(ctx.reduced){land(cue,from.point);return}
   const wrapper=box('battle-fx-flight battle-fit',from);wrapper.dataset.kind='attack';
   const clone=from.clone??Object.assign(document.createElement('div'),{className:'battle-fx-card-back'});
   clone.querySelectorAll('.unit-info,.unit-status,.notice-stamp').forEach(node=>node.remove());wrapper.append(clone);
   const dx=to.point.x-from.point.x,dy=to.point.y-from.point.y;
   const died=cue.source?.kind==='unit'&&!current.current.players.some(player=>player.board.some(unit=>unit.id===cue.sourceId));
   fx.animate(wrapper,attackKeyframes(dx,dy,died),ATTACK_TIMING.duration,{easing:'linear'});
   const original=find(cue.sourceId);let landedHome=()=>{};
   if(original){const previous=original.style.visibility;original.style.visibility='hidden';original.dataset.inFlight='true';landedHome=()=>{original.style.visibility=previous;delete original.dataset.inFlight};ctx.addCleanup(landedHome)}
   const target=find(cue.targetId);if(target){target.dataset.attackTarget='true';ctx.addCleanup(()=>{delete target.dataset.attackTarget})}
   const actorName=cue.source?.name||clone.querySelector('.unit-name')?.textContent||'角色';
   const targetName=cue.target?.name||target?.querySelector('.unit-name')?.textContent||current.current.players.find(p=>p.id===cue.targetId)?.name||'目标';
   const caption=fx.append(Object.assign(document.createElement('div'),{className:'battle-attack-caption',textContent:`${actorName} → ${targetName}`}));
   Object.assign(caption.style,{left:(from.point.x+to.point.x)/2+'px',top:Math.max(40,Math.min(from.rect.top,to.point.y-60)-26)+'px'});
   fx.animate(caption,[{opacity:0,transform:'translate(-50%,-50%) scale(.9)'},{opacity:1,transform:'translate(-50%,-50%) scale(1)',offset:.14},{opacity:1,offset:.6},{opacity:0,transform:'translate(-50%,-70%)'}],ATTACK_TIMING.duration);
   // The attacker's own wound splats beside it, on its side of the collision, not on top of the target's.
   if(cue.sourceId){const length=Math.hypot(dx,dy)||1,back=Math.max(0,length-110);displaced.set(cue.sourceId,{x:from.point.x+dx/length*back,y:from.point.y+dy/length*back-38})}
   fx.later(()=>{
    landed.current.add(cue.id);
    const own=(change:BattleChange)=>change.targetId===cue.sourceId;
    const everything=cue.changes??[],theirs=pendingChanges(cue,change=>!own(change));
    impact(cue,everything,from.point);reveal(theirs);
    if(cue.sourceId)displaced.delete(cue.sourceId);
    // The attacker's number is rewritten once it is standing in its own slot again.
    if(!died)fx.later(()=>reveal(pendingChanges(cue,own),true),ATTACK_REWRITE_AT-ATTACK_TIMING.contact);
    else reveal(pendingChanges(cue,own));
   },ATTACK_TIMING.contact);
   if(died&&cue.sourceId){
    const length=Math.hypot(dx,dy)||1,reach=Math.max(0,length-46),hx=dx/length*reach,hy=dy/length*reach;
    fallen.set(cue.sourceId,{point:{x:from.point.x+hx,y:from.point.y+hy},rect:{...from.rect,left:from.rect.left+hx,top:from.rect.top+hy},clone:from.clone});
    fx.later(()=>wrapper.remove(),ATTACK_TIMING.contact+ATTACK_TIMING.hold);
   }else fx.later(()=>{wrapper.remove();landedHome()},ATTACK_TIMING.duration);
  }
  function departure(cue:BattleCue,at:number){
   const exit=cue.kind==='bounce'?560:ATTACK_TIMING.departure;
   fx.later(()=>{
    const id=departureId(cue),live=find(id),base:Anchor=fallen.get(id??'')??(live?rectOf(live):locate(id,cue.kind==='bounce'?cue.source:cue.target??cue.source));
    const copy=()=>{const node=live?clonePaperRig(live):base.clone?clonePaperRig(base.clone):undefined;node?.querySelectorAll('.unit-info,.unit-status').forEach(item=>item.remove());return node};
    const source=cue.kind==='bounce'?copy():undefined;
    if(live){live.style.visibility='hidden';ctx.addCleanup(()=>{live.style.visibility=''})}
    if(cue.kind==='bounce'){
     const owner=cue.source?.playerId??cue.target?.playerId??cue.playerId,destination=locate(`${owner}:hand`,{kind:'hand',id:`${owner}:hand`,playerId:owner??current.current.selfId}).point;
     const ghost=box('battle-fx-ghost battle-fit',base);if(id)ghost.dataset.departureId=id;if(source)ghost.append(source);fx.later(()=>ghost.remove(),exit);
     if(ctx.reduced)fx.animate(ghost,[{opacity:1},{opacity:0}],exit);
     else{
      fx.animate(ghost,[{opacity:1,transform:'translate(0,0) rotateY(0deg) scale(1)'},{opacity:1,transform:'translate(0,-26px) rotateY(88deg) scale(1.06)',offset:.3,easing:'cubic-bezier(.5,0,.8,.4)'},{opacity:.35,transform:`translate(${destination.x-base.point.x}px,${destination.y-base.point.y}px) rotateY(180deg) scale(.42)`}],exit);
      fx.later(()=>ghost.replaceChildren(Object.assign(document.createElement('div'),{className:'battle-fx-card-back'})),exit*.3);
     }
    }else{
     // The torn halves leave with the slot they stood in, even if the group lasts longer for a pencil rewrite.
     const ghost=tear(fx,base.rect,copy,exit,id);fx.later(()=>ghost.remove(),exit);
    }
    fx.later(()=>{if(id)callbacks.current.onDepartureComplete?.(id)},exit);
   },at);
   fx.later(()=>land(cue),at+140);
  }
  function deploy(cue:BattleCue,at:number){
   fx.later(()=>{
    const target=find(cue.targetId);
    if(!target){land(cue);return}
    delete target.dataset.awaitEntrance;
    const slot=rectOf(target),main=target.querySelector<HTMLElement>('.unit-main')??target;
    if(ctx.reduced){onTable(main,[{opacity:0},{opacity:1}],200);land(cue);return}
    // An own Offer slides out of the drawer before its stand-up drops onto the table.
    const unit=current.current.players.flatMap(player=>player.board).find(item=>item.id===cue.targetId);
    const origin=unit?.offerId&&cue.playerId===current.current.selfId?cache.current.get(unit.offerId):undefined;
    if(origin?.clone&&!find(unit!.offerId)){
     const card=box('fx-card-flight',origin);card.append(clonePaperRig(origin.clone));
     fx.animate(card,[{opacity:1,transform:'translate(0,0) scale(1) rotate(0deg)'},{opacity:1,transform:`translate(${slot.point.x-origin.point.x}px,${slot.point.y-origin.point.y-70}px) scale(.62) rotate(-5deg)`,offset:.8,easing:'cubic-bezier(.4,0,.2,1)'},{opacity:0,transform:`translate(${slot.point.x-origin.point.x}px,${slot.point.y-origin.point.y-66}px) scale(.5)`}],DEPLOY_TIMING.land*.8);
    }
    onTable(main,[
     {opacity:0,transform:'translateY(-78px) scale(1.34)'},
     {opacity:1,transform:'translateY(-70px) scale(1.3)',offset:.3,easing:'cubic-bezier(.55,0,.95,.45)'},
     {opacity:1,transform:'translateY(6px) scale(1.08,.88)',offset:DEPLOY_TIMING.land/DEPLOY_TIMING.duration,easing:'cubic-bezier(.2,1.5,.4,1)'},
     {opacity:1,transform:'translateY(-3px) scale(.98,1.03)',offset:.84},
     {opacity:1,transform:'none'},
    ],DEPLOY_TIMING.duration);
    fx.later(()=>{const foot={x:slot.point.x,y:slot.rect.top+slot.rect.height*.84};ring(fx,foot,'plain',1.2);confetti(fx,foot,'plain',10,.85);shake(fx,table(),2.2);land(cue)},DEPLOY_TIMING.land);
   },at);
  }
  function takeLeftHand(definitionId?:string){const index=leftHand.current.findIndex(item=>item.definitionId===definitionId);return index<0?undefined:leftHand.current.splice(index,1)[0]}
  function card(cue:BattleCue){
   const mine=cue.playerId===selfId,definition=cue.cardId?cardById[cue.cardId]:undefined;
   if(!mine&&cue.cardId&&definition&&!ctx.reduced){
    // Hearthstone-style reveal: the opponent's card flips up beside the table before it resolves.
    const from=locate(`${cue.playerId}:hand`,{kind:'hand',id:`${cue.playerId}:hand`,playerId:cue.playerId!}).point;
    const to=cue.targetId?locate(cue.targetId,cue.target).point:null,arena=table()?.getBoundingClientRect();
    const rest={x:Math.max(130,(arena?.left??0)+Math.min(230,(arena?.width??innerWidth)*.16)),y:(arena?.top??0)+(arena?.height??innerHeight)*.5};
    setShowcase({key:cue.id,cardId:cue.cardId,ms:Math.round(CARD_TIMING.reveal*scale),from,rest,to});
    ctx.addCleanup(()=>{if(alive.current)setShowcase(value=>value?.key===cue.id?null:value)});
    fx.later(()=>{if(to){ring(fx,to,'skill',1.1);sparkles(fx,to,'skill',8)}land(cue)},CARD_TIMING.revealImpact);
    return;
   }
   const played=mine?takeLeftHand(cue.cardId):undefined;
   if(played?.anchor.clone&&!cue.targetId&&!ctx.reduced){
    const ghost=box('fx-card-flight',played.anchor);ghost.append(clonePaperRig(played.anchor.clone));
    const newcomer=definition?.type==='support'?current.current.players.find(p=>p.id===selfId)?.board.map(unit=>find(unit.id)).find(node=>node?.dataset.awaitEntrance):undefined;
    if(newcomer){
     const slot=rectOf(newcomer).point;
     fx.animate(ghost,[{opacity:1,transform:'translate(0,0) scale(1) rotate(0deg)'},{opacity:1,transform:`translate(${slot.x-played.anchor.point.x}px,${slot.y-played.anchor.point.y-70}px) scale(.66) rotate(-4deg)`,offset:.85,easing:'cubic-bezier(.4,0,.2,1)'},{opacity:0,transform:`translate(${slot.x-played.anchor.point.x}px,${slot.y-played.anchor.point.y-70}px) scale(.6)`}],CARD_TIMING.own);
    }else{
     fx.animate(ghost,[{opacity:1,transform:'translate(0,0) scale(1)'},{opacity:1,transform:'translate(0,-110px) scale(1.16)',offset:.45,easing:'cubic-bezier(.2,.8,.3,1)'},{opacity:0,transform:'translate(0,-150px) scale(1.3)',filter:'brightness(1.9)'}],CARD_TIMING.own);
     fx.later(()=>sparkles(fx,{x:played.anchor.point.x,y:played.anchor.point.y-130},'buff',10),CARD_TIMING.ownImpact);
    }
   }
   fx.later(()=>land(cue),ctx.reduced?0:CARD_TIMING.ownImpact);
  }
  function skill(cue:BattleCue){
   const from=locate(cue.sourceId,cue.source).point,to=locate(cue.targetId??cue.playerId,cue.target).point;
   onTable(find(cue.sourceId),[{filter:'brightness(1)',scale:'1'},{filter:'brightness(1.45) drop-shadow(0 0 14px #F2BC45)',scale:'1.14',offset:.3,easing:'cubic-bezier(.3,1.5,.5,1)'},{filter:'brightness(1)',scale:'1'}],560);
   ring(fx,from,'skill',1.25);sparkles(fx,from,'skill',10);
   stamp(fx,{x:to.x,y:to.y-44},cue.kind==='secondary_skill'?'进修技能':'学历技能','skill',Math.min(group.duration,900));
   if(cue.kind==='secondary_skill'||cue.effectId==='jlu_ultimate')rosette(fx,{x:(from.x+to.x)/2,y:(from.y+to.y)/2},cue.kind==='secondary_skill'?'进修':'撑腰','buff',Math.min(group.duration,980));
   fx.later(()=>{ring(fx,to,'skill');land(cue,from)},ctx.reduced?0:SKILL_TIMING.impact);
  }
  function retort(cue:BattleCue){
   const to=locate(cue.targetId??cue.playerId,cue.target).point;
   const note=fx.append(Object.assign(document.createElement('div'),{className:'battle-fx-retort paper-contract',textContent:'合同生效'}));Object.assign(note.style,{left:to.x+'px',top:to.y+'px'});
   fx.animate(note,ctx.reduced?[{opacity:0},{opacity:1,offset:.3},{opacity:0}]:[{opacity:0,transform:'translate(-50%,-50%) rotateY(-80deg) scale(.8)'},{opacity:1,transform:'translate(-50%,-50%) rotateY(0deg) scale(1.06)',offset:.3,easing:'cubic-bezier(.3,1.4,.5,1)'},{opacity:1,transform:'translate(-50%,-50%) scale(1)',offset:.75},{opacity:0,transform:'translate(-50%,-62%) scale(.96)'}],640);
   fx.later(()=>{stamp(fx,{x:to.x+46,y:to.y-30},'反话!','retort',520);land(cue)},ctx.reduced?0:300);
  }
  function draw(cue:BattleCue,at:number){
   if(ctx.reduced){fx.later(()=>{landed.current.add(cue.id);revealDrawnCard()},at);return}
   const from=locate(cue.sourceId,cue.source).point,to=locate(cue.targetId,cue.target).point,mine=cue.playerId===selfId;
   fx.later(()=>{
    const back=fx.append(Object.assign(document.createElement('div'),{className:'paper-fx-draw'}));Object.assign(back.style,{left:from.x+'px',top:from.y+'px'});
    fx.animate(back,[{opacity:0,transform:'translate(-50%,-50%) scale(.7) rotate(-12deg)'},{opacity:1,transform:`translate(calc(-50% + ${(to.x-from.x)*.45}px),calc(-50% + ${(to.y-from.y)*.45-40}px)) scale(1.1) rotate(4deg)`,offset:.45},{opacity:0,transform:`translate(calc(-50% + ${to.x-from.x}px),calc(-50% + ${to.y-from.y}px)) scale(.9) rotate(0deg)`}],330);
    fx.later(()=>{landed.current.add(cue.id);const card=mine?revealDrawnCard():null;if(card)onTable(card,[{opacity:0,transform:'translateY(36px) scale(.8)'},{opacity:1,transform:'translateY(-8px) scale(1.04)',offset:.6},{opacity:1,transform:'none'}],260)},300);
   },at);
  }
  function status(cue:BattleCue,at:number){
   const to=locate(cue.targetId??cue.playerId,cue.target).point;
   const note=cue.effectId==='notice'?'优化通知':cue.effectId==='management'?'转管理':cue.effectId==='age'?cue.label??'年龄 +1':cue.effectId==='protection'?'保障条款':cue.effectId==='freeze'?'暂停开怼':cue.kind==='topic'?'换话题':cue.label??'状态更新';
   fx.later(()=>{
    stamp(fx,{x:to.x,y:to.y-30},note.length>12?note.slice(0,12)+'…':note,cue.effectId==='notice'||cue.effectId==='freeze'?'damage':cue.kind==='topic'?'buff':'plain',760);
    if(cue.kind==='topic')onTable(arenaRef.current?.querySelector('.topic-bar'),[{transform:'rotateX(0deg)'},{transform:'rotateX(88deg)',offset:.45,easing:'ease-in'},{transform:'rotateX(0deg)',easing:'cubic-bezier(.3,1.5,.5,1)'}],460);
    land(cue);
   },at);
  }

  if(options.final){
   const result=group.cues.find(cue=>cue.kind==='result')!,last=[...group.cues].reverse().find(cue=>cue.kind==='attack');
   const blow=last&&!ctx.reduced?ATTACK_TIMING.contact:0;
   if(last)attack(last);
   for(const cue of group.cues)if(cue!==last&&cue.kind!=='result')fx.later(()=>land(cue),blow);
   const start=()=>{if(!layerRef.current||!arenaRef.current)return;const motion=playResultMotion({layer:layerRef.current,arena:arenaRef.current,view:current.current,cue:result,reduced:ctx.reduced,later:(fn,ms)=>ctx.later(fn,ms),animate:(node,frames,options)=>ctx.animate(node,frames,options)!});ctx.addCleanup(()=>motion.dispose())};
   if(last&&!ctx.reduced)ctx.later(start,ATTACK_TIMING.duration);else start();
   return;
  }
  group.cues.forEach((cue,index)=>{
   const at=ctx.reduced?0:cueOffset(group,index);
   switch(cue.kind){
    case 'attack':attack(cue);break;
    case 'retire':case 'bounce':departure(cue,at);break;
    case 'deploy':deploy(cue,at);break;
    case 'card':card(cue);break;
    case 'primary_skill':case 'secondary_skill':skill(cue);break;
    case 'retort':retort(cue);break;
    case 'draw':draw(cue,at);break;
    case 'status':case 'topic':status(cue,at);break;
    default:fx.later(()=>land(cue,cue.sourceId?locate(cue.sourceId,cue.source).point:undefined),at);
   }
  });
 }
 function enqueue(group:MotionGroup,final=false){
  const actors=new Set(groupActors(group));for(const cue of group.cues)if(cue.kind==='retire'||cue.kind==='bounce')if(cue.target?.playerId||cue.source?.playerId)actors.add(cue.target?.playerId??cue.source!.playerId);
  pending.current.set(group.id,{group,actors,blocking:final||group.mine===false});announce();
  motionDirector.play({cue:final?'resultCurtain':motionKey(group.cues[0]),channel:final?'attention':'battle',id:group.id,scope,confirmed:true,durationMs:group.duration,actorIds:[...actors],run:ctx=>{if(alive.current)setKind(final?'result':group.cues[0].kind);present(group,ctx,{final})},onSettled:(reason:MotionEndReason)=>{
   settle(group);pending.current.delete(group.id);if(final){terminal.current=false;callbacks.current.onResultPending?.(false)}
   if(reason==='catch-up'&&alive.current)setCatchUps(value=>value+1);announce();
  }});
 }
 /** "Your turn" waits behind the opponent's last blow instead of cutting it off. */
 function turnBanner(version:number){
  const id=`turn:${version}`,marker:MotionGroup={id,cues:[],duration:TURN_BANNER_MS,mine:false};
  pending.current.set(id,{group:marker,actors:new Set(),blocking:true});announce();
  motionDirector.play({cue:'turnBanner',channel:'battle',id,scope,confirmed:true,durationMs:TURN_BANNER_MS,run:ctx=>{
   if(alive.current)setKind('turn');const fx=makeFx(ctx,ctx.durationMs/TURN_BANNER_MS);
   banner(fx,'轮到你了','让这份 Offer 说话',TURN_BANNER_MS,true);
   emitSounds([{file:'card_pick',delay:0,duck:.6},{file:'deploy',delay:180}],ctx.durationMs/TURN_BANNER_MS);
  },onSettled:()=>{pending.current.delete(id);announce()}});
 }
 /** Remember own hand cards that just left the hand, so their flight starts where they were. */
 function noteLeftHand(previous:MatchView,next:MatchView){
  if(previous.matchId!==next.matchId){leftHand.current=[];return}
  const before=previous.players.find(p=>p.id===previous.selfId)?.hand??[],after=new Set(next.players.find(p=>p.id===next.selfId)?.hand.map(card=>card.id)??[]);
  for(const card of before)if(!after.has(card.id)){const anchor=cache.current.get(card.id);if(anchor)leftHand.current.push({id:card.id,definitionId:card.definitionId,anchor})}
  leftHand.current=leftHand.current.slice(-6);
 }
 /** New stand-ups and freshly drawn cards stay hidden until their own entrance plays. */
 function stageEntrances(cues:BattleCue[],previous:MatchView,next:MatchView){
  if(effectiveReduced)return;
  for(const cue of cues)if(cue.kind==='deploy'&&cue.targetId){const node=find(cue.targetId);if(node)node.dataset.awaitEntrance='true'}
  const draws=cues.filter(cue=>cue.kind==='draw'&&cue.playerId===next.selfId).length;
  if(!draws||previous.matchId!==next.matchId)return;
  const known=new Set(previous.players.find(p=>p.id===previous.selfId)?.hand.map(card=>card.id)??[]);
  const fresh=(next.players.find(p=>p.id===next.selfId)?.hand??[]).filter(card=>!known.has(card.id)).slice(-draws);
  for(const card of fresh){const node=[...(arenaRef.current?.querySelectorAll<HTMLElement>('.hand-card-wrapper[data-hand-id]')??[])].find(el=>el.dataset.handId===card.id);if(node)node.dataset.awaitEntrance='true'}
 }
 useLayoutEffect(()=>{
  const previous=previousView.current;previousView.current=view;
  const batch=adapter.current.consume(view,effectiveReduced,prefs.hidden);
  const finished=view.phase==='finished'&&lastPhase.current!=='finished';lastPhase.current=view.phase;
  if(batch.hidden){catchUp('hidden');capture();return}
  noteLeftHand(previous,view);
  const fresh=batch.fresh;
  if(finished){
   motionDirector.catchUp(`board:${view.matchId}`);
   const result=fresh.find(cue=>cue.kind==='result');
   if(result){
    catchUp('result');ledger.stage(fresh);terminal.current=true;callbacks.current.onResultPending?.(true);
    enqueue({id:result.id,cues:fresh,duration:(fresh.some(c=>c.kind==='attack')&&!effectiveReduced?ATTACK_TIMING.duration:0)+resultMotionDuration(result,effectiveReduced)},true);
   }else callbacks.current.onResultPending?.(false);
   capture();return;
  }
  ledger.stage(fresh);stageEntrances(fresh,previous,view);capture();
  let split=-1;
  if(batch.newOwnTurn)for(let i=fresh.length-1;i>=0;i--)if(fresh[i].kind==='turn'&&fresh[i].targetId===view.selfId){split=i;break}
  const before=split>=0?fresh.slice(0,split):fresh,after=split>=0?fresh.slice(split+1):[];
  for(const group of groupBattleCues(before,effectiveReduced,view.selfId))enqueue(group);
  if(batch.newOwnTurn)turnBanner(view.version);
  for(const group of groupBattleCues(after,effectiveReduced,view.selfId))enqueue(group);
 },[view.matchId,view.version,view.visualCues]);
 useEffect(()=>{
  alive.current=true;capture();const unsubscribe=motionDirector.subscribe(()=>{if(alive.current)setDiagnostics(motionDirector.diagnostics())});
  const resize=()=>{catchUp('resize');capture()};window.addEventListener('resize',resize);
  return()=>{alive.current=false;motionDirector.cancelScope(scope,'disposed');pending.current.clear();cache.current.clear();ledger.release();revealEntrances();setBattlePresentationBusy(false);window.removeEventListener('resize',resize);unsubscribe();callbacks.current.onBusyChange?.(false);callbacks.current.onInputLockChange?.(false);callbacks.current.onResultPending?.(false);if(controlRef)controlRef.current=null};
 },[scope]);
 useEffect(()=>setEffectiveReduced(prefs.reduced),[prefs.reduced]);
 useEffect(()=>{if(prefs.hidden)catchUp('hidden');else adapter.current.sync(current.current)},[prefs.hidden]);
 // Legacy integrations changed data-reduced directly. Keep that explicit action compatible.
 useEffect(()=>{const observer=new MutationObserver(()=>{const requested=document.documentElement.dataset.reduced==='true';setEffectiveReduced(requested);if(requested!==getMotionPreferences().reduced)motionDirector.setPreferences({...getMotionPreferences(),reduced:requested})});observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-reduced']});return()=>observer.disconnect()},[]);
 const showcaseStyle=showcase?{'--showcase-ms':`${showcase.ms}ms`,'--from-x':`${showcase.from.x}px`,'--from-y':`${showcase.from.y}px`,'--rest-x':`${showcase.rest.x}px`,'--rest-y':`${showcase.rest.y}px`,'--to-x':`${(showcase.to??showcase.rest).x}px`,'--to-y':`${(showcase.to??{y:showcase.rest.y-40}).y}px`} as CSSProperties:undefined;
 return createPortal(<>
  <div ref={layerRef} className="battle-effects" data-busy={busy} data-kind={kind||undefined} data-reduced-motion={effectiveReduced} data-phase={view.phase} data-version={view.version} data-owned-jobs={pending.current.size} data-director-active={diagnostics.active} data-director-timers={diagnostics.timers} data-director-errors={diagnostics.errors} data-catch-ups={catchUps} aria-hidden="true"/>
  {showcase&&<div key={showcase.key} className={`fx-showcase ${showcase.to?'has-target':''}`} style={showcaseStyle} aria-hidden="true" inert><div className="fx-showcase-card"><div className="fx-showcase-front"><CommonCard id={showcase.cardId}/></div><div className="fx-showcase-back"/></div></div>}
  {catchUps>0&&<span className="motion-status" role="status">演出已对齐当前牌桌，完整事件保留在战斗记录中。</span>}
 </>,document.body);
}
