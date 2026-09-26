export const EXPERIMENT_VERSION='2.2.0-exp.1';
export const DEFAULT_EXPERIMENT_FLAGS=Object.freeze({tempo:false,challenges:false,series:false,boss:false,achievements:false});
export type ExperimentFlags={ [K in keyof typeof DEFAULT_EXPERIMENT_FLAGS]:boolean };
export function experimentFlags(value:unknown):ExperimentFlags {const input=value&&typeof value==='object'?value as Record<string,unknown>:{};return Object.fromEntries(Object.keys(DEFAULT_EXPERIMENT_FLAGS).map(key=>[key,input[key]===true])) as ExperimentFlags;}
export function requireExperiment(flags:ExperimentFlags,key:keyof ExperimentFlags){if(flags[key]!==true)throw Error('请先在实验室中明确启用这一项实验');}
export interface ExperimentDescriptor {id:string;kind:'challenge'|'boss'|'series';title:string;rules:string[];version:string;standard:false}
export const seriesDescriptor=():ExperimentDescriptor=>({id:'BO3',kind:'series',title:'三局两胜 · 实验赛',rules:['先获得两胜者获胜；平局不计胜场。','整组锁定学历、三张 Offer 与基础牌，仅局间调整三张应对牌。','最多九局；仍未两胜则按胜场判定，相同为系列平局。','实验赛独立记录，不计入标准战报。'],version:EXPERIMENT_VERSION,standard:false});
