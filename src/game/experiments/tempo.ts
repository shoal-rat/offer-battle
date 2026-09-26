import {createMatch,applyCommand} from '../engine';
import {stableHash} from '../offers';
import type {Command,Loadout,MatchState} from '../types';
import {DEFAULT_EXPERIMENT_FLAGS,EXPERIMENT_VERSION,requireExperiment,type ExperimentFlags} from './features';
export interface TempoVariant {firstPlayerStartingMindPenalty:0|1}
export interface ExperimentRecord {version:string;kind:'tempo';variant:TempoVariant;seed:number;loadouts:[Loadout,Loadout];initialState:MatchState;journal:{actorId:string;command:Command}[]}
export function createTempoTrial(loadouts:[Loadout,Loadout],seed:number,variant:TempoVariant,evidence:{baselinePairs:number;replaysVerified:boolean},flags:ExperimentFlags=DEFAULT_EXPERIMENT_FLAGS):ExperimentRecord{
 requireExperiment(flags,'tempo');if(Object.keys(variant).length!==1||![0,1].includes(variant.firstPlayerStartingMindPenalty))throw Error('节奏实验每次只能改变一项已声明数值');if(variant.firstPlayerStartingMindPenalty&&(!Number.isSafeInteger(evidence.baselinePairs)||evidence.baselinePairs<1||!evidence.replaysVerified))throw Error('先完成配对基线与回放验证，再运行变量实验');
 const initialState=createMatch(loadouts,seed,{skipSetup:true,matchId:`tempo-${seed}-${variant.firstPlayerStartingMindPenalty}`});initialState.players.find(p=>p.id===initialState.firstPlayerId)!.mind-=variant.firstPlayerStartingMindPenalty;return {version:EXPERIMENT_VERSION,kind:'tempo',variant:{...variant},seed,loadouts:structuredClone(loadouts),initialState,journal:[]};
}
export function replayTempo(record:ExperimentRecord){if(record.version!==EXPERIMENT_VERSION)throw Error('不支持的实验版本');const expected=createTempoTrial(record.loadouts,record.seed,record.variant,{baselinePairs:1,replaysVerified:true},{...DEFAULT_EXPERIMENT_FLAGS,tempo:true});if(stableHash(expected.initialState)!==stableHash(record.initialState))throw Error('实验初始状态不匹配');let state=structuredClone(record.initialState);for(const entry of record.journal){const result=applyCommand(state,entry.actorId,entry.command);if(result.error)throw Error('实验指令不合法');state=result.state;}return state;}
