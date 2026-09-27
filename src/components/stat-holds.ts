import type {BattleChange,BattleCue} from '../game/types';

export type StatSlot='mind'|'attack'|'health';
/** Which on-table number a public change moves. Max-health buffs raise the shown health too. */
export function statSlot(change:BattleChange):StatSlot{return change.stat==='mind'?'mind':change.stat==='attack'?'attack':'health'}
const keyOf=(targetId:string,slot:StatSlot)=>`${targetId}\u0000${slot}`;
/** Net change per displayed number that the queued cues still have to reveal. Pure; exported for tests. */
export function pendingStatDeltas(cues:readonly BattleCue[]){
 const totals=new Map<string,number>();
 for(const cue of cues)for(const change of cue.changes??[]){
  if(!change.amount)continue;
  const key=keyOf(change.targetId,statSlot(change));totals.set(key,(totals.get(key)??0)+change.amount);
 }
 for(const [key,value]of totals)if(!value)totals.delete(key);
 return totals;
}
const selectors:Record<StatSlot,string>={mind:'.hero-mind',attack:'.unit-attack',health:'.unit-health'};
export interface StatLanding {targetId:string;slot:StatSlot;amount:number;element:HTMLElement;from:string;to:string;departing:boolean}

/** The rules engine resolves a whole command at once; the table reveals it blow by blow.
 * A held number shows `rendered + offset`, where offset counts the changes not yet shown.
 * Holds live only in data attributes (never className) that React does not own, so a re-render never fights them. */
export class StatLedger {
 private offsets=new Map<string,number>();
 constructor(private root:()=>HTMLElement|null|undefined){}
 private element(targetId:string,slot:StatSlot){
  const host=[...(this.root()?.querySelectorAll<HTMLElement>('[data-battle-id]')??[])].find(node=>node.dataset.battleId===targetId);
  const stat=host?.querySelector<HTMLElement>(selectors[slot])??null;
  return {host,stat,departing:host?.dataset.departing==='true'};
 }
 private paint(key:string,stat:HTMLElement|null,offset:number,departing:boolean){
  if(!stat){this.offsets.delete(key);return}
  if(!offset&&!departing){delete stat.dataset.hold;delete stat.dataset.holdTone;this.offsets.delete(key);return}
  const rendered=Number(stat.textContent);
  if(!Number.isFinite(rendered)){delete stat.dataset.hold;delete stat.dataset.holdTone;this.offsets.delete(key);return}
  const slot=key.split('\u0000')[1] as StatSlot,shown=rendered+offset;
  stat.dataset.hold=String(slot==='attack'?shown:Math.max(0,shown));
  stat.dataset.holdTone=offset<0?'up':offset>0?'down':'';
  this.offsets.set(key,offset);
 }
 /** Freeze every number a batch will change, before the browser paints the new state. */
 stage(cues:readonly BattleCue[]){
  for(const [key,sum]of pendingStatDeltas(cues)){
   const [targetId,slot]=key.split('\u0000') as [string,StatSlot];
   const {stat,departing}=this.element(targetId,slot);
   // A departing unit still renders its last living numbers, so its hold starts at zero.
   const offset=(this.offsets.get(key)??0)-(departing?0:sum);
   this.paint(key,stat,offset,departing);
  }
 }
 /** Reveal one cue's changes; returns the numbers that moved so the caller can pop them. */
 land(cue:BattleCue):StatLanding[]{return this.landChanges(cue.changes??[])}
 /** Reveal some changes now (an attacker's own wound can wait until it is back in its slot). */
 landChanges(changes:readonly BattleChange[]):StatLanding[]{
  const moved:StatLanding[]=[];
  for(const change of changes){
   if(!change.amount)continue;
   const slot=statSlot(change),key=keyOf(change.targetId,slot),{stat,departing}=this.element(change.targetId,slot);
   if(!stat)continue;
   const from=stat.dataset.hold??stat.textContent??'';
   this.paint(key,stat,(this.offsets.get(key)??0)+change.amount,departing);
   moved.push({targetId:change.targetId,slot,amount:change.amount,element:stat,from,to:stat.dataset.hold??stat.textContent??'',departing});
  }
  return moved;
 }
 /** Snap to the authoritative table: used by catch-up, hidden tabs and disposal. */
 release(){
  this.offsets.clear();
  for(const stat of this.root()?.querySelectorAll<HTMLElement>('[data-hold]')??[]){delete stat.dataset.hold;delete stat.dataset.holdTone}
 }
 get size(){return this.offsets.size}
}
