import {artUrl} from './deployment';
import type {Loadout,MatchView,OfferDefinition} from './game/types';
import {projectOfferShare,projectLineupShare,projectBattleShare,PRIVATE_SHARE_DEFAULTS,type ShareChoices,type PublicShare} from './game/publicProjection';
export {PRIVATE_SHARE_DEFAULTS,projectOfferShare,projectLineupShare,projectBattleShare};
export type {ShareChoices,PublicShare};
const ink='#25313C',muted='#596473';
function image(src:string):Promise<HTMLImageElement>{return new Promise((resolve,reject)=>{const value=new Image();value.crossOrigin='anonymous';value.onload=()=>resolve(value);value.onerror=reject;value.src=artUrl(src)})}
export async function renderShare(projection:PublicShare):Promise<HTMLCanvasElement>{
 const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=projection.kind==='battle'?1100:1440;const ctx=canvas.getContext('2d')!;
 const rect=(x:number,y:number,w:number,h:number,color:string,r=18)=>{ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()};
 const text=(value:string,x:number,y:number,size=28,color=ink,max=950,bold=false)=>{ctx.fillStyle=color;ctx.font=`${bold?750:500} ${size}px -apple-system, sans-serif`;ctx.textAlign='center';ctx.fillText(value,x,y,max)};
 rect(0,0,canvas.width,canvas.height,'#F7F2E8',0);rect(30,35,1020,canvas.height-65,'#C8BCA8',26);rect(30,25,1020,canvas.height-65,'#FFFCF5',26);
 rect(68,64,945,94,'#D8EFE4',12);text('秋招斗兽棋 · OFFER BATTLE',540,123,30,ink);text(projection.title,540,239,49,ink,950,true);text(projection.subtitle,540,298,24,muted);
 const count=projection.offers.length;
 for(let i=0;i<count;i++){
  const offer=projection.offers[i],single=count===1,x=single?540:210+i*330,w=single?630:290,y=single?355:400,h=single?660:440;
  rect(x-w/2,y,w,h,'#E6EDE1',18);
  try{const art=await image(`/assets/paper/characters/${offer.artKey}/${single?'768':'256'}.webp`);const scale=Math.min((w-24)/art.width,(h-22)/art.height);ctx.drawImage(art,x-art.width*scale/2,y+h-art.height*scale,art.width*scale,art.height*scale)}catch{rect(x-65,y+70,130,180,'#D8EFE4');text('职场角色',x,y+160,25);text(`${offer.attack} / ${offer.health}`,x,y+220,35)}
  const start=single?1078:912;text(offer.title,x,start,single?43:26,ink,w,true);let line=start+46;if(offer.company){text(offer.company,x,line,24,muted,w);line+=40}if(offer.salary){text(offer.salary,x,line,32,'#A94638',w,true);line+=44}text(`${offer.cost}时 · ${offer.attack}排面 / ${offer.health}底气`,x,line,single?30:22,ink,w);if(single&&offer.benefit)text(offer.benefit,x,line+47,25,'#166953',w);
 }
 if(projection.kind==='battle'){
  projection.players?.forEach((p,i)=>{rect(160+i*430,367,330,232,i===0?'#D8EFE4':'#FBE0DB');text(p.name,325+i*430,432,32,ink,280,true);text(String(p.mind),325+i*430,533,82,ink,290,true);text('剩余心态',325+i*430,573,22,muted)});
  projection.highlights?.slice(-3).forEach((h,i)=>text(h.text,540,702+i*65,25,muted,930));
 }
 if(projection.roomCode){rect(250,1130,580,178,'#DBE7FF');text('好友房间码',540,1180,24,muted);text(projection.roomCode,540,1258,64,ink,510,true)}
 if(projection.schoolLabels)text(projection.schoolLabels.join(' × '),540,1348,24,muted);
 text('工资先亮，底牌后出。',540,canvas.height-65,23,muted);return canvas;
}
export async function exportProjection(projection:PublicShare){const canvas=await renderShare(projection),a=document.createElement('a');a.download=projection.filename;a.href=canvas.toDataURL('image/png');a.click()}
export function exportPublicJSON(projection:PublicShare){const url=URL.createObjectURL(new Blob([JSON.stringify(projection,null,2)],{type:'application/json'})),a=document.createElement('a');a.download=projection.filename.replace('.png','.json');a.href=url;a.click();setTimeout(()=>URL.revokeObjectURL(url),0)}
export const exportOffer=(offer:OfferDefinition,choices:ShareChoices=PRIVATE_SHARE_DEFAULTS)=>exportProjection(projectOfferShare(offer,choices));
export const exportGraduation=(loadout:Loadout,choices:ShareChoices=PRIVATE_SHARE_DEFAULTS)=>exportProjection(projectLineupShare(loadout,choices));
export const exportInvitation=(loadout:Loadout,roomCode:string,choices:ShareChoices=PRIVATE_SHARE_DEFAULTS)=>exportProjection(projectLineupShare(loadout,choices,roomCode));
export const exportBattle=(view:MatchView,choices:ShareChoices=PRIVATE_SHARE_DEFAULTS)=>exportProjection(projectBattleShare(view,choices));
