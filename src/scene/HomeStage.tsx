import {useEffect,useId,useRef,useState,type CSSProperties} from 'react';
import {Icon} from '../ui';
import {PaperCharacter} from './PaperCharacter';
import {useMotionPreferences} from '../motion/useMotionPreferences';
import '../styles/stage.css';
import {motionDirector} from '../motion/MotionDirector';
import {artUrl} from '../deployment';

type Action='play'|'friends'|'create'|'collection'|'loadout'|'tutorial'|'history';
const entrances:{id:Action;label:string;hint:string;icon:string}[]=[
 {id:'play',label:'先打一局',hint:'公共阵容 · 随时开打',icon:'sword'},
 {id:'friends',label:'和朋友开打',hint:'留个座位，一起比比',icon:'users'},
 {id:'create',label:'做我的卡',hint:'把你的工作印成卡',icon:'plus'},
 {id:'collection',label:'我的卡册',hint:'每张底牌，都有来头',icon:'cards'},
 {id:'loadout',label:'调整阵容',hint:'三份 Offer · 双学历',icon:'crown'},
 {id:'tutorial',label:'练一招',hint:'前辈带你，五课入门',icon:'book'},
 {id:'history',label:'最近对局',hint:'回看刚才的名场面',icon:'replay'},
];
export function PaperProp({kind}:{kind:Action}){
 const [missing,setMissing]=useState(false);const asset=({create:'printer',collection:'folder',friends:'chair',loadout:'badge-rack',play:'table'} as Partial<Record<Action,string>>)[kind];
 if(asset&&!missing)return <svg viewBox="0 0 160 120" className="stage-prop" aria-hidden="true"><image href={artUrl(`/assets/paper/props/${asset}/256.webp`)} width="160" height="120" preserveAspectRatio="xMidYMax meet" onError={()=>setMissing(true)}/></svg>;
 return <svg viewBox="0 0 160 120" className="stage-prop" aria-hidden="true" fill="none" stroke="#344451" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">
  <ellipse cx="80" cy="108" rx="62" ry="7" fill="#344451" opacity=".1" stroke="none"/>
  {kind==='create'?<><path d="M34 56V14h88v47" fill="#FFFDF5"/><path d="M45 28h61M45 40h43" stroke="#A6B8B6"/><path d="M17 54h125v43H17Z" fill="#A8C8BB"/><path d="M17 54 32 42h97l13 12" fill="#D8EFE4"/><path d="M39 82h82l-6 27H44Z" fill="#FFFDF5"/><path d="M52 91h50m-49 8h32" stroke="#C0B7A6"/><circle cx="129" cy="65" r="4" fill="#F8D578"/><path d="M40 79h80"/></>:kind==='collection'?<><path d="M26 30 70 23 80 34 129 25 141 98 38 114Z" fill="#B2CABA"/><path d="M34 22 122 12 132 91 45 104Z" fill="#FFFCF5"/><path d="M47 30 106 25m-56 16 49-5" stroke="#C2CDC3"/><path d="M20 43 57 39 67 47 125 36 140 99 36 115Z" fill="#F8D578"/><path d="m34 59 24-4" stroke="#D6AA43"/><rect x="65" y="62" width="43" height="24" rx="4" fill="#FFFCF5" transform="rotate(-8 65 62)"/></>:kind==='friends'?<><path d="m49 12 62 1 5 61-66 1Z" fill="#CFDBEB"/><path d="m50 74-20 20 88 5 20-20Z" fill="#FFF9E9"/><path d="m40 98-2 13m80-12 1 13M59 33h42M59 45h42"/><path d="m87 18 23-5 9 30-23 4Z" fill="#F8D578"/></>:kind==='loadout'?<><path d="M20 25h121M35 25v77m92-77v77M20 103h122" strokeWidth="7"/><path d="M44 25v20m37-20v20m35-20v20" stroke="#DB7F6D" strokeWidth="5"/>{[29,66,103].map((x,i)=><g key={x}><rect x={x} y="45" width="29" height="42" rx="4" fill={['#DBE7FF','#D8EFE4','#FBE0DB'][i]}/><circle cx={x+14} cy="60" r="6" fill="#FFFCF5"/><path d={`M${x+7} 75h15`} strokeWidth="2"/></g>)}</>:kind==='tutorial'?<><path d="m35 20 94 8-9 74-92-9Z" fill="#F8D578"/><path d="m33 14 96 10-2 14-94-10Z" fill="#F4DDBC" opacity=".7" stroke="none"/><path d="m51 47 49 5m-50 10 42 4m-43 12 30 3" stroke="#7E7054"/><path d="m21 101 8-22 11 3-3 24Z" fill="#F47463"/></>:kind==='history'?<><path d="M33 16h82l20 24v67H33Z" fill="#FFFCF5"/><path d="M115 16v26h20" fill="#DBE7FF"/><circle cx="78" cy="69" r="21" fill="#D8EFE4"/><path d="M78 57v14l10 5"/></>:<><path d="M16 32 91 14 145 38 67 58Z" fill="#F6D9A6"/><path d="M16 32v15l51 28 78-24V38L67 58Z" fill="#D8BA88"/><path d="M34 57v40l13 7V64m71-5v40l12-4V55" fill="#B4A894"/><path d="m71 27 29 10-18 6-28-11Z" fill="#FFFDF5"/><path d="m94 26 23 9-12 5-22-10Z" fill="#DBE7FF"/></>}
 </svg>
}
export default function HomeStage({onAction,onSettings,onAccount,accountLabel,invited=false,onToggleSound,sound,onExperiments}:{onExperiments?:()=>void;onAction:(action:Action)=>void;onSettings:()=>void;onAccount:()=>void;accountLabel:string;invited?:boolean;onToggleSound:()=>void;sound:boolean}){
 const motion=useMotionPreferences(),root=useRef<HTMLElement>(null),scope=useId(),firstVisit=useRef(!sessionStorage.getItem('offer-stage-seen')),effectRun=useRef(0);
 const [stage,setStage]=useState<'static'|'assembling'|'ready'>(()=>sessionStorage.getItem('offer-stage-seen')?'ready':'static');
 const [faceA,setFaceA]=useState<'confident'|'blink'>('confident'),[faceB,setFaceB]=useState<'calm'|'blink'>('calm');
 const [speech,setSpeech]=useState(-1),[engaged,setEngaged]=useState(false),[replay,setReplay]=useState(0);
 const cancel=()=>{motionDirector.cancelScope(scope);setStage('ready');setSpeech(-1);sessionStorage.setItem('offer-stage-seen','1');setEngaged(true)};
 useEffect(()=>{
  if(motion.reduced||motion.hidden||motion.ambientPaused||invited||engaged){motionDirector.cancelScope(scope);setStage('ready');setSpeech(-1);return}
  const first=firstVisit.current,run=++effectRun.current;
  if(first)setStage('assembling');
  let cancelled=false;const timers:ReturnType<typeof setTimeout>[]=[];
  const elements=(selector:string)=>Array.from(root.current?.querySelectorAll(selector)||[]);
  const assemble=motionDirector.play({cue:'homeAssemble',id:`home-${scope}-${replay}-${run}`,scope,durationMs:first?1500:180,run:ctx=>{
   if(!first)return;
   for(const el of elements('.stage-book'))ctx.animate(el,[{opacity:.6,transform:'translateY(12px) scaleY(.96)'},{opacity:1,transform:'none'}],{duration:450});
   ctx.later(()=>{motionDirector.play({cue:'propUnfold',id:`props-${run}`,scope,run:part=>{for(const el of elements('.stage-booth'))part.animate(el,[{opacity:0,translate:'0 25px',scale:'1 .8'},{opacity:1,translate:'0 0',scale:'1 1'}],{duration:part.durationMs})}})},120);
   ctx.later(()=>{for(const el of elements('.stage-actor'))ctx.animate(el,[{opacity:0,translate:'-12px 0'},{opacity:1,translate:'0 0'}],{duration:400})},280);
   ctx.later(()=>{motionDirector.play({cue:'titleSettle',id:`title-${run}`,scope,run:part=>{for(const el of elements('.stage-title h1'))part.animate(el,[{opacity:0,translate:'0 -10px',rotate:'3deg'},{opacity:1,translate:'0 0',rotate:'0deg'}],{duration:part.durationMs})}})},420);
  },onSettled:reason=>{if(!cancelled){setStage('ready');if(reason==='finished'){firstVisit.current=false;sessionStorage.setItem('offer-stage-seen','1')}}}});
  if(!localStorage.getItem('offer-stage-intro-seen')||replay){
   const say=(line:number)=>{if(cancelled)return;motionDirector.play({cue:'quip',id:`quip-${scope}-${replay}-${run}-${line}`,scope,run:()=>{setSpeech(line);return()=>setSpeech(-1)}})};
   timers.push(setTimeout(()=>say(0),first?1600:200));timers.push(setTimeout(()=>say(1),first?3000:1600));
   timers.push(setTimeout(()=>localStorage.setItem('offer-stage-intro-seen','1'),first?4400:3000));
  }
  return()=>{cancelled=true;timers.forEach(clearTimeout);assemble.cancel();motionDirector.cancelScope(scope)};
 },[motion.reduced,motion.hidden,motion.ambientPaused,invited,engaged,replay,scope]);
 useEffect(()=>{
  if(stage!=='ready'||motion.reduced||motion.hidden||motion.ambientPaused||engaged||invited)return;
  let disposed=false,cycle=0;const timers=new Set<ReturnType<typeof setTimeout>>();const later=(callback:()=>void,delay:number)=>{const timer=setTimeout(()=>{timers.delete(timer);callback()},delay);timers.add(timer)};
  const loop=()=>{if(disposed)return;const id=++cycle,actor=root.current?.querySelector('.actor-a .paper-character');if(actor)motionDirector.play({cue:'idleSway',id:`idle-${scope}-${id}-${replay}`,scope,run:ctx=>{ctx.animate(actor,[{translate:'0 0',rotate:'0deg'},{translate:'0 -2px',rotate:'.5deg',offset:.5},{translate:'0 0',rotate:'0deg'}],{duration:ctx.durationMs})}});
   later(()=>{if(disposed)return;motionDirector.play({cue:'blink',id:`blink-${scope}-${id}-${replay}`,scope,run:()=>{if(id%2)setFaceA('blink');else setFaceB('blink');return()=>{setFaceA('confident');setFaceB('calm')}}})},4200);later(loop,6100);
  };later(loop,1800);return()=>{disposed=true;timers.forEach(clearTimeout);motionDirector.cancelScope(scope);setFaceA('confident');setFaceB('calm')};
 },[stage,motion.reduced,motion.hidden,motion.ambientPaused,engaged,invited,replay,scope]);
 const reactToHotspot=(element:HTMLElement)=>{const art=element.querySelector('.stage-hotspot-art');if(!art||!art.getClientRects().length)return;motionDirector.play({cue:'hotspotReact',id:`hotspot-${scope}-${performance.now()}`,scope,run:ctx=>{ctx.animate(art,[{translate:'0 0'},{translate:ctx.reduced?'0 0':'0 -4px',offset:.5},{translate:'0 0'}],{duration:ctx.durationMs})}})};
 const activate=(action:Action)=>{cancel();onAction(action)};
 return <main ref={root} className="paper-stage" data-stage={stage} data-paused={motion.ambientPaused||motion.hidden||engaged} onFocusCapture={()=>{if(document.activeElement?.closest('.stage-menu'))setEngaged(true)}}>
  <div className="stage-corners"><button className="stage-account" onClick={()=>{cancel();onAccount()}}><Icon name="users"/><span>{accountLabel}</span></button><div><button className="icon-btn" aria-label={sound?'关闭游戏声音':'开启游戏声音'} aria-pressed={sound} onClick={onToggleSound}><Icon name="volume"/></button><button className="icon-btn" aria-label="设置" onClick={()=>{cancel();onSettings()}}><Icon name="settings"/></button></div></div>
  <header className="stage-title"><span className="stage-edition">工资先亮，底牌后出。</span><h1>秋招<span>斗兽棋</span></h1><p>把你的 Offer 变成角色，和朋友开打一局。</p></header>
  <div className="stage-world" aria-hidden="true">
   <svg className="stage-sky" viewBox="0 0 1200 550" preserveAspectRatio="xMidYMid slice"><path d="M0 510V182Q230-70 604 36q403-140 596 163v311" fill="#DDEAE9"/><path d="M0 420 49 416V299h70v-69h58v128h60v-54h72v163h106V206h48V153h30v55h68v247h234V314h53v-97h92v-54h42v60h29v186h68V263h84v157h67v104H0" fill="#B6CFD0" opacity=".45"/><g fill="#FFFCF5"><path d="M140 135q3-35 30-20 22-26 38 1 33-4 35 22H137"/><path d="M851 94q7-26 29-12 20-22 34 0 31-3 32 21H848"/></g></svg>
   <svg className="stage-book" viewBox="0 0 1200 410"><path d="M62 57 572 14l34 17 490-24 97 274-586 116-597-75Z" fill="#B3A891"/><path d="m19 298 590 80 575-108M24 282l586 79 569-105" stroke="#F7ECDC" strokeWidth="7" fill="none"/><path d="M68 39 581 0l28 17 482-10 91 242-573 101L14 273Z" fill="#F2E7CD" stroke="#A7987E" strokeWidth="2"/><path d="m581 0 28 350" stroke="#D2C6AE" strokeWidth="3"/><path d="m79 67 476-35M81 79l476-35m107 279 441-74" stroke="#FFFCF5" strokeWidth="3" opacity=".7"/></svg>
   <svg className="stage-booth booth-left" viewBox="0 0 250 280"><path d="m35 91-19 166 181 2 32-169Z" fill="#D3E7D5" stroke="#809D8B" strokeWidth="3"/><path d="m35 91 155-3 7 171H16Z" fill="#B3CFB6"/><path d="m18 45 199-9 19 59-219 6Z" fill="#EF9B89" stroke="#9F7169" strokeWidth="3"/><path d="m19 56 201-8m-177 8 11 39m21-41 11 40m19-41 11 39m23-40 11 39m18-40 11 39" stroke="#F9CCB6" strokeWidth="14"/><path d="m55 122 88-3 4 70-88 3Z" fill="#FFFCF5"/><path d="m67 141 52-2m-51 17 39-1m-38 16 44-1" stroke="#BCCCBD" strokeWidth="7"/></svg>
   <svg className="stage-booth booth-right" viewBox="0 0 230 280"><path d="M30 122 211 99l6 153-183 9Z" fill="#A8BDC9" stroke="#758B99" strokeWidth="3"/><path d="m24 67 155-19 40 52-193 26Z" fill="#F7D887" stroke="#B9A36F" strokeWidth="3"/><path d="m66 139 111-15 8 82-111 13Z" fill="#FFF7E6"/><path d="m83 153 34-3-1 39-30 3Zm44-5 33-4 3 21-33 5Z" fill="#D4DDD6"/><path d="m131 184 34-4" stroke="#D1B898" strokeWidth="6"/></svg>
   <svg className="stage-tree" viewBox="0 0 180 300"><path d="m85 109-8 183h20l7-183" fill="#B39878"/><path d="m83 209-40-49m54 1 44-34" stroke="#B39878" strokeWidth="9"/><path d="M21 144q-37-42 10-74Q15 31 63 25 89-15 117 26q56-3 44 47 33 19 9 63-38 41-149 8" fill="#E8C778" stroke="#D8B86D" strokeWidth="3"/><path d="m45 121 55-63 33 61" fill="none" stroke="#F3DEAA" strokeWidth="4"/></svg>
   <div className="stage-actor actor-a"><PaperCharacter profession="algorithm" expression={faceA as any}/><span className={`stage-speech ${speech===0?'visible':''}`}>我年包 48 万。</span></div>
   <div className="stage-actor actor-b"><PaperCharacter profession="research" identity={1} flipped expression={faceB as any}/><span className={`stage-speech ${speech===1?'visible':''}`}>我双休。</span></div>
   <div className="stage-table"><PaperProp kind="play"/></div>
   <span className="stage-floor-note">一张桌子 · 各有底气</span>
  </div>
  <nav className="stage-menu" aria-label="游戏入口">{entrances.map((e,i)=><button key={e.id} className={`stage-hotspot hotspot-${e.id} ${invited&&e.id==='friends'?'invited':''}`} style={{'--order':i} as CSSProperties} onPointerEnter={event=>reactToHotspot(event.currentTarget)} onClick={()=>activate(e.id)}>
   {e.id!=='play'&&<span className="stage-hotspot-art"><PaperProp kind={e.id}/></span>}
   <span className="stage-hotspot-label"><Icon name={e.icon}/><strong>{e.id==='friends'&&invited?'朋友在等你':e.label}</strong>{e.id==='play'&&<Icon name="arrow"/>}</span><small>{e.hint}</small>
  </button>)}</nav>
  <footer className="stage-footer"><span>游客可玩人机与教程 · 联机需登录</span><div>{onExperiments&&<button className="text-btn" onClick={onExperiments}>实验室</button>}<button className="text-btn" onClick={()=>{setEngaged(false);setReplay(x=>x+1)}}>看看他们吵什么</button><button className="text-btn" onClick={()=>motion.setAmbientPaused(!motion.ambientPaused)}>{motion.ambientPaused?'播放环境动作':'暂停环境动作'}</button><button className="text-btn" onClick={()=>motion.setPreference(motion.reduced?'full':'reduced')}>动效：{motion.reduced?'简化':'完整'}</button></div></footer>
 </main>
}
