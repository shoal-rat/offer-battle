import type {BattleCue,Command,MatchView} from '../game/types';
import {CueCursor,groupBattleCues,type MotionGroup} from '../components/battle-motion';
import type {MotionCueKey} from './cues';
export interface BattleMotionControl {catchUp:(reason?:string)=>void;prepare:(command:Command,version:number)=>Promise<boolean>}
export interface BattlePresentation {matchId:string;authoritativeVersion:number;presentationVersion:number;unstableIds:readonly string[];active:boolean;resultPending:boolean;catchUps:number}
export function motionKey(cue:BattleCue):MotionCueKey {
 const keys:Partial<Record<BattleCue['kind'],MotionCueKey>>={attack:'attack',damage:'hit',heal:'heal',deploy:'deploy',retort:'retortCancel',retire:'retire',draw:'dealCard',buff:'buff',bounce:'returnToHand',topic:'topicChange',turn:'turnBanner',result:'resultCurtain',primary_skill:'buff',secondary_skill:'buff',card:'cardFocus'};
 if(cue.kind==='status')return cue.effectId==='age'?'ageAdvance':cue.effectId==='management'?'management':cue.effectId==='notice'?'notice':cue.effectId==='negotiate'?'returnToHand':'buff';
 return keys[cue.kind]??'buff';
}
/** Public visual metadata only: the adapter never inspects the opponent's unrevealed cards. */
export class BattleEventAdapter {
 private cursor=new CueCursor();private previous:Pick<MatchView,'matchId'|'activePlayerId'|'selfId'|'version'>|null=null;
 consume(view:MatchView,reduced=false,hidden=false){
  const previous=this.previous;this.previous={matchId:view.matchId,activePlayerId:view.activePlayerId,selfId:view.selfId,version:view.version};
  const fresh=this.cursor.consume(view.matchId,view.visualCues??[]);
  const initial=!previous||previous.matchId!==view.matchId;
  const newOwnTurn=!initial&&previous.activePlayerId!==view.activePlayerId&&view.activePlayerId===view.selfId;
  const groups=hidden?[]:groupBattleCues(fresh,reduced,view.selfId);
  return {initial,newOwnTurn,hidden,fresh:hidden?[]:fresh,groups};
 }
 sync(view:MatchView){this.consume(view,false,true)}
}
export function groupActors(group:MotionGroup){return [...new Set(group.cues.flatMap(cue=>[cue.sourceId,cue.targetId,...(cue.targets?.map(anchor=>anchor.id)??[])]).filter((id):id is string=>!!id))]}
export function commandUsesUnstableTarget(command:Command,view:MatchView,unstable:ReadonlySet<string>){
 const ids=[command.cardId,command.offerId,command.targetId,command.sacrificeId,...(command.targetIds??[])];
 if(command.type==='DEPLOY_OFFER'||command.type==='PLAY_CARD')ids.push(view.selfId);
 return ids.some(id=>!!id&&unstable.has(id));
}
