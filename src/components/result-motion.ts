import type {BattleCue,MatchView} from '../game/types';

export function resultMotionDuration(cue:BattleCue,reduced=false){return reduced?100:650}
interface Options{
 layer:HTMLElement;arena:HTMLElement;view:MatchView;cue:BattleCue;reduced:boolean;
 later:(fn:()=>void,ms:number)=>unknown;
 animate:(node:HTMLElement,frames:Keyframe[],options:KeyframeAnimationOptions)=>Animation;
}
const fragments=[
 '0 0,35% 0,32% 35%,0 28%','35% 0,68% 0,72% 30%,52% 42%,32% 35%',
 '68% 0,100% 0,100% 38%,72% 30%','0 28%,32% 35%,39% 67%,0 72%',
 '32% 35%,52% 42%,72% 30%,68% 67%,39% 67%','72% 30%,100% 38%,100% 75%,68% 67%',
 '0 72%,39% 67%,30% 100%,0 100%','39% 67%,68% 67%,72% 100%,30% 100%',
 '68% 67%,100% 75%,100% 100%,72% 100%',
];

/** A card-portrait fracture, not a second game resolver. Uses only the public result. */
export function playResultMotion({layer,arena,view,cue,reduced,later:schedule,animate:render}:Options){
 const legacyDuration=reduced?420:cue.effectId==='draw'?1400:2400;
 const scale=resultMotionDuration(cue,reduced)/legacyDuration;
 const later=(fn:()=>void,ms:number)=>schedule(fn,ms*scale);
 const animate=(node:HTMLElement,frames:Keyframe[],options:KeyframeAnimationOptions)=>render(node,frames,{...options,duration:Number(options.duration??legacyDuration)*scale});
 const winnerId=view.result?.winnerId??null;
 const loser=winnerId?view.players.find(p=>p.id!==winnerId):undefined;
 const outcome=winnerId?(winnerId===view.selfId?'win':'lose'):'draw';
 const findHero=(id?:string)=>[...arena.querySelectorAll<HTMLElement>('.hero-avatar[data-battle-id]')].find(el=>el.dataset.battleId===id);
 const defeated=findHero(loser?.id),winner=findHero(winnerId??undefined);
 const ownAnimations=new Set<Animation>();let disposed=false,quiet=reduced;
 const run=(el:HTMLElement,frames:Keyframe[],options:KeyframeAnimationOptions)=>{const a=animate(el,frames,options);ownAnimations.add(a);a.finished.catch(()=>{}).finally(()=>ownAnimations.delete(a));return a};
 const after=(ms:number,fn:()=>void)=>later(()=>{if(!disposed)fn()},ms);
 const root=document.createElement('div');root.className='battle-defeat';root.dataset.outcome=outcome;root.dataset.stage='focus';root.dataset.reduced=String(reduced);if(loser)root.dataset.loserId=loser.id;
 const shade=document.createElement('div');shade.className='battle-defeat-vignette';root.append(shade);
 const light=document.createElement('div');light.className='battle-defeat-light';root.append(light);
 const caption=document.createElement('div');caption.className='battle-defeat-caption';
 const kicker=document.createElement('span');kicker.className='battle-defeat-kicker';kicker.textContent=outcome==='win'?'THE TABLE IS YOURS':outcome==='lose'?'ANOTHER ROUND AWAITS':'EVENLY MATCHED';
 const title=document.createElement('strong');title.textContent=outcome==='win'?'对手落败':outcome==='lose'?'暂时下班':'旗鼓相当';
 const name=document.createElement('span');name.className='battle-defeat-name';name.textContent=loser?`${loser.name} · 本局落败`:'这一局，各有底气。';
 caption.append(kicker,title,name);root.append(caption);layer.append(root);
 const cx=innerWidth/2,cy=innerHeight*.40,w=Math.min(172,innerWidth*.34,innerHeight*.23),h=w*1.2;
 root.style.setProperty('--result-center-y',`${cy}px`);root.style.setProperty('--result-caption-y',`${cy+h*.7+25}px`);
 run(shade,[{opacity:0},{opacity:1}],{duration:reduced?120:420,fill:'forwards'});
 function finish(){root.remove();defeated?.classList.remove('result-hero-hidden');defeated?.classList.add('result-hero-defeated');winner?.classList.add('result-hero-victor')}
 if(reduced||!loser){
  root.dataset.stage='farewell';
  run(caption,[{opacity:0},{opacity:1,offset:.3},{opacity:1,offset:.8},{opacity:0}],{duration:legacyDuration-30,fill:'forwards'});
  if(defeated)run(defeated,[{opacity:1},{opacity:.22}],{duration:260,fill:'forwards'});
 }else{
  const rect=defeated?.getBoundingClientRect();
  const from={x:rect?rect.left+rect.width/2:cx,y:rect?rect.top+rect.height/2:cy};
  const card=document.createElement('div');card.className='battle-defeat-medallion';Object.assign(card.style,{left:cx+'px',top:cy+'px',width:w+'px',height:h+'px'});
  const face=document.createElement('div');face.className='battle-defeat-portrait';
  const source=defeated?.querySelector<HTMLImageElement>('img');
  if(source){const portrait=source.cloneNode(true) as HTMLImageElement;portrait.removeAttribute('class');portrait.removeAttribute('id');portrait.alt='';face.append(portrait)}
  const seal=document.createElement('span');seal.className='battle-defeat-seal';seal.textContent='败';face.append(seal);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('battle-defeat-cracks');svg.setAttribute('viewBox','0 0 100 100');svg.setAttribute('preserveAspectRatio','none');
  const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d','M35 0 32 35 0 28 M32 35 52 42 72 30 68 0 M72 30 100 38 M32 35 39 67 0 72 M39 67 68 67 100 75 M68 67 72 30 M39 67 30 100 M68 67 72 100');svg.append(path);face.append(svg);card.append(face);root.append(card);
  defeated?.classList.add('result-hero-hidden');
  run(card,[{opacity:.8,transform:`translate(-50%,-50%) translate(${from.x-cx}px,${from.y-cy}px) scale(${(rect?.width??64)/w})`},{opacity:1,transform:'translate(-50%,-50%) translate(0,0) scale(1.03)',offset:.85},{opacity:1,transform:'translate(-50%,-50%) scale(1)'}],{duration:440,easing:'cubic-bezier(.18,.7,.23,1)',fill:'forwards'});
  after(350,()=>{if(quiet)return;root.dataset.stage='fracture';svg.style.opacity='1';run(face,[{filter:'brightness(1)'},{filter:'brightness(1.7)',offset:.5},{filter:'brightness(1)'}],{duration:270})});
  after(610,()=>{
   if(quiet)return;
   card.remove();
   run(light,[{opacity:0,transform:'translate(-50%,-50%) scale(.6)'},{opacity:.9,offset:.18},{opacity:0,transform:'translate(-50%,-50%) scale(1.8)'}],{duration:620,fill:'forwards'});
   fragments.forEach((polygon,index)=>{
    const shard=document.createElement('div');shard.className='battle-defeat-shard';Object.assign(shard.style,{left:cx-w/2+'px',top:cy-h/2+'px',width:w+'px',height:h+'px',clipPath:`polygon(${polygon})`});shard.append(face.cloneNode(true));root.append(shard);
    const col=index%3-1,row=Math.floor(index/3)-1,dx=col*(95+index*4)+(index%2?18:-18),dy=row*65+115;
    run(shard,[{opacity:1,transform:'translate(0,0) rotate(0) scale(1)'},{opacity:.95,transform:`translate(${dx*.55}px,${dy*.2-32}px) rotate(${(index%2?1:-1)*(8+index*2)}deg)`,offset:.38},{opacity:0,transform:`translate(${dx}px,${dy+55}px) rotate(${(index%2?1:-1)*(24+index*4)}deg) scale(.76)`,filter:'grayscale(.85)'}],{duration:1020,easing:'cubic-bezier(.15,.4,.5,1)',fill:'forwards'});
    after(1040,()=>shard.remove());
   });
   if(arena)run(arena,[{transform:'translate(0,0)'},{transform:'translate(-3px,2px)',offset:.22},{transform:'translate(2px,-1px)',offset:.5},{transform:'translate(0,0)'}],{duration:240});
  });
  after(850,()=>{
   root.dataset.stage='farewell';
   if(quiet)return;
   run(caption,[{opacity:0,transform:'translate(-50%,10px)'},{opacity:1,transform:'translate(-50%,0)',offset:.22},{opacity:1,offset:.82},{opacity:0,transform:'translate(-50%,-4px)'}],{duration:1450,fill:'forwards'});
   if(winner)run(winner,[{filter:'brightness(1)'},{filter:'brightness(1.7) drop-shadow(0 0 16px #f0d995)',offset:.5},{filter:'brightness(1)'}],{duration:1200});
  });
 }
 after(legacyDuration-20,finish);
 return {
  reduce(){quiet=true;root.dataset.reduced='true';root.dataset.stage='farewell';for(const a of ownAnimations)a.cancel();root.querySelectorAll('.battle-defeat-shard,.battle-defeat-medallion').forEach(el=>el.remove());light.remove();caption.style.opacity='1';shade.style.opacity='1';},
  dispose(){disposed=true;for(const a of ownAnimations)a.cancel();root.remove();defeated?.classList.remove('result-hero-hidden','result-hero-defeated');winner?.classList.remove('result-hero-victor');},
 };
}
