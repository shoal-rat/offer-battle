import type {BattleCue} from '../game/types';
import {resultMotionDuration} from './result-motion';

export interface MotionGroup {id:string;cues:BattleCue[];duration:number}
const leaders=new Set(['attack','primary_skill','secondary_skill','card','deploy','retort','result']);
export function cueOffset(group:MotionGroup,index:number){
 if(index===0)return 0;
 const lead=group.cues[0],cue=group.cues[index];
 // An attacker that also died returns to its own slot before its exit starts.
 if(lead.kind==='attack'&&lead.sourceId&&cue.kind==='retire'&&(cue.targetId??cue.sourceId)===lead.sourceId)return 780;
 return lead.kind==='attack'?480:['primary_skill','secondary_skill','card'].includes(lead.kind)?430:120;
}
export function groupBattleCues(cues:BattleCue[],reduced=false):MotionGroup[]{
 const groups:MotionGroup[]=[];
 for(const cue of cues){
  if(['turn','covered'].includes(cue.kind))continue;
  const last=groups.at(-1);
  // A single resolver's aftermath belongs to its attack/cast, not a long serial queue.
  if(!last||leaders.has(cue.kind)){
   groups.push({id:cue.id,cues:[cue],duration:cue.kind==='result'?resultMotionDuration(cue,reduced):reduced?260:cue.kind==='secondary_skill'?1450:cue.kind==='primary_skill'?1050:cue.kind==='attack'?900:700});
  }else last.cues.push(cue);
 }
 // Never unlock/compact a board while an aftermath ghost is still on screen.
 for(const group of groups)if(!reduced&&group.cues.some(c=>c.kind==='retire'||c.kind==='bounce')){
  const exits=group.cues.flatMap((cue,index)=>cue.kind==='retire'||cue.kind==='bounce'?[cueOffset(group,index)+540]:[]);
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
