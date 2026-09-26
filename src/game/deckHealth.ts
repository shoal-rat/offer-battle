import {cardById} from './catalog';
import type {Loadout} from './types';
export function overseasPrimary(rank:number){if(!Number.isSafeInteger(rank)||rank<1)throw Error('请输入有效的正整数排名');return rank<=50?'H07':rank<=100?'H08':'H09'}
export function deckHealth(loadout:Loadout){
 const cards=[...loadout.baseDeck,...loadout.flexDeck].map(id=>cardById[id]).filter(Boolean),warnings:string[]=[];
 if(loadout.offers.length!==3)warnings.push(`Offer 还需选择 ${Math.max(0,3-loadout.offers.length)} 张`);
 if(loadout.baseDeck.length!==12)warnings.push(`基础牌 ${loadout.baseDeck.length}/12`);
 if(loadout.flexDeck.length!==3)warnings.push(`应对牌 ${loadout.flexDeck.length}/3`);
 const early=loadout.baseDeck.map(id=>cardById[id]).filter(c=>c&&c.time_cost<=2).length;
 if(early<3)warnings.push('基础牌中 2 小时以内少于 3 张，早期可用选择较少');
 return {warnings,early,support:cards.filter(c=>c.type==='support').length,action:cards.filter(c=>c.type==='action').length,retort:cards.filter(c=>c.type==='retort').length,curve:Array.from({length:8},(_,i)=>({cost:i+1,count:cards.filter(c=>c.time_cost===i+1).length})),offerCosts:loadout.offers.map(o=>o.originalTime)};
}
