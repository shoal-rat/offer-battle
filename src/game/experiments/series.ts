import {currentLoadout} from '../offer-compat';
import type {Loadout,MatchState} from '../types';
import {DEFAULT_EXPERIMENT_FLAGS,EXPERIMENT_VERSION,requireExperiment,type ExperimentFlags} from './features';
export interface SeriesState {id:string;version:string;status:'playing'|'between'|'finished';gameIndex:number;wins:Record<string,number>;draws:number;winnerId:string|null;matchIds:string[];lockedLoadouts:[Loadout,Loadout];nextFlex:Record<string,string[]>}
export function createSeries(loadouts:[Loadout,Loadout],flags:ExperimentFlags=DEFAULT_EXPERIMENT_FLAGS,id='series_'+crypto.randomUUID()):SeriesState{
 requireExperiment(flags,'series');const locked=loadouts.map(currentLoadout) as [Loadout,Loadout];if(locked[0].playerId===locked[1].playerId)throw Error('系列赛需要两个不同席位');return {id,version:EXPERIMENT_VERSION,status:'playing',gameIndex:1,wins:Object.fromEntries(locked.map(l=>[l.playerId,0])),draws:0,winnerId:null,matchIds:[],lockedLoadouts:locked,nextFlex:Object.fromEntries(locked.map(l=>[l.playerId,[...l.flexDeck]]))};
}
export function recordSeriesResult(source:SeriesState,matchId:string,result:MatchState['result']):SeriesState{
 if(source.matchIds.includes(matchId))return structuredClone(source);if(!result||source.status!=='playing')throw Error('当前系列局尚不可结算');const next=structuredClone(source);if(result.winnerId!==null&&!Object.hasOwn(next.wins,result.winnerId))throw Error('胜方不是系列赛参与者');next.matchIds.push(matchId);if(result.winnerId)next.wins[result.winnerId]++;else next.draws++;
 const winner=Object.keys(next.wins).find(id=>next.wins[id]>=2);next.status=winner||next.matchIds.length>=9?'finished':'between';next.winnerId=winner??null;if(next.status==='finished'&&!winner){const [a,b]=Object.keys(next.wins);next.winnerId=next.wins[a]===next.wins[b]?null:next.wins[a]>next.wins[b]?a:b;}return next;
}
export function setSeriesFlex(source:SeriesState,playerId:string,flex:string[]):SeriesState{
 if(source.status!=='between'||!Object.hasOwn(source.wins,playerId))throw Error('只能在系列赛局间调整应对牌');if(!Array.isArray(flex)||flex.length!==3||new Set(flex).size!==3||flex.some(id=>!/^F0[1-6]$/.test(id)))throw Error('请选择三张不同的应对牌');const next=structuredClone(source);next.nextFlex[playerId]=[...flex];return next;
}
export function seriesNextLoadouts(source:SeriesState){if(source.status!=='between')throw Error('本组系列赛不能开始下一局');const series=structuredClone(source);series.gameIndex++;series.status='playing';return {series,loadouts:series.lockedLoadouts.map(l=>({...structuredClone(l),flexDeck:[...series.nextFlex[l.playerId]]})) as [Loadout,Loadout]};}
/** Public progress deliberately excludes locked loadouts, salaries, hand/deck contents and IDs. */
export function seriesSummary(series:SeriesState){return {id:series.id,version:series.version,status:series.status,gameIndex:series.gameIndex,wins:{...series.wins},draws:series.draws,winnerId:series.winnerId};}
/** A ready request may change flex cards, never the locked base collection or schools. */
export function seriesReady(source:SeriesState,playerId:string,input:any){
 const locked=source.lockedLoadouts.find(l=>l.playerId===playerId);if(!locked)throw Error('没有这个系列赛席位');
 if(input?.loadout){const value=input.loadout,ids=value.offerIds??value.offers?.map((o:any)=>typeof o==='string'?o:o.id);if(value.primaryId&&value.primaryId!==locked.primaryId||value.secondaryId&&value.secondaryId!==locked.secondaryId||value.baseDeck&&JSON.stringify(value.baseDeck)!==JSON.stringify(locked.baseDeck)||ids&&JSON.stringify(ids)!==JSON.stringify(locked.offers.map(o=>o.id)))throw Error('系列赛已锁定学历、Offer 和基础牌；局间只能调整应对牌');}
 const flex=input?.flexDeck??input?.loadout?.flexDeck;return flex?setSeriesFlex(source,playerId,flex):structuredClone(source);
}
