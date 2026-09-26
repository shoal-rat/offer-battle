import type {Loadout,MatchView,OfferDefinition} from './types';
import {publicArtKey,type PublicArtKey} from './artIdentity';
import {extractHighlights} from './highlights';
import {education,rules,templateById,benefitById} from './catalog';
export interface ShareChoices {company:boolean;salary:boolean;role:boolean;nickname:boolean;education:boolean}
export const PRIVATE_SHARE_DEFAULTS:ShareChoices=Object.freeze({company:false,salary:false,role:false,nickname:false,education:false});
export interface PublicOffer {kind:'offer';title:string;company?:string;salary?:string;templateId:string;artKey:PublicArtKey;effect:string;benefit?:string;cost:number;attack:number;health:number}
export interface PublicShare {version:1;kind:'offer'|'lineup'|'invitation'|'battle';title:string;subtitle:string;offers:PublicOffer[];players?:{name:string;mind:number}[];highlights?:{sequence:number;kind:string;text:string}[];roomCode?:string;schoolLabels?:string[];alt:string;filename:string}
/** This projection is the only source for PNG, preview, alt, JSON and filenames. No raw profile/log text escapes. */
export function projectOffer(offer:OfferDefinition,choices:ShareChoices=PRIVATE_SHARE_DEFAULTS):PublicOffer {
 const template=templateById[offer.templateId];
 return {kind:'offer',title:choices.role?offer.role:'我的职场角色',...(choices.company?{company:offer.company}:{}),...(choices.salary?{salary:`${(offer.annualPackage/10000).toFixed(1)} 万 / 年`}:{}),templateId:offer.templateId,artKey:publicArtKey(offer.templateId,offer.persona?.preferences.appearance),effect:template?.main_effect||'综合职业角色',...(offer.benefitId?{benefit:benefitById[offer.benefitId]?.name}:{}),cost:offer.originalTime,attack:offer.baseAttack,health:offer.baseHealth};
}
const finish=(value:Omit<PublicShare,'version'|'alt'|'filename'>):PublicShare=>({...value,version:1,alt:[value.title,value.subtitle,...value.offers.flatMap(o=>[o.title,o.company,o.salary,`${o.cost}小时 ${o.attack}排面 ${o.health}底气`]),...(value.players?.map(p=>`${p.name} 心态${p.mind}`)||[])].filter(Boolean).join(' · '),filename:`offer-battle-${value.kind}.png`});
export function projectOfferShare(offer:OfferDefinition,choices=PRIVATE_SHARE_DEFAULTS){return finish({kind:'offer',title:'把工作，变成我的底牌。',subtitle:'秋招斗兽棋 · 角色卡',offers:[projectOffer(offer,choices)]})}
export function projectLineupShare(loadout:Loadout,choices=PRIVATE_SHARE_DEFAULTS,roomCode?:string){
 const schoolLabels=choices.education?[rules.heroes.find(h=>h.id===loadout.primaryId)?.name||'第一学历',education.secondary.find(s=>s.id===loadout.secondaryId)?.name||'第二学历']:undefined;
 return finish({kind:roomCode?'invitation':'lineup',title:roomCode?'给朋友，留一个座位。':'三份 Offer，各有底气。',subtitle:choices.nickname?`${loadout.name} 的牌桌`:'一起开打 · 秋招斗兽棋',offers:loadout.offers.map(o=>projectOffer(o,choices)),...(roomCode?{roomCode}:{}),...(schoolLabels?{schoolLabels}:{})});
}
export function projectBattleShare(view:MatchView,choices=PRIVATE_SHARE_DEFAULTS):PublicShare {
 return finish({kind:'battle',title:view.result?.winnerId===view.selfId?'这一局，很有底气。':'下局，继续开打。',subtitle:`第 ${view.round} 轮 · ${view.result?.winnerId===null?'双方平局':view.result?.winnerId===view.selfId?'我方胜利':'对方胜利'}`,offers:[],players:view.players.map(p=>({name:p.id===view.selfId?(choices.nickname?p.name:'我方'):'对方',mind:p.mind})),highlights:publicEventHighlights(view)});
}
export function publicEventHighlights(view:MatchView){
 return extractHighlights(view).slice(0,4).map(({sequence,kind,text})=>({sequence,kind,text}));
}
