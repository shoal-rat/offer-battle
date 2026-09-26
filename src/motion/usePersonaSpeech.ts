import {useEffect,useRef,useState} from 'react';
import {PersonaSpeechBudget,type PersonaEvent} from '../game/draft-persona';
import type {MatchView,OfferDefinition} from '../game/types';
import {CueCursor} from '../components/battle-motion';
import {motionDirector} from './MotionDirector';
import {getMotionPreferences} from './useMotionPreferences';
/** Lines are tied to public, accepted events and never influence rules or action availability. */
export function usePersonaSpeech(view:MatchView){
 const budget=useRef(new PersonaSpeechBudget()),cursor=useRef(new CueCursor()),units=useRef(new Map<string,OfferDefinition>()),[line,setLine]=useState(''),scope=`speech:${view.matchId}`;
 useEffect(()=>{
  for(const p of view.players)for(const unit of p.board){const offer=p.offerZone.find(o=>o.id===unit.offerId)?.definition;if(offer)units.current.set(unit.id,offer)}
  const fresh=cursor.current.consume(view.matchId,view.visualCues??[]);
  if(view.phase!=='playing'||getMotionPreferences().hidden)return;
  const enabled=localStorage.getItem('offer-quips')!=='0',turn=view.round*2+view.players.findIndex(p=>p.id===view.activePlayerId);
  for(const cue of fresh){
   const event:PersonaEvent|undefined=cue.kind==='deploy'?'summon':cue.kind==='bounce'?'return':cue.kind==='retort'?'disrupt':undefined;
   const offer=units.current.get((cue.kind==='bounce'?cue.sourceId:cue.targetId)??'');if(!event||!offer?.persona)continue;
   const message=budget.current.line(offer,event,cue.id,turn,enabled);if(!message)continue;
   motionDirector.play({cue:'quip',scope,id:cue.id,confirmed:true,run:()=>{setLine(message)},onSettled:()=>setLine('')});break;
  }
 },[view.matchId,view.version]);
 useEffect(()=>()=>{motionDirector.cancelScope(scope);units.current.clear()},[scope]);
 return line;
}
