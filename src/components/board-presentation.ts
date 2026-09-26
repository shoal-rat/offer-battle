import type {MatchView,UnitView} from '../game/types';

export interface BoardSlot {unit:UnitView;departing:boolean}
export interface BoardPresentation {view:MatchView;rows:Record<string,(BoardSlot|null)[]>}
export function initialBoardPresentation(view:MatchView):BoardPresentation{
 return {view,rows:Object.fromEntries(view.players.map(p=>[p.id,p.board.map(unit=>({unit,departing:false}))]))};
}
/** Retain the old physical slots until the compositor finishes their exit.
 * The authoritative view continues to drive rules and legal actions immediately. */
export function presentBoard(previous:BoardPresentation,view:MatchView):BoardPresentation{
 if(previous.view.matchId!==view.matchId)return initialBoardPresentation(view);
 const sequence=Math.max(-1,...(previous.view.visualCues??[]).map(c=>c.sequence));
 const departures=new Set((view.visualCues??[]).filter(c=>c.sequence>sequence&&(c.kind==='retire'||c.kind==='bounce')).map(c=>c.kind==='bounce'?c.sourceId:c.targetId??c.sourceId));
 const rows:BoardPresentation['rows']={};
 for(const player of view.players){
  const old=previous.rows[player.id]??[];
  const current=new Map(player.board.map(unit=>[unit.id,unit]));
  const leaving=new Set(old.flatMap(slot=>slot&&!current.has(slot.unit.id)&&(slot.departing||departures.has(slot.unit.id))?[slot.unit.id]:[]));
  if(!leaving.size){rows[player.id]=player.board.map(unit=>({unit,departing:false}));continue}
  const slots=old.map(slot=>!slot?null:current.has(slot.unit.id)?{unit:current.get(slot.unit.id)!,departing:false}:leaving.has(slot.unit.id)?{unit:slot.unit,departing:true}:null);
  while(slots.length<4)slots.push(null);
  const held=new Set(slots.flatMap(slot=>slot?[slot.unit.id]:[]));
  for(const unit of player.board){if(held.has(unit.id))continue;const gap=slots.findIndex(slot=>!slot);if(gap>=0)slots[gap]={unit,departing:false};}
  rows[player.id]=slots;
 }
 return {view,rows};
}
export function finishBoardDepartures(previous:BoardPresentation,ids?:string[]):BoardPresentation{
 const finished=ids?new Set(ids):null;
 let changed=false;
 const rows=Object.fromEntries(Object.entries(previous.rows).map(([id,slots])=>[id,slots.map(slot=>{
  if(slot?.departing&&(!finished||finished.has(slot.unit.id))){changed=true;return null}return slot;
 })]));
 if(!changed)return previous;
 return presentBoard({view:previous.view,rows},previous.view);
}
