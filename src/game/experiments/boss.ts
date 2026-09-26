import {createMatch,applyCommand} from '../engine';
import {defaultLoadout} from '../offers';
import type {Loadout} from '../types';
import {DEFAULT_EXPERIMENT_FLAGS,EXPERIMENT_VERSION,requireExperiment,type ExperimentFlags,type ExperimentDescriptor} from './features';
export const bossCatalog=[{id:'BOSS01',title:'项目守门人',rules:['关卡从第四轮开始；双方本轮各有八小时。','守门人初始心态 30，预先上桌一张标准 Offer；你以 24 心态挑战。','之后按正常规则运行，守门人只能读取自己的合法玩家视图。','这是公开条件的非对称关卡，不代表标准困难人机。']} ] as const;
export function createBoss(id:string,flags:ExperimentFlags=DEFAULT_EXPERIMENT_FLAGS,matchId='boss_'+id){
 requireExperiment(flags,'boss');const boss=bossCatalog.find(b=>b.id===id);if(!boss)throw Error('未知关卡');const seed=220401,loadouts:[Loadout,Loadout]=[defaultLoadout('p1','挑战者',5),defaultLoadout('p2',boss.title,6)];let state=createMatch(loadouts,seed,{skipSetup:true,matchId});state.round=4;state.firstPlayerId='p1';state.activePlayerId='p2';for(const p of state.players){p.ownTurn=4;p.timeRemaining=8;}state.players[1].mind=30;state.players[0].mind=24;
 const deployed=applyCommand(state,'p2',{type:'DEPLOY_OFFER',offerId:state.players[1].offerZone[0].id});if(deployed.error)throw Error(deployed.error);state=deployed.state;state.activePlayerId='p1';state.players[1].timeRemaining=8;state.version=0;state.events=[{sequence:1,type:'boss_start',text:boss.title}];state.eventSequence=1;state.processedCommandIds=[];
 return {descriptor:{id,kind:'boss',title:boss.title,rules:[...boss.rules],version:EXPERIMENT_VERSION,standard:false} satisfies ExperimentDescriptor,seed,state,loadouts};
}
