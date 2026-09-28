import type {BattleCue} from '../game/types';
import {resultMotionDuration} from './result-motion';

/** Paced after Hearthstone: every beat is long enough to read, the blow itself is quick.
 * Attack: lift, lean back, lunge, hit-stop at contact, recoil home. Stats, splats, shake and sound land on `contact`.
 * A retirement shivers first, then tears (`departure` includes the shiver). */
export const ATTACK_TIMING={duration:1100,lift:220,contact:520,hold:110,departure:980} as const;
export const RETIRE_SHIVER=260;
/** A played card is revealed before its effect lands (opponent) or dissolves quickly (self). */
export const CARD_TIMING={reveal:1800,revealImpact:1400,own:620,ownImpact:320} as const;
export const DEPLOY_TIMING={duration:820,land:500} as const;
export const SKILL_TIMING={primary:1000,secondary:1300,impact:420} as const;
export const RETIRE_AFTER_IMPACT=160;
/** How long a splat, stamp or label stays readable on the table. */
export const READ_MS=1500;
/** A pencil erases the old number and writes the new one after each blow lands. */
export const REWRITE_MS=950;
/** The attacker's own number is rewritten a little quicker, as it settles back into its slot. */
export const ATTACK_REWRITE_MS=Math.round(REWRITE_MS*.85);
/** When a surviving attacker, back home, gets its own number rewritten. */
export const ATTACK_REWRITE_AT=ATTACK_TIMING.duration-260;
/** When cue `index` reveals its numbers (retirement penalties land just after the tear starts). */
export function landingOffset(group:MotionGroup,index:number){
 const lead=group.cues[0],cue=group.cues[index];
 if(index===0)return lead.kind==='attack'?ATTACK_TIMING.contact:group.impact??0;
 return cueOffset(group,index)+(cue.kind==='retire'||cue.kind==='bounce'?RETIRE_SHIVER:0);
}
export interface MotionGroup {id:string;cues:BattleCue[];duration:number;impact?:number;mine?:boolean}
const leaders=new Set(['attack','primary_skill','secondary_skill','card','deploy','retort','result']);
/** Offset of cue `index` inside its resolver group; followers land when the leader connects. */
export function cueOffset(group:MotionGroup,index:number){
 if(index===0)return 0;
 const lead=group.cues[0],cue=group.cues[index];
 // Lethal counter-damage folds the attacker right after the hit-stop, without a living return pose.
 if(lead.kind==='attack'&&lead.sourceId&&cue.kind==='retire'&&(cue.targetId??cue.sourceId)===lead.sourceId)return ATTACK_TIMING.contact+ATTACK_TIMING.hold;
 if(lead.kind==='attack')return cue.kind==='retire'?ATTACK_TIMING.contact+ATTACK_TIMING.hold:ATTACK_TIMING.contact;
 // Exits start just after the blow that caused them, so the hit reads before the tear.
 if(group.impact!==undefined)return group.impact+(cue.kind==='retire'||cue.kind==='bounce'?RETIRE_AFTER_IMPACT:0);
 return ['primary_skill','secondary_skill','card'].includes(lead.kind)?160:80;
}
function leaderTiming(cue:BattleCue,reduced:boolean,selfId?:string):{duration:number;impact?:number}{
 if(cue.kind==='result')return {duration:resultMotionDuration(cue,reduced)};
 if(reduced)return {duration:100,impact:0};
 switch(cue.kind){
  case 'attack':return {duration:ATTACK_TIMING.duration};
  case 'deploy':return {duration:DEPLOY_TIMING.duration,impact:DEPLOY_TIMING.land};
  case 'primary_skill':return {duration:SKILL_TIMING.primary,impact:SKILL_TIMING.impact};
  case 'secondary_skill':return {duration:SKILL_TIMING.secondary,impact:SKILL_TIMING.impact};
  case 'retort':return {duration:900,impact:380};
  case 'card':{
   // Without a viewer (tests, replay export) the short own-card beat is used.
   const hidden=!!selfId&&!!cue.playerId&&cue.playerId!==selfId;
   return hidden?{duration:CARD_TIMING.reveal,impact:CARD_TIMING.revealImpact}:{duration:CARD_TIMING.own,impact:CARD_TIMING.ownImpact};
  }
  default:return {duration:cue.kind==='draw'?480:cue.kind==='bounce'?760:cue.kind==='retire'?ATTACK_TIMING.departure:cue.kind==='status'||cue.kind==='topic'?900:600};
 }
}
export function groupBattleCues(cues:BattleCue[],reduced=false,selfId?:string):MotionGroup[]{
 const groups:MotionGroup[]=[];
 for(const cue of cues){
  if(['turn','covered'].includes(cue.kind))continue;
  const last=groups.at(-1);
  // A single resolver's aftermath belongs to its attack/cast, not a long serial queue.
  if(!last||leaders.has(cue.kind)){
   const timing=leaderTiming(cue,reduced,selfId);
   groups.push({id:cue.id,cues:[cue],duration:timing.duration,...(timing.impact!==undefined&&cue.kind!=='attack'?{impact:timing.impact}:{}),...(selfId?{mine:cue.playerId===selfId}:{})});
  }else last.cues.push(cue);
 }
 // A group lasts until its last rewritten number has been written back in.
 if(!reduced)for(const group of groups){
  const landings=group.cues.flatMap((cue,index)=>cue.changes?.some(change=>change.amount)?[landingOffset(group,index)+REWRITE_MS]:[]);
  // A surviving attacker has its own number rewritten after it is back in its slot.
  const lead=group.cues[0],survives=lead.kind==='attack'&&!!lead.sourceId&&!group.cues.some(cue=>cue.kind==='retire'&&(cue.targetId??cue.sourceId)===lead.sourceId);
  if(survives&&lead.changes?.some(change=>change.amount&&change.targetId===lead.sourceId))landings.push(ATTACK_REWRITE_AT+ATTACK_REWRITE_MS);
  if(landings.length&&group.cues[0].kind!=='result')group.duration=Math.max(group.duration,...landings);
 }
 // Never unlock/compact a board while an aftermath ghost is still on screen.
 for(const group of groups)if(!reduced&&group.cues.some(c=>c.kind==='retire'||c.kind==='bounce')){
  const exits=group.cues.flatMap((cue,index)=>cue.kind==='retire'||cue.kind==='bounce'?[cueOffset(group,index)+(cue.kind==='bounce'?760:ATTACK_TIMING.departure)]:[]);
  group.duration=Math.max(group.duration,...exits);
 }
 return groups;
}
/** Stable sequence watermark: repeated or out-of-order snapshots cannot replay effects. */
export class CueCursor{
 matchId='';sequence=-1;
 consume(matchId:string,cues:BattleCue[]):BattleCue[]{
  const latest=Math.max(-1,...cues.map(c=>c.sequence));
  if(this.matchId!==matchId){this.matchId=matchId;this.sequence=latest;return []}
  const fresh=cues.filter(c=>c.sequence>this.sequence).sort((a,b)=>a.sequence-b.sequence);
  this.sequence=Math.max(this.sequence,latest);
  return fresh;
 }
}
/** Keep feedback responsive after offline catch-up or fast scripted commands. */
export function boundedQueue(current:MotionGroup[],incoming:MotionGroup[],limit=3){
 const all=[...current,...incoming];return all.slice(-limit);
}
export interface Point{x:number;y:number}
export function flightPoint(from:Point,to:Point,progress:number):Point{
 const t=Math.max(0,Math.min(1,progress));const arc=Math.min(65,Math.hypot(to.x-from.x,to.y-from.y)*.17);
 return {x:from.x+(to.x-from.x)*t+Math.sin(t*Math.PI)*arc*(to.y<from.y?1:-1),y:from.y+(to.y-from.y)*t};
}
/** Keyframes for the attacker body: lift off the table, lean back, lunge, freeze on contact, recoil.
 * The lunge stops short of the target centre so the two paper figures visibly collide. */
