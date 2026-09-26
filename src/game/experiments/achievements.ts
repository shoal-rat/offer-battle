import {applyCommand} from '../engine';
import {stableHash} from '../offers';
import type {MatchState,Command} from '../types';
import {DEFAULT_EXPERIMENT_FLAGS,requireExperiment,type ExperimentFlags} from './features';
export const achievementCatalog=[
 {id:'small-big',title:'以小见大',description:'用不超过两小时的角色主动拆掉至少五小时的角色。',cosmeticId:'sticker-small-big'},
 {id:'notice-cleared',title:'另辟路径',description:'转管理后让已挂上的优化通知失效。',cosmeticId:'sticker-paper-shield'},
 {id:'low-mind-win',title:'稳住最后一句',description:'在自己的心态不超过六时拿下胜利。',cosmeticId:'sticker-steady'},
] as const;
export interface AchievementEvidence {id:string;cosmeticId:string;matchId:string;eventSequence:number}
/** Verify the transition with the ordinary engine; text alone can never award a badge. */
export function deriveAchievements(before:MatchState,after:MatchState,actorId:string,command:Command,flags:ExperimentFlags=DEFAULT_EXPERIMENT_FLAGS,playerId=actorId):AchievementEvidence[]{
 requireExperiment(flags,'achievements');const verified=applyCommand(before,actorId,command);if(verified.error||stableHash(verified.state)!==stableHash(after))return [];const events=after.events.filter(e=>e.sequence>before.eventSequence),earned:AchievementEvidence[]=[];
 const award=(id:string,eventSequence:number)=>{const item=achievementCatalog.find(a=>a.id===id)!;earned.push({id,cosmeticId:item.cosmeticId,matchId:after.matchId,eventSequence})};
 if(command.type==='ATTACK'&&actorId===playerId){const source=before.players.find(p=>p.id===actorId)?.board.find(u=>u.id===(command.cardId??command.offerId)),target=before.players.find(p=>p.id!==actorId)?.board.find(u=>u.id===command.targetId),retire=events.find(e=>e.type==='retire'&&e.targetId===target?.id);if(source&&target&&source.originalTime<=2&&target.originalTime>=5&&retire)award('small-big',retire.sequence);}
 const expired=events.find(e=>e.type==='notice_expired'&&after.players.find(p=>p.id===playerId)?.board.some(u=>u.id===e.targetId&&u.managed));if(expired)award('notice-cleared',expired.sequence);
 if(after.result?.winnerId===playerId&&(before.players.find(p=>p.id===playerId)?.mind??99)<=6){const event=events.find(e=>e.type==='match_end')??events.at(-1);if(event)award('low-mind-win',event.sequence);}
 return earned;
}
export function mergeAchievements(current:AchievementEvidence[],incoming:AchievementEvidence[]){const valid=new Set(achievementCatalog.map(a=>a.id));return [...current,...incoming].filter((value,index,all)=>valid.has(value.id as any)&&all.findIndex(other=>other.id===value.id)===index).map(value=>({id:value.id,cosmeticId:achievementCatalog.find(a=>a.id===value.id)!.cosmeticId,matchId:value.matchId,eventSequence:value.eventSequence}));}
