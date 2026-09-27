import type {Point} from './battle-motion';

/** Paper-craft effect primitives. Every node lives in the fixed effects layer, is appended
 * through `append` (so the director removes it on cancel) and never takes pointer input. */
export interface Fx {
 reduced:boolean;compact:boolean;
 later:(fn:()=>void,ms:number)=>void;
 animate:(node:Element,frames:Keyframe[],ms:number,extra?:KeyframeAnimationOptions)=>Animation|undefined;
 append:(node:HTMLElement)=>HTMLElement;
 /** Runs when the owning motion ends for any reason (finished, skipped, cancelled). */
 cleanup:(fn:()=>void)=>void;
}
export type Tone='damage'|'heal'|'buff'|'skill'|'retort'|'plain';
export const TONE:Record<Tone,{fill:string;ink:string;chips:string[]}>={
 damage:{fill:'#E4574A',ink:'#6B2019',chips:['#E4574A','#F5A33B','#FFF7E6','#B8352C']},
 heal:{fill:'#5FB487',ink:'#1F5A3F',chips:['#5FB487','#BFE7C9','#FFF7E6','#8DD1A8']},
 buff:{fill:'#F2BC45',ink:'#6D4B12',chips:['#F2BC45','#FFE7A0','#FFF7E6','#E48A3A']},
 skill:{fill:'#6F93D6',ink:'#253F7A',chips:['#6F93D6','#C9D8F6','#FFF7E6','#F2BC45']},
 retort:{fill:'#9B7AC9',ink:'#402A63',chips:['#9B7AC9','#E2D4F4','#FFF7E6','#F47463']},
 plain:{fill:'#FFF7E6',ink:'#25313C',chips:['#FFF7E6','#E9DCC2','#C8BCA8','#F47463']},
};
let seed=7;
const rand=()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646};
const div=(className:string,point?:Point)=>{const node=document.createElement('div');node.className=className;if(point){node.style.left=point.x+'px';node.style.top=point.y+'px'}return node};

/** A hand-cut star: uneven points so no two splats look stamped from the same die. */
export function starPolygon(points=11,inner=.66){
 const out:string[]=[];
 for(let i=0;i<points*2;i++){
  const angle=i/(points*2)*Math.PI*2-Math.PI/2,radius=(i%2?inner:1)*(.9+rand()*.1);
  out.push(`${(50+Math.cos(angle)*radius*50).toFixed(1)}% ${(50+Math.sin(angle)*radius*50).toFixed(1)}%`);
 }
 return `polygon(${out.join(',')})`;
}

/** Damage/heal splat: a cut-paper star with an outline layer and the number, popping with overshoot. */
export function splat(fx:Fx,point:Point,text:string,tone:Tone,size=1){
 const colors=TONE[tone],node=fx.append(div(`fx-splat tone-${tone}`,point));
 node.style.setProperty('--splat-size',`${Math.round(78*size)}px`);
 const shape=starPolygon(tone==='damage'?11:9,tone==='damage'?.64:.74);
 const back=div('fx-splat-back'),face=div('fx-splat-face'),label=document.createElement('strong');
 back.style.clipPath=shape;back.style.background=colors.ink;face.style.clipPath=shape;face.style.background=colors.fill;
 label.textContent=text;node.append(back,face,label);
 if(fx.reduced){fx.animate(node,[{opacity:0},{opacity:1,offset:.2},{opacity:1,offset:.8},{opacity:0}],700);return node}
 const spin=(rand()-.5)*24;
 fx.animate(node,[
  {opacity:0,transform:`translate(-50%,-50%) scale(.2) rotate(${spin-40}deg)`},
  {opacity:1,transform:`translate(-50%,-50%) scale(1.28) rotate(${spin+6}deg)`,offset:.16,easing:'cubic-bezier(.3,1.6,.5,1)'},
  {opacity:1,transform:`translate(-50%,-50%) scale(1) rotate(${spin}deg)`,offset:.3},
  {opacity:1,transform:`translate(-50%,-50%) scale(1) rotate(${spin}deg)`,offset:.78},
  {opacity:0,transform:`translate(-50%,-62%) scale(.86) rotate(${spin}deg)`},
 ],900,{easing:'ease-out'});
 return node;
}