export function attackKeyframes(dx:number,dy:number,died:boolean):Keyframe[]{
 const d=ATTACK_TIMING.duration,at=(ms:number)=>ms/d,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len,reach=Math.max(0,len-46);
 const tilt=Math.max(-9,Math.min(9,ux*9)),back=Math.min(26,len*.08);
 const hit=`translate(${ux*reach}px,${uy*reach}px)`;
 return [
  {transform:'translate(0,0) scale(1) rotate(0deg)',easing:'cubic-bezier(.2,.8,.3,1)'},
  {offset:at(ATTACK_TIMING.lift),transform:`translate(${-ux*back*.4}px,${-uy*back*.4-16}px) scale(1.16) rotate(${-tilt*.6}deg)`,easing:'cubic-bezier(.4,0,.6,1)'},
  {offset:at(ATTACK_TIMING.lift+110),transform:`translate(${-ux*back}px,${-uy*back-18}px) scale(1.18) rotate(${-tilt}deg)`,easing:'cubic-bezier(.62,0,.94,.4)'},
  {offset:at(ATTACK_TIMING.contact),transform:`${hit} scale(1.1,.94) rotate(${tilt}deg)`,easing:'linear'},
  {offset:at(ATTACK_TIMING.contact+ATTACK_TIMING.hold),transform:`${hit} scale(1.06,.97) rotate(${tilt*.8}deg)`,easing:died?'ease-in':'cubic-bezier(.25,1.4,.5,1)'},
  died
   ?{offset:1,transform:`${hit} scale(1) rotate(${tilt}deg)`,opacity:0}
   :{offset:at(d-160),transform:`translate(${-ux*5}px,${-uy*5-4}px) scale(1.03) rotate(${-tilt*.2}deg)`,easing:'cubic-bezier(.3,.7,.4,1)'},
  ...(died?[]:[{offset:1,transform:'translate(0,0) scale(1) rotate(0deg)'}]),
 ];
}
