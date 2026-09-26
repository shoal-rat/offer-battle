import {publicUrl} from '../deployment';
import {useEffect,useLayoutEffect,useRef,useState,type RefObject} from 'react';
import {createPortal} from 'react-dom';
import type {BattleAnchor,BattleChange,BattleCue,MatchView} from '../game/types';
import {boundedQueue,CueCursor,cueOffset,flightPoint,groupBattleCues,type MotionGroup,type Point} from './battle-motion';
import '../styles/battle-effects.css';
import {playResultMotion,resultMotionDuration} from './result-motion';
import '../styles/result-motion.css';

interface Props{view:MatchView;arenaRef:RefObject<HTMLElement|null>;onBusyChange?:(busy:boolean)=>void;onDepartureComplete?:(id:string)=>void}
interface Anchor{point:Point;rect:{left:number;top:number;width:number;height:number};clone?:HTMLElement}
type BurstKind='impact'|'heal'|'ring'|'deploy'|'paper'|'beam'|'retire';
interface Burst{kind:BurstKind;start:number;duration:number;point:Point;from?:Point;color:string;seed:number;radius?:number}
const gold='#f4d38b',teal='#83ead0';
const ease=(t:number)=>1-Math.pow(1-t,3);
const rand=(seed:number)=>{let x=Math.sin(seed*127.1+311.7)*43758.5453;return x-Math.floor(x)};

