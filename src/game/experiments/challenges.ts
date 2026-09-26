import {createMatch,applyCommand} from '../engine';
import {defaultLoadout} from '../offers';
import {createShowcase} from '../showcase';
import type {Command,Loadout,MatchState} from '../types';
import {DEFAULT_EXPERIMENT_FLAGS,EXPERIMENT_VERSION,requireExperiment,type ExperimentFlags,type ExperimentDescriptor} from './features';
export const challengeCatalog=[
 {id:'CH01',title:'最后一句话',goal:'用一次合法开怼结束对局。',seed:220101},
 {id:'CH02',title:'小牌拆大牌',goal:'让校招生拆掉原始费用至少五小时的角色。',seed:220102},
 {id:'CH03',title:'先问清，再开怼',goal:'用一次追问削弱目标，再由搭子完成拆台。',seed:220103},
 {id:'CH04',title:'换个身份继续聊',goal:'转管理后结束回合，让已挂上的优化通知失效。',seed:220104},
 {id:'CH05',title:'一张便条，两次上桌',goal:'收回并使用专属便条，让同一张 Offer 重新上桌。',seed:220105},
] as const;
export type ChallengeId=typeof challengeCatalog[number]['id'];
export interface ChallengeFixture {descriptor:ExperimentDescriptor;seed:number;state:MatchState;loadouts:[Loadout,Loadout];solution:{actorId:string;command:Command}[];targetId?:string;offerId?:string}
function use(state:MatchState,actorId:string,command:Command){const result=applyCommand(state,actorId,command);if(result.error)throw Error(result.error);return result.state;}
export function createChallenge(id:string,flags:ExperimentFlags=DEFAULT_EXPERIMENT_FLAGS,matchId='challenge_'+id):ChallengeFixture{
 requireExperiment(flags,'challenges');const item=challengeCatalog.find(c=>c.id===id);if(!item)throw Error('未知残局');const descriptor:ExperimentDescriptor={id,kind:'challenge',title:item.title,rules:[item.goal,'固定残局只用于练习，初始条件已公开；后续全部按正常战斗规则结算。'],version:EXPERIMENT_VERSION,standard:false};
 if(id==='CH04'||id==='CH05'){const setup=createShowcase(id==='CH04'?'SC04':'SC05','p1','p2',{seed:item.seed,matchId});setup.state.events=[{sequence:1,type:'challenge_start',text:item.title}];setup.state.eventSequence=1;return {descriptor,seed:item.seed,state:setup.state,loadouts:setup.state.players.map(p=>({playerId:p.id,name:p.name,primaryId:p.education.primaryId,secondaryId:p.education.secondaryId,offers:p.offerZone.map(o=>o.definition),baseDeck:p.baseDeck,flexDeck:p.flexDeck})) as [Loadout,Loadout],solution:setup.recommendedCommands.map(command=>({actorId:'p1',command})),targetId:setup.state.players[0].board[0].id,offerId:setup.state.players[0].board[0].offerId};}
 const loadouts:[Loadout,Loadout]=[defaultLoadout('p1','练习中的你',5),defaultLoadout('p2','练习对手',5)];let state=createMatch(loadouts,item.seed,{skipSetup:true,matchId});state.round=4;state.activePlayerId='p1';state.firstPlayerId='p1';state.topic='salary';for(const p of state.players){p.ownTurn=4;p.timeRemaining=8;p.board=[];p.hand=[];p.education.usedThisOwnTurn=false;}
 const card=(actorId:string,id:string)=>{const p=state.players.find(p=>p.id===actorId)!,cardId='challenge-card-'+state.nextId++;p.hand.push({id:cardId,definitionId:id,kind:'card',taxes:[],knownTo:[]});return cardId};
 let solution:ChallengeFixture['solution']=[],targetId:string|undefined;
 if(id==='CH01'){state=use(state,'p1',{type:'DEPLOY_OFFER',offerId:state.players[0].offerZone[0].id});state.players[1].mind=1;const unit=state.players[0].board[0];unit.deployedTurn=3;solution=[{actorId:'p1',command:{type:'ATTACK',cardId:unit.id,targetId:'p2'}}];}
 else{
  state=use(state,'p1',{type:'PLAY_CARD',cardId:card('p1',id==='CH02'?'N03':'N01')});state.players[0].board[0].deployedTurn=3;
  state.activePlayerId='p2';state=use(state,'p2',{type:'DEPLOY_OFFER',offerId:state.players[1].offerZone[0].id});state.activePlayerId='p1';const target=state.players[1].board[0];targetId=target.id;target.taunt=false;target.protectionUsed=true;
  solution=id==='CH02'?[{actorId:'p1',command:{type:'ATTACK',cardId:state.players[0].board[0].id,targetId}}]:[{actorId:'p1',command:{type:'PLAY_CARD',cardId:card('p1','N07'),targetId}},{actorId:'p1',command:{type:'ATTACK',cardId:state.players[0].board[0].id,targetId}}];
 }
 state.version=0;state.events=[{sequence:1,type:'challenge_start',text:item.title}];state.eventSequence=1;state.processedCommandIds=[];return {descriptor,seed:item.seed,state,loadouts,solution,targetId};
}
export function challengeGoal(fixture:ChallengeFixture,state:MatchState){const own=state.players[0];switch(fixture.descriptor.id){case 'CH01':return state.result?.winnerId==='p1';case 'CH02':case 'CH03':return state.events.some(e=>e.type==='retire'&&e.targetId===fixture.targetId);case 'CH04':return own.board.some(u=>u.id===fixture.targetId&&u.managed&&!u.notice)&&state.events.some(e=>e.type==='notice_expired'&&e.targetId===fixture.targetId);case 'CH05':return own.board.some(u=>u.offerId===fixture.offerId&&u.id!==fixture.targetId)&&state.events.some(e=>e.type==='bounce'&&e.targetId===fixture.targetId);default:return false;}}
export function validateChallengeSolution(fixture:ChallengeFixture,journal=fixture.solution){let state=structuredClone(fixture.state);for(const entry of journal)state=use(state,entry.actorId,entry.command);return {solved:challengeGoal(fixture,state),state};}