/** Paper chips flung out in an arc and pulled down by gravity. */
export function confetti(fx:Fx,point:Point,tone:Tone,count=12,spread=1){
 if(fx.reduced)return;
 const colors=TONE[tone].chips,total=fx.compact?Math.min(4,count):count;
 for(let i=0;i<total;i++){
  const chip=fx.append(div(`fx-chip shape-${i%3}`,point));chip.style.background=colors[i%colors.length];
  const angle=(i/total)*Math.PI*2+rand()*.6,power=(46+rand()*54)*spread,dx=Math.cos(angle)*power,up=Math.sin(angle)*power-30-rand()*30,fall=60+rand()*50;
  const turn=(rand()-.5)*720,ms=560+rand()*260;
  fx.animate(chip,[
   {opacity:1,transform:'translate(-50%,-50%) rotate(0deg) scale(1)'},
   {opacity:1,transform:`translate(calc(-50% + ${dx*.7}px),calc(-50% + ${up}px)) rotate(${turn*.5}deg) scale(1)`,offset:.35,easing:'cubic-bezier(.3,0,.8,.4)'},
   {opacity:0,transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${up+fall}px)) rotate(${turn}deg) scale(.7)`},
  ],ms,{easing:'cubic-bezier(.15,.7,.4,1)'});
 }
}
/** A flat paper ring that snaps outward from an impact. */
export function ring(fx:Fx,point:Point,tone:Tone,scale=1){
 if(fx.reduced)return;
 const node=fx.append(div('fx-ring',point));node.style.borderColor=TONE[tone].fill;node.style.setProperty('--ring-size',`${Math.round(96*scale)}px`);
 fx.animate(node,[{opacity:.95,transform:'translate(-50%,-50%) scale(.3)',borderWidth:'10px'},{opacity:0,transform:'translate(-50%,-50%) scale(1.5)',borderWidth:'1px'}],380,{easing:'cubic-bezier(.1,.8,.3,1)'});
}
/** Short ink strokes radiating from the hit, drawn along the attack direction. */
export function speedLines(fx:Fx,point:Point,angle:number,tone:Tone='damage'){
 if(fx.reduced||fx.compact)return;
 for(let i=0;i<7;i++){
  const line=fx.append(div('fx-speed',point)),a=angle+(i-3)*.32+(rand()-.5)*.2;line.style.background=TONE[tone].ink;
  const deg=a*180/Math.PI,start=22+rand()*10,end=70+rand()*40;
  fx.animate(line,[{opacity:0,transform:`translate(-50%,-50%) rotate(${deg}deg) translateX(${start}px) scaleX(.2)`},{opacity:1,transform:`translate(-50%,-50%) rotate(${deg}deg) translateX(${start+14}px) scaleX(1)`,offset:.3},{opacity:0,transform:`translate(-50%,-50%) rotate(${deg}deg) translateX(${end}px) scaleX(.4)`}],300,{easing:'ease-out'});
 }
}
/** Table shake. Uses the independent `translate` property so layout transforms are untouched. */
export function shake(fx:Fx,element:Element|null|undefined,strength:number){
 if(fx.reduced||!element||strength<=0)return;
 const s=Math.min(12,strength),frames:Keyframe[]=[{translate:'0 0'}];
 for(let i=1;i<=6;i++){const k=s*(1-i/7);frames.push({translate:`${(i%2?1:-1)*k*(.6+rand()*.4)}px ${(rand()-.5)*k*1.2}px`,offset:i/7})}
 frames.push({translate:'0 0'});
 fx.animate(element,frames,300,{easing:'linear',fill:'none'});
}
/** The struck figure snaps back, flashes white and settles, like a knocked paper stand-up. */
export function recoil(fx:Fx,body:Element|null|undefined,direction:number,heavy=false){
 if(!body)return;
 if(fx.reduced){fx.animate(body,[{filter:'brightness(1)'},{filter:'brightness(1.6)',offset:.3},{filter:'brightness(1)'}],260,{fill:'none'});return}
 const lean=direction*(heavy?16:10);
 fx.animate(body,[
  {transform:'rotate(0deg) translateX(0)',filter:'brightness(1)'},
  {transform:`rotate(${lean}deg) translateX(${direction*10}px)`,filter:'brightness(2.1) saturate(.4)',offset:.14},
  {transform:`rotate(${-lean*.45}deg) translateX(${-direction*3}px)`,filter:'brightness(1.15)',offset:.45},
  {transform:`rotate(${lean*.18}deg)`,filter:'brightness(1)',offset:.72},
  {transform:'rotate(0deg) translateX(0)',filter:'brightness(1)'},
 ],460,{easing:'cubic-bezier(.2,.8,.3,1)',fill:'none'});
}
/** Numbers pop when their held value is finally revealed. */
export function popStat(fx:Fx,element:HTMLElement,amount:number){
 const tone=amount<0?'#E4574A':'#3E9E6C';
 if(fx.reduced){fx.animate(element,[{opacity:.4},{opacity:1}],200,{fill:'none'});return}
 fx.animate(element,[{scale:'1'},{scale:'1.75',color:tone,offset:.25,easing:'cubic-bezier(.3,1.5,.5,1)'},{scale:'1'}],520,{fill:'none'});
}
/** Rising sparkles for heals, buffs and skills. */
export function sparkles(fx:Fx,point:Point,tone:Tone,count=9){
 if(fx.reduced)return;
 const colors=TONE[tone].chips,total=fx.compact?3:count;
 for(let i=0;i<total;i++){
  const node=fx.append(div('fx-sparkle',{x:point.x+(rand()-.5)*70,y:point.y+(rand()-.2)*40}));node.style.background=colors[i%2];
  const rise=50+rand()*50,ms=520+rand()*300;
  fx.animate(node,[{opacity:0,transform:'translate(-50%,-50%) scale(.2) rotate(0deg)'},{opacity:1,transform:`translate(-50%,calc(-50% - ${rise*.4}px)) scale(1) rotate(45deg)`,offset:.3},{opacity:0,transform:`translate(-50%,calc(-50% - ${rise}px)) scale(.4) rotate(120deg)`}],ms,{easing:'ease-out'});
 }
}
/** Paper Mario style exit: the stand-up tears along a ragged line and both halves drop away.
 * One ghost container per departing unit (tagged with its id); each half holds its own copy so SVG mask IDs stay unique. */
export function tear(fx:Fx,rect:{left:number;top:number;width:number;height:number},copy:()=>HTMLElement|undefined,ms:number,departureId?:string):HTMLElement{
 const group=fx.append(div('battle-fx-ghost fx-tear-group'));Object.assign(group.style,{left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px'});
 if(departureId)group.dataset.departureId=departureId;
 const make=(side:'left'|'right')=>{
  const piece=div(`fx-tear fx-tear-${side}`);
  const jag=[0,1,2,3,4,5,6,7,8].map(i=>`${48+(i%2?7:-6)+(rand()-.5)*6}% ${i*12.5}%`);
  piece.style.clipPath=side==='left'?`polygon(0 0,${jag.join(',')},0 100%)`:`polygon(100% 0,${jag.join(',')},100% 100%)`;
  const content=copy();if(content){content.style.visibility='';piece.append(content)}
  group.append(piece);return piece;
 };
 if(fx.reduced){const whole=make('left');whole.style.clipPath='none';fx.animate(whole,[{opacity:1},{opacity:0}],Math.min(ms,240));return group}
 const left=make('left'),right=make('right');
 fx.animate(left,[
  {opacity:1,transform:'translate(0,0) rotate(0deg)'},
  {opacity:1,transform:'translate(-7px,-6px) rotate(-7deg)',offset:.22,easing:'cubic-bezier(.4,0,1,.6)'},
  {opacity:0,transform:'translate(-30px,64px) rotate(-26deg)'},
 ],ms);
 fx.animate(right,[
  {opacity:1,transform:'translate(0,0) rotate(0deg)'},
  {opacity:1,transform:'translate(8px,-4px) rotate(8deg)',offset:.22,easing:'cubic-bezier(.4,0,1,.6)'},
  {opacity:0,transform:'translate(34px,58px) rotate(24deg)'},
 ],ms);
 confetti(fx,{x:rect.left+rect.width/2,y:rect.top+rect.height*.45},'plain',10,.8);
 return group;
}
/** A rubber stamp slammed onto the table: skills, retorts and status changes. */
export function stamp(fx:Fx,point:Point,text:string,tone:Tone,ms=900){
 const node=fx.append(div(`fx-stamp tone-${tone}`,point));node.textContent=text;
 if(fx.reduced){fx.animate(node,[{opacity:0},{opacity:1,offset:.2},{opacity:1,offset:.8},{opacity:0}],ms);return node}
 const tilt=(rand()-.5)*14;
 fx.animate(node,[
  {opacity:0,transform:`translate(-50%,-50%) scale(2.1) rotate(${tilt-10}deg)`},
  {opacity:1,transform:`translate(-50%,-50%) scale(.94) rotate(${tilt}deg)`,offset:.16,easing:'cubic-bezier(.5,0,.9,.5)'},
  {opacity:1,transform:`translate(-50%,-50%) scale(1) rotate(${tilt}deg)`,offset:.26},
  {opacity:1,transform:`translate(-50%,-50%) scale(1) rotate(${tilt}deg)`,offset:.82},
  {opacity:0,transform:`translate(-50%,-56%) scale(1) rotate(${tilt}deg)`},
 ],ms);
 return node;
}
/** Turn banner: a paper ribbon that unrolls across the table, holds, then folds away. */
export function banner(fx:Fx,title:string,subtitle:string,ms:number,mine=true){
 const node=fx.append(div(`fx-banner ${mine?'mine':'theirs'}`));
 const ribbon=div('fx-banner-ribbon'),strong=document.createElement('strong'),small=document.createElement('small');
 strong.textContent=title;small.textContent=subtitle;ribbon.append(strong,small);node.append(ribbon);
 if(fx.reduced){fx.animate(node,[{opacity:0},{opacity:1,offset:.15},{opacity:1,offset:.85},{opacity:0}],ms);return node}
 fx.animate(ribbon,[
  {opacity:0,clipPath:'inset(0 50% 0 50%)',transform:'translate(-50%,-50%) rotate(-2deg) scale(.9)'},
  {opacity:1,clipPath:'inset(0 0% 0 0%)',transform:'translate(-50%,-50%) rotate(-2deg) scale(1.04)',offset:.2,easing:'cubic-bezier(.2,1.3,.4,1)'},
  {opacity:1,clipPath:'inset(0 0% 0 0%)',transform:'translate(-50%,-50%) rotate(-2deg) scale(1)',offset:.3},
  {opacity:1,clipPath:'inset(0 0% 0 0%)',transform:'translate(-50%,-50%) rotate(-2deg) scale(1)',offset:.8},
  {opacity:0,clipPath:'inset(0 0% 0 0%)',transform:'translate(-50%,-70%) rotate(-4deg) scale(.96)'},
 ],ms);
 if(mine)fx.later(()=>confetti(fx,{x:innerWidth/2,y:innerHeight*.46},'buff',16,1.6),ms*.18);
 return node;
}
/** Paper award rosette for big skills: scalloped petals unfold, spin a quarter turn and burst into confetti. */
export function rosette(fx:Fx,point:Point,text:string,tone:Tone,ms=980){
 const node=fx.append(div(`fx-rosette tone-${tone}`,point)),petals=div('fx-rosette-petals'),core=div('fx-rosette-core'),tails=div('fx-rosette-tails');
 core.textContent=text;node.append(tails,petals,core);
 if(fx.reduced){fx.animate(node,[{opacity:0},{opacity:1,offset:.2},{opacity:1,offset:.8},{opacity:0}],ms);return node}
 fx.animate(node,[{opacity:0,transform:'translate(-50%,-50%) scale(.2)'},{opacity:1,transform:'translate(-50%,-50%) scale(1.12)',offset:.22,easing:'cubic-bezier(.3,1.6,.5,1)'},{opacity:1,transform:'translate(-50%,-50%) scale(1)',offset:.34},{opacity:1,transform:'translate(-50%,-50%) scale(1)',offset:.8},{opacity:0,transform:'translate(-50%,-50%) scale(1.25)'}],ms);
 fx.animate(petals,[{transform:'rotate(-120deg) scale(.4)'},{transform:'rotate(8deg) scale(1)',offset:.3,easing:'cubic-bezier(.2,1.3,.4,1)'},{transform:'rotate(0deg) scale(1)'}],ms);
 fx.later(()=>confetti(fx,point,tone,16,1.5),ms*.22);
 return node;
}
/** Horizontal pencil, sharpened tip at x=0 and eraser at the right end (120×16 user units). */
const pencilSvg=(red:boolean)=>`<svg viewBox="0 0 120 16" aria-hidden="true"><path d="M0 8 7.5 5.1v5.8Z" fill="${red?'#C8372D':'#34322E'}"/><path d="M7.5 5.1 21 1.4v13.2L7.5 10.9Z" fill="#EBCB9F"/><path d="M7.5 5.1 21 1.4v4.2Z" fill="#fff" opacity=".35"/><rect x="21" y="1.4" width="77" height="13.2" fill="${red?'#D9463B':'#F4C24D'}"/><rect x="21" y="1.4" width="77" height="4.1" fill="#fff" opacity=".28"/><rect x="21" y="10.6" width="77" height="4" fill="#000" opacity=".13"/><path d="M28 8h58" stroke="${red?'#8F2E27':'#A8792A'}" stroke-width=".8" opacity=".5"/><rect x="98" y="1" width="9.5" height="14" fill="#BFC3C9"/><path d="M100.5 1v14M103.2 1v14" stroke="#8E949C" stroke-width=".9"/><rect x="107.5" y="1.4" width="12" height="13.2" rx="3.2" fill="#F29BA3"/><rect x="107.5" y="1.4" width="12" height="4" rx="2" fill="#fff" opacity=".3"/></svg>`;
/** A pencil comes onto the paper, rubs the old number out with its eraser, flips, writes the new number and leaves.
 * Red pencil for health and mind, graphite for everything else. The real number stays hidden until it is written. */
export function pencilRewrite(fx:Fx,element:HTMLElement,from:string,to:string,red:boolean,ms:number,delay=0){
 const rect=element.getBoundingClientRect(),style=getComputedStyle(element);if(!rect.width)return;
 element.dataset.rewrite='true';
 const sheet=fx.append(div(`fx-rewrite ${red?'red':'graphite'}`));
 const release=()=>{delete element.dataset.rewrite;sheet.remove()};fx.cleanup(release);
 Object.assign(sheet.style,{left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',fontSize:style.fontSize,paddingBottom:style.paddingBottom});
 const old=document.createElement('span'),fresh=document.createElement('span'),smudge=div('fx-rewrite-smudge');
 old.className='fx-rewrite-old';old.textContent=from;fresh.className='fx-rewrite-new';fresh.textContent=to;sheet.append(smudge,old,fresh);
 if(fx.reduced){fx.animate(old,[{opacity:1},{opacity:0}],160);fx.animate(fresh,[{opacity:0},{opacity:1}],160);fx.later(release,170);return}
 const at=(share:number)=>share;
 fx.animate(old,[{opacity:1,filter:'blur(0)',transform:'translateX(0)'},{opacity:1,offset:at(.18)},{opacity:.45,filter:'blur(.6px)',transform:'translateX(2px)',offset:at(.28)},{opacity:0,filter:'blur(1.4px)',transform:'translateX(-2px)',offset:at(.4)},{opacity:0}],ms,{delay});
 fx.animate(smudge,[{opacity:0},{opacity:0,offset:at(.2)},{opacity:.55,offset:at(.38)},{opacity:.3,offset:at(.8)},{opacity:0}],ms,{delay});
 fx.animate(fresh,[{clipPath:'inset(0 100% 0 0)',opacity:1},{clipPath:'inset(0 100% 0 0)',offset:at(.5)},{clipPath:'inset(0 0% 0 0)',offset:at(.8)},{clipPath:'inset(0 0% 0 0)'}],ms,{delay});
 const pencil=fx.append(div(`fx-pencil ${red?'red':''} erasing`));pencil.innerHTML=pencilSvg(red);
 const cx=rect.left+rect.width/2,cy=rect.top+rect.height/2,reach=Math.max(8,rect.width*.3);
 Object.assign(pencil.style,{left:cx+'px',top:cy-7.5+'px'});
 const angle='rotate(-38deg)';
 fx.animate(pencil,[
  {opacity:0,transform:`translate(150px,-170px) ${angle}`,easing:'cubic-bezier(.2,.8,.3,1)'},
  {opacity:1,transform:`translate(0,0) ${angle}`,offset:at(.16)},
  {transform:`translate(-7px,2px) ${angle}`,offset:at(.21)},
  {transform:`translate(6px,-1px) ${angle}`,offset:at(.26)},
  {transform:`translate(-6px,2px) ${angle}`,offset:at(.31)},
  {transform:`translate(5px,0) ${angle}`,offset:at(.36)},
  {transform:`translate(12px,-26px) ${angle}`,offset:at(.44),easing:'ease-in-out'},
  {transform:`translate(${-reach}px,1px) ${angle}`,offset:at(.5)},
  {transform:`translate(${-reach*.3}px,-2px) ${angle}`,offset:at(.6)},
  {transform:`translate(${reach*.35}px,2px) ${angle}`,offset:at(.7)},
  {transform:`translate(${reach}px,0) ${angle}`,offset:at(.8),easing:'cubic-bezier(.5,0,.8,.4)'},
  {opacity:0,transform:`translate(170px,-150px) ${angle}`},
 ],ms,{delay});
 // Lift, turn the pencil round, and write with the lead.
 fx.later(()=>pencil.classList.remove('erasing'),delay+ms*.46);
 fx.later(release,delay+ms*.82);
}