/** Native, ordered, decorative battle compositor. Never calculates game outcomes. */
export function BattleEffects({view,arenaRef,onBusyChange,onDepartureComplete}:Props){
 const layerRef=useRef<HTMLDivElement>(null),canvasRef=useRef<HTMLCanvasElement>(null);
 const cache=useRef(new Map<string,Anchor>()),cursor=useRef(new CueCursor());
 const queue=useRef<MotionGroup[]>([]),running=useRef(false),alive=useRef(true);
 const timers=useRef(new Set<ReturnType<typeof setTimeout>>()),animations=useRef(new Set<Animation>());
 const videos=useRef(new Set<HTMLVideoElement>());const particles=useRef<Burst[]>([]),currentView=useRef(view),callback=useRef(onBusyChange);
 const [busy,setBusy]=useState(false),[kind,setKind]=useState(''),[reduced,setReduced]=useState(false);
 const reducedRef=useRef(false),pumpRef=useRef<()=>void>(()=>{});
 const departureCallback=useRef(onDepartureComplete);
 const resultMotion=useRef<ReturnType<typeof playResultMotion>|null>(null);
 currentView.current=view;callback.current=onBusyChange;departureCallback.current=onDepartureComplete;
 function later(fn:()=>void,ms:number){const t=setTimeout(()=>{timers.current.delete(t);if(alive.current)fn()},ms);timers.current.add(t);return t}
 function animate(node:HTMLElement,frames:Keyframe[],options:KeyframeAnimationOptions){
  const anim=node.animate(frames,options);animations.current.add(anim);
  anim.finished.catch(()=>{}).finally(()=>animations.current.delete(anim));return anim;
 }
 function updateBusy(value:boolean){running.current=value;setBusy(value);callback.current?.(value)}
 function find(id?:string):HTMLElement|undefined{
  if(!id)return;return [...(arenaRef.current?.querySelectorAll<HTMLElement>('[data-battle-id]')??[])].find(el=>el.dataset.battleId===id);
 }
 function capture(){
  for(const el of arenaRef.current?.querySelectorAll<HTMLElement>('[data-battle-id]')??[]){
   const r=el.getBoundingClientRect();if(!r.width||!r.height)continue;
   const rect={left:r.left,top:r.top,width:r.width,height:r.height};
   const clone=el.cloneNode(true) as HTMLElement;
   clone.removeAttribute('id');clone.removeAttribute('data-battle-id');
   clone.querySelectorAll('[id],[data-battle-id]').forEach(n=>{n.removeAttribute('id');n.removeAttribute('data-battle-id')});
   cache.current.set(el.dataset.battleId!,{point:{x:r.left+r.width/2,y:r.top+r.height/2},rect,clone});
  }
  // A match has few board identities. Preserve recent dead units without growing forever.
  if(cache.current.size>90)for(const key of [...cache.current.keys()].slice(0,cache.current.size-90))cache.current.delete(key);
 }
 function locate(id?:string,anchor?:BattleAnchor):Anchor{
  const actual=find(id);if(actual){const r=actual.getBoundingClientRect();return {point:{x:r.left+r.width/2,y:r.top+r.height/2},rect:{left:r.left,top:r.top,width:r.width,height:r.height},clone:cache.current.get(id!)?.clone}}
  const stored=id?cache.current.get(id):undefined;if(stored)return stored;
  const arena=arenaRef.current?.getBoundingClientRect();
  const rows=[...(arenaRef.current?.querySelectorAll<HTMLElement>('[data-battle-row]')??[])];
  const row=rows.find(el=>el.dataset.battleRow===anchor?.playerId)?.getBoundingClientRect();
  let point:Point={x:(arena?.left??0)+(arena?.width??innerWidth)/2,y:(arena?.top??0)+(arena?.height??innerHeight)*.46};
  if(row)point={x:row.left+row.width*(.18+.21*Math.min(3,anchor?.slot??1)),y:row.top+row.height/2};
  else if(anchor?.playerId){const hero=find(anchor.playerId);if(hero){const r=hero.getBoundingClientRect();point={x:r.left+r.width/2,y:r.top+r.height/2}}}
  return {point,rect:{left:point.x-48,top:point.y-60,width:96,height:120}};
 }
 function burst(kind:BurstKind,point:Point,delay=0,color=gold,radius=90,from?:Point){
  particles.current.push({kind,point,start:performance.now()+delay,duration:reducedRef.current?220:kind==='beam'?420:760,color,seed:performance.now()%999,radius,from});
 }
 function text(point:Point,content:string,tone='damage',delay=0,small=false){
  later(()=>{
   const el=document.createElement('div');el.className='battle-fx-number '+tone+(small?' small':'');el.textContent=content;
   el.style.left=point.x+'px';el.style.top=point.y+'px';layerRef.current?.append(el);
   const duration=reducedRef.current?240:850;
   animate(el,reducedRef.current?[{opacity:0},{opacity:1,offset:.2},{opacity:0}]:[{opacity:0,transform:'translate(-50%,0) scale(.55)'},{opacity:1,transform:'translate(-50%,-14px) scale(1.22)',offset:.18},{opacity:1,transform:'translate(-50%,-24px) scale(1)',offset:.55},{opacity:0,transform:'translate(-50%,-64px) scale(.88)'}],{duration,easing:'ease-out',fill:'forwards'});
   later(()=>el.remove(),duration+20);
  },delay);
 }
 function numbers(changes:BattleChange[]|undefined,delay:number,cue:BattleCue){
  const grouped=new Map<string,{damage:number;heal:number;attack:number;health:number}>();
  for(const c of changes??[]){if(!c.amount)continue;const row=grouped.get(c.targetId)??{damage:0,heal:0,attack:0,health:0};
   if(c.stat==='mind'||c.stat==='health'){if(c.amount<0)row.damage+=c.amount;else row.heal+=c.amount}
   if(c.stat==='attack')row.attack+=c.amount;if(c.stat==='maxHealth')row.health+=c.amount;grouped.set(c.targetId,row);
  }
  for(const [id,n] of grouped){const p=locate(id,id===cue.sourceId?cue.source:cue.target).point;
   if(n.damage)text(p,String(n.damage),'damage',delay);
   if(n.heal&&!n.health)text(p,'+'+n.heal,'heal',delay);
   if(n.attack||n.health)text({x:p.x,y:p.y-12},(n.attack>=0?'+':'')+n.attack+' / '+(n.health>=0?'+':'')+n.health,'buff',delay,true);
  }
 }
 function hit(id:string|undefined,p:Point,delay:number,soft=false){
  later(()=>{burst(soft?'heal':'impact',p,0,soft?teal:gold,soft?80:100);
   const target=find(id);if(target&&!reducedRef.current)animate(target,soft?[{filter:'brightness(1)'},{filter:'brightness(1.8) saturate(1.3)',offset:.3},{filter:'brightness(1)'}]:[{transform:'translate(0,0)',filter:'brightness(1)'},{transform:'translate(-7px,2px) rotate(-4deg)',filter:'brightness(2.4)',offset:.14},{transform:'translate(6px,-2px) rotate(3deg)',filter:'brightness(1.4)',offset:.35},{transform:'translate(-3px,1px)',offset:.6},{transform:'translate(0,0)',filter:'brightness(1)'}],{duration:soft?550:360,easing:'ease-out'});
   if(!soft&&!reducedRef.current&&arenaRef.current)animate(arenaRef.current,[{transform:'translate(0,0)'},{transform:'translate(3px,-2px)',offset:.2},{transform:'translate(-2px,2px)',offset:.45},{transform:'translate(0,0)'}],{duration:180});
  },delay);
 }
 function flight(cue:BattleCue){
  const from=locate(cue.sourceId,cue.source),to=locate(cue.targetId,cue.target);
  if(reducedRef.current){burst('ring',to.point,0,gold,65);numbers(cue.changes,0,cue);return}
  const wrapper=document.createElement('div');wrapper.className='battle-fx-flight battle-fit'+(arenaRef.current?.classList.contains('in-tutorial')?' in-tutorial':'');wrapper.dataset.kind='attack';
  const rect=from.rect;Object.assign(wrapper.style,{left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px'});
  if(from.clone){const clone=from.clone.cloneNode(true) as HTMLElement;clone.classList.remove('selected','targetable','ready');clone.style.pointerEvents='none';wrapper.append(clone)}
  else{const back=document.createElement('div');back.className='battle-fx-card-back';wrapper.append(back)}
  layerRef.current?.append(wrapper);
  const dx=to.point.x-from.point.x,dy=to.point.y-from.point.y;const angle=Math.max(-12,Math.min(12,dx/20));const mid=flightPoint(from.point,to.point,.5);
  animate(wrapper,[{transform:'translate(0,0) scale(1)'},{transform:'translate('+(-dx*.06)+'px,'+(-dy*.06)+'px) scale(1.11)',offset:.13},{transform:'translate('+(mid.x-from.point.x)+'px,'+(mid.y-from.point.y)+'px) scale(1.12) rotate('+angle+'deg)',offset:.31},{transform:'translate('+dx+'px,'+dy+'px) scale(.94) rotate('+angle/2+'deg)',offset:.45},{transform:'translate('+(dx*.9)+'px,'+(dy*.9)+'px) scale(1.04)',offset:.6},{transform:'translate(0,0) scale(1)',offset:1}],{duration:760,easing:'cubic-bezier(.3,.05,.35,1)',fill:'forwards'});
  const original=find(cue.sourceId);if(original)animate(original,[{opacity:.3},{opacity:.3,offset:.8},{opacity:1}],{duration:760});
  burst('beam',to.point,100,gold,55,from.point);hit(cue.targetId,to.point,342);numbers(cue.changes,345,cue);
  if(cue.changes?.some(c=>c.targetId===cue.sourceId&&c.amount<0))hit(cue.sourceId,from.point,600);
  later(()=>wrapper.remove(),780);
 }
 function video(p:Point){
  if(reducedRef.current)return;
  const el=document.createElement('video');el.className='battle-fx-video';el.src=publicUrl('/assets/animations/alumni-burst.mp4');el.muted=true;el.playsInline=true;el.playbackRate=3.4;
  const width=Math.min(620,innerWidth*.9),height=width*548/960;const center={x:Math.max(width/2+10,Math.min(innerWidth-width/2-10,p.x)),y:Math.max(height/2+10,Math.min(innerHeight-height/2-10,p.y))};Object.assign(el.style,{left:center.x+'px',top:center.y+'px',width:width+'px'});const remove=()=>{el.pause();el.remove();videos.current.delete(el)};el.onerror=remove;videos.current.add(el);document.body.append(el);
  void el.play().catch(remove);later(remove,1580);
 }
 function playCue(cue:BattleCue,offset=0){
  if(cue.kind==='result'){
   if(layerRef.current&&arenaRef.current){resultMotion.current?.dispose();resultMotion.current=playResultMotion({layer:layerRef.current,arena:arenaRef.current,view:currentView.current,cue,reduced:reducedRef.current,later,animate})}
   return;
  }
  const from=locate(cue.sourceId,cue.source),to=locate(cue.targetId??cue.playerId,cue.target);
  const delay=reducedRef.current?0:offset;
  if(cue.kind==='attack'){later(()=>flight(cue),delay);return}
  if(cue.kind==='primary_skill'||cue.kind==='secondary_skill'){
   const major=cue.kind==='secondary_skill'||cue.effectId==='jlu_ultimate';
   burst('ring',from.point,delay,major?gold:teal,major?155:110);
   if(major)later(()=>video({x:(from.point.x+to.point.x)/2,y:(from.point.y+to.point.y)/2}),delay);
   text({x:from.point.x,y:from.point.y-45},cue.label??(major?'母校认证':'先手发言'),'skill',delay,true);
   if(!reducedRef.current)burst('beam',to.point,delay+200,major?gold:teal,60,from.point);
   burst('ring',to.point,delay+400,major?gold:teal,120);numbers(cue.changes,delay+430,cue);
   if(cue.effectId==='jlu_ultimate'){
    text({x:to.point.x,y:to.point.y-70},'全校撑腰','skill',delay+430,true);
    for(let i=0;i<6;i++)burst('paper',{x:from.point.x+(i-2.5)*32,y:from.point.y},delay+300+i*30,gold,130);
   }
   return;
  }
  if(cue.kind==='deploy'){
   later(()=>{const el=find(cue.targetId??cue.sourceId);if(el&&!reducedRef.current)animate(el,[{transform:'translateY(-90px) scale(1.18) rotate(-7deg)',opacity:0},{transform:'translateY(4px) scale(.93)',opacity:1,offset:.58},{transform:'translateY(-6px) scale(1.03)',offset:.8},{transform:'translateY(0) scale(1)'}],{duration:550,easing:'cubic-bezier(.18,.7,.3,1)'})},delay);
   burst('deploy',{x:to.point.x,y:to.point.y+to.rect.height*.36},delay+310,gold,100);return;
  }
  if(cue.kind==='damage'){hit(cue.targetId,to.point,delay);numbers(cue.changes,delay,cue);if(!cue.changes?.length&&cue.amount)text(to.point,'-'+Math.abs(cue.amount),'damage',delay);return}
  if(cue.kind==='heal'||cue.kind==='buff'){hit(cue.targetId,to.point,delay,true);numbers(cue.changes,delay+80,cue);return}
  if(cue.kind==='retire'||cue.kind==='bounce'){
   later(()=>{
    const id=cue.kind==='bounce'?cue.sourceId:cue.targetId??cue.sourceId;
    const anchor=locate(id,cue.kind==='bounce'?cue.source:cue.target??cue.source);
    // Keep the real card's slot occupied, but show just one fading copy.
    const original=find(id);if(original?.dataset.departing==='true')original.style.visibility='hidden';
    const duration=reducedRef.current?200:480;
    if(anchor.clone&&!reducedRef.current){
     const el=document.createElement('div');el.className='battle-fx-ghost battle-fit'+(arenaRef.current?.classList.contains('in-tutorial')?' in-tutorial':'');el.dataset.departureId=id;
     Object.assign(el.style,{left:anchor.rect.left+'px',top:anchor.rect.top+'px',width:anchor.rect.width+'px',height:anchor.rect.height+'px'});
     const clone=anchor.clone.cloneNode(true) as HTMLElement;clone.style.visibility='visible';el.append(clone);layerRef.current?.append(el);
     animate(el,[{opacity:.85,transform:'scale(1)'},{opacity:0,transform:cue.kind==='bounce'?'translateY(100px) rotate(-14deg) scale(.3)':'translateY(28px) rotate(8deg) scale(.82)',filter:'grayscale(1)'}],{duration,fill:'forwards'});
     later(()=>el.remove(),duration+10);
    }
    burst('retire',anchor.point,0,'#d7b67c',80);
    later(()=>{if(id)departureCallback.current?.(id)},duration+20);
   },delay);numbers(cue.changes,delay+100,cue);return;
  }
  if(cue.kind==='retort'){
   later(()=>{const el=document.createElement('div');el.className='battle-fx-retort';el.textContent='反话生效';Object.assign(el.style,{left:to.point.x+'px',top:to.point.y+'px'});layerRef.current?.append(el);animate(el,[{opacity:0,transform:'translate(-50%,-50%) perspective(500px) rotateY(-100deg) scale(.65)'},{opacity:1,transform:'translate(-50%,-50%) perspective(500px) rotateY(0deg) scale(1.1)',offset:.35},{opacity:1,transform:'translate(-50%,-50%) rotate(-6deg) scale(1)',offset:.75},{opacity:0,transform:'translate(-50%,-70%) scale(.9)'}],{duration:reducedRef.current?250:750,fill:'forwards'});later(()=>el.remove(),770)},delay);
   burst('paper',to.point,delay+200,'#d6c1f4',100);numbers(cue.changes,delay+250,cue);return;
  }
  if(cue.kind==='draw'){burst('paper',to.point,delay,teal,70);return}
  if(cue.kind==='card'){burst('beam',to.point,delay+80,teal,60,from.point);text({x:to.point.x,y:to.point.y-45},cue.label??'出牌','skill',delay+150,true);return}
  if(cue.kind==='status'||cue.kind==='topic'){text(to.point,cue.label??'状态变化','skill',delay,true);burst('ring',to.point,delay,gold,60)}
 }
 function playGroup(group:MotionGroup){
  setKind(group.cues[0]?.kind??'');
  for(let i=0;i<group.cues.length;i++){
   const cue=group.cues[i];const offset=cueOffset(group,i);
   playCue(cue,offset);
  }
  const duration=group.cues[0]?.kind==='result'?resultMotionDuration(group.cues[0],reducedRef.current):reducedRef.current?280:group.duration;
  later(()=>{if(queue.current.length)pumpRef.current();else{updateBusy(false);setKind('')}},duration);
 }
 pumpRef.current=()=>{const group=queue.current.shift();if(!group){updateBusy(false);return}updateBusy(true);playGroup(group)};
 useLayoutEffect(()=>{
  capture();
  const cues=view.visualCues??[];
  const fresh=cursor.current.consume(view.matchId,cues);
  if(fresh.length){queue.current=boundedQueue(queue.current,groupBattleCues(fresh,reducedRef.current));if(!running.current)pumpRef.current()}
 },[view.matchId,view.version,view.visualCues]);
 useEffect(()=>{
  alive.current=true;
  const query=matchMedia('(prefers-reduced-motion: reduce)');const change=()=>{const value=query.matches||document.documentElement.dataset.reduced==='true';reducedRef.current=value;setReduced(value);if(value){resultMotion.current?.reduce();for(const v of videos.current){v.pause();v.remove()}videos.current.clear()}};change();query.addEventListener('change',change);const preferenceObserver=new MutationObserver(change);preferenceObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-reduced']});
  const resize=()=>capture();window.addEventListener('resize',resize);window.addEventListener('scroll',resize,true);
  let raf=0;const canvas=canvasRef.current,ctx=canvas?.getContext('2d');
  const draw=(now:number)=>{
   if(!canvas||!ctx)return;
   if(!particles.current.length){raf=requestAnimationFrame(draw);return}
   const dpr=Math.min(devicePixelRatio||1,2),w=innerWidth,h=innerHeight;
   if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);canvas.style.width=w+'px';canvas.style.height=h+'px'}
   ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
   particles.current=particles.current.filter(b=>now-b.start<b.duration);
   for(const b of particles.current){
    const t=(now-b.start)/b.duration;if(t<0)continue;const u=ease(t),alpha=(1-t)*(1-t);
    ctx.save();ctx.translate(b.point.x,b.point.y);ctx.globalAlpha=alpha;const R=b.radius??90;
    if(b.kind==='beam'&&b.from){
     ctx.translate(-b.point.x,-b.point.y);const p=flightPoint(b.from,b.point,u);
     ctx.strokeStyle=b.color;ctx.lineWidth=4*(1-t)+1;ctx.shadowColor=b.color;ctx.shadowBlur=16;
     ctx.beginPath();for(let j=0;j<18;j++){const q=flightPoint(b.from,b.point,Math.max(0,u-j*.017));j?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y)}ctx.stroke();
     ctx.fillStyle='#fff4cc';ctx.beginPath();ctx.arc(p.x,p.y,7*(1-t)+2,0,Math.PI*2);ctx.fill();ctx.restore();continue;
    }
    if(b.kind==='ring'||b.kind==='deploy'||b.kind==='heal'){
     ctx.strokeStyle=b.color;ctx.lineWidth=2.5*(1-t)+.5;ctx.shadowColor=b.color;ctx.shadowBlur=14;
     const radius=R*(.2+u*.8);ctx.beginPath();ctx.ellipse(0,0,radius,b.kind==='deploy'?radius*.25:radius,0,0,Math.PI*2);ctx.stroke();
     if(!reducedRef.current){ctx.globalAlpha=alpha*.6;ctx.beginPath();ctx.arc(0,0,radius*.76,0,Math.PI*2);ctx.stroke()}
    }
    if(b.kind==='impact'){
     ctx.rotate(-.35);ctx.fillStyle='#061517';ctx.globalAlpha=alpha*.65;ctx.beginPath();for(let j=0;j<14;j++){const a=j/14*Math.PI*2,r=R*(j%2?.23:.66)*(1+t*.3);j?ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r):ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r)}ctx.closePath();ctx.fill();
     ctx.globalAlpha=alpha;ctx.fillStyle='#fff2bd';ctx.shadowColor='#ffd480';ctx.shadowBlur=24;
     ctx.beginPath();ctx.moveTo(-R*(.2+u),-4);ctx.lineTo(-9,-11);ctx.lineTo(0,-R*.6*(1-t));ctx.lineTo(10,-8);ctx.lineTo(R*(.2+u),3);ctx.lineTo(9,11);ctx.lineTo(0,R*.6*(1-t));ctx.lineTo(-9,8);ctx.closePath();ctx.fill();
    }
    if(!reducedRef.current){
     const n=b.kind==='impact'?28:b.kind==='paper'?15:18;
     for(let i=0;i<n;i++){
      const a=rand(b.seed+i)*Math.PI*2,speed=.3+rand(b.seed+i+30)*.8,r=R*u*speed;
      const x=Math.cos(a)*r,y=Math.sin(a)*r+(b.kind==='heal'?-t*40:t*t*40);
      ctx.save();ctx.translate(x,y);ctx.rotate(a+t*(i%2?3:-3));ctx.globalAlpha=alpha*(.55+rand(i)*.45);ctx.fillStyle=i%3===0?'#fff8d5':b.color;ctx.shadowColor=b.color;ctx.shadowBlur=i%4===0?10:0;
      if(b.kind==='heal'){ctx.fillRect(-1.5,-5,3,10);ctx.fillRect(-5,-1.5,10,3)}
      else{const size=(b.kind==='paper'?7:3.5)*(1-t*.5);ctx.fillRect(-size,-size*.35,size*2,size*.7)}ctx.restore();
     }
    }
    ctx.restore();
   }
   raf=requestAnimationFrame(draw);
  };raf=requestAnimationFrame(draw);
  return()=>{alive.current=false;cancelAnimationFrame(raf);query.removeEventListener('change',change);preferenceObserver.disconnect();window.removeEventListener('resize',resize);window.removeEventListener('scroll',resize,true);for(const t of timers.current)clearTimeout(t);timers.current.clear();resultMotion.current?.dispose();resultMotion.current=null;for(const a of animations.current)a.cancel();animations.current.clear();for(const v of videos.current){v.pause();v.remove()}videos.current.clear();particles.current=[];queue.current=[];running.current=false;callback.current?.(false)};
 },[]);
 return createPortal(<div ref={layerRef} className="battle-effects" data-busy={busy} data-kind={kind||undefined} data-reduced-motion={reduced} aria-hidden="true"><canvas ref={canvasRef} className="battle-fx-canvas"/></div>,document.body);
}
export default BattleEffects;
