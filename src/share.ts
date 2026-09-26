import {artUrl} from './deployment';
import {heroArt,offerArt,educationSeal} from './assets';
import type {Loadout, MatchView, OfferDefinition} from './game/types';
import {education, rules, templateById} from './game/catalog';

type Surface = {canvas:HTMLCanvasElement;ctx:CanvasRenderingContext2D;width:number;height:number};
function surface(width:number,height:number):Surface {
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d')!;
 const g=ctx.createLinearGradient(0,0,width,height);g.addColorStop(0,'#31574f');g.addColorStop(.55,'#17363a');g.addColorStop(1,'#0b202b');ctx.fillStyle=g;ctx.fillRect(0,0,width,height);
 ctx.strokeStyle='#bdab7b';ctx.lineWidth=2;ctx.strokeRect(35,35,width-70,height-70);ctx.strokeStyle='#9a93604a';ctx.strokeRect(47,47,width-94,height-94);
 ctx.textAlign='center';ctx.fillStyle='#cfbd8a';ctx.font='22px sans-serif';ctx.fillText('秋招斗兽棋 · OFFER BATTLE',width/2,95);
 return {canvas,ctx,width,height};
}
function text(s:Surface,value:string,x:number,y:number,size=30,color='#f0dfb8',maxWidth=s.width-130,bold=false){s.ctx.font=`${bold?'bold ':''}${size}px sans-serif`;s.ctx.fillStyle=color;s.ctx.fillText(value,x,y,maxWidth)}
function save(s:Surface,name:string){const a=document.createElement('a');a.download=name;a.href=s.canvas.toDataURL('image/png');a.click()}
async function image(src:string):Promise<HTMLImageElement>{return new Promise((resolve,reject)=>{const im=new Image();im.crossOrigin='anonymous';im.onload=()=>resolve(im);im.onerror=()=>reject(Error('图片尚未就绪'));im.src=artUrl(src)})}
async function art(s:Surface,src:string,cx:number,y:number,w:number,h:number,fallback?:string){let im:HTMLImageElement;try{im=await image(src)}catch(error){if(!fallback)throw error;im=await image(fallback)}const scale=Math.min(w/im.width,h/im.height);s.ctx.drawImage(im,cx-im.width*scale/2,y+(h-im.height*scale)/2,im.width*scale,im.height*scale)}
function offerImage(offer:OfferDefinition){return offer.artId?.startsWith('/api/art/')?offer.artId:offerArt(offer.templateId)}
function footer(s:Surface,label='工资先亮，底牌后出。'){text(s,label,s.width/2,s.height-68,21,'#beaf82')}

export async function exportOffer(offer:OfferDefinition){
 const s=surface(960,1280);await art(s,offerImage(offer),480,125,700,660,offerArt(offer.templateId));
 text(s,offer.name,480,875,51,'#f5e6c3',820,true);text(s,`${offer.company} · ${offer.role}`,480,936,28,'#b6c6b5',820);
 text(s,`${(offer.annualPackage/10000).toFixed(1)} 万 / 年`,480,1030,62,'#e4c383',820,true);
 text(s,`${offer.originalTime} 小时   /   ${offer.baseAttack} 排面   /   ${offer.baseHealth} 底气`,480,1098,27);
 text(s,`玩法类型 · ${templateById[offer.templateId].name}`,480,1152,23,'#aebca8');footer(s);save(s,`${offer.name}-Offer卡.png`);
}
export async function exportGraduation(loadout:Loadout){
 const s=surface(1080,1440),primary=rules.heroes.find(h=>h.id===loadout.primaryId)!,secondary=education.secondary.find(h=>h.id===loadout.secondaryId)!;
 text(s,loadout.primaryId==='H10'&&loadout.secondaryId==='S10'?'本硕连读 · 宇宙吉大':'双学历，双重底气。',540,189,50,'#f0dfb8',930,true);
 await art(s,heroArt(primary.id),540,225,620,695);
 await art(s,educationSeal(secondary.id),847,270,136,136);
 text(s,loadout.name,540,1000,45,'#f1e4c1',890,true);
 text(s,`${primary.name} × ${secondary.name}`,540,1066,31,'#d5c492',900);
 text(s,`${primary.skill}  /  ${secondary.skill}`,540,1120,25,'#afc0b0',900);
 s.ctx.strokeStyle='#a59b6866';s.ctx.beginPath();s.ctx.moveTo(140,1162);s.ctx.lineTo(940,1162);s.ctx.stroke();
 text(s,'带着我的三份底气',540,1210,22,'#acbba6');
 loadout.offers.forEach((o,i)=>text(s,`${o.name} · ${(o.annualPackage/10000).toFixed(1)}万`,220+i*320,1262,24,'#e7d6a7',295));
 footer(s);save(s,'Offer开打-双学历毕业照.png');
}
export async function exportInvitation(loadout:Loadout,roomCode:string){
 const s=surface(1080,1440);text(s,'把 Offer，摆上桌。',540,192,58,'#f5e6c3',950,true);text(s,`${loadout.name} 邀你开打`,540,260,29,'#b7c7b6');
 await Promise.all(loadout.offers.slice(0,3).map(async(o,i)=>{const cx=210+i*330;await art(s,offerImage(o),cx,355,310,465,offerArt(o.templateId));text(s,o.name,cx,882,29,'#f5e1ad',310,true);text(s,`${(o.annualPackage/10000).toFixed(1)} 万 / 年`,cx,928,25,'#c6b881',310);text(s,templateById[o.templateId].name,cx,971,19,'#9eb39f',310)}));
 s.ctx.fillStyle='#e3ce9120';s.ctx.fillRect(250,1050,580,207);text(s,'好友房间码',540,1100,24,'#b6c4ab');text(s,roomCode,540,1199,78,'#ecd69b',850,true);
 text(s,'进入同一游戏服务，在「和朋友约一场」输入房间码',540,1311,23,'#aebfae',960);footer(s);save(s,`Offer开打-邀请-${roomCode}.png`);
}
export async function exportBattle(view:MatchView){
 const s=surface(1200,1000);text(s,view.result?.winnerId===view.selfId?'这一局，很有底气。':'下局，继续开打。',600,193,64,'#ead7a8',1070,true);
 await Promise.all(view.players.map(async(p,i)=>{await art(s,heroArt(p.education.primaryId),330+i*540,220,340,370);text(s,p.name,330+i*540,622,29,'#efdfb9',450,true);text(s,`心态 ${p.mind}`,330+i*540,673,26)}));
 text(s,`第 ${view.round} 轮 · ${view.result?.reason||'对局结束'}`,600,728,22,'#aebba7',1000);const events=view.events.filter(e=>/谈薪|退场|全校|通知|合同/.test(e.text)).slice(-3);s.ctx.textAlign='left';events.forEach((e,i)=>text(s,`◇ ${e.text}`,100,801+i*41,20,'#aebba7',1000));s.ctx.textAlign='center';footer(s);save(s,'Offer开打-名场面.png');
}
