import {exampleOffers} from './offers';
import {rules} from './catalog';
import {getStarterDecks} from './starterDecks';
import type {Loadout} from './types';

export type BotStrategy='aggressive'|'control'|'growth';
export interface BotOpponent {name:string;loadout:Loadout;templateId:string}

/** Authored 12-card base decks. Every practice opponent is assembled from these proven pieces,
 * so a random table is still a coherent deck; only the combination changes from match to match. */
interface BaseTemplate {id:string;title:string;style:BotStrategy;cards:readonly string[]}
const presetBases=rules.base_deck_presets as Record<string,string[]>;
const starterStyles:Record<string,BotStrategy>={'starter-01':'growth','starter-02':'growth','starter-03':'control','starter-04':'aggressive','starter-05':'control','starter-06':'growth'};
const BASES:readonly BaseTemplate[]=[
 {id:'tempo',title:'抢节奏',style:'aggressive',cards:presetBases['抢节奏']},
 {id:'late',title:'稳到后期',style:'growth',cards:presetBases['稳到后期']},
 {id:'churn',title:'反复拆台',style:'control',cards:presetBases['反复拆台']},
 ...getStarterDecks(true).map(deck=>({id:deck.id,title:deck.title,style:starterStyles[deck.id]??'growth',cards:deck.loadout.baseDeck})),
];
/** Weights lean each personality towards fitting Offers, schools and response cards without forbidding any. */
const OFFER_WEIGHTS:Record<BotStrategy,Record<string,number>>={
 aggressive:{E01:5,E05:3,E06:5,E08:4,E03:2,E04:1,E02:1,E07:1,E09:1},
 control:{E03:4,E08:4,E04:2,E09:2,E02:2,E01:2,E06:1,E07:2,E05:1},
 growth:{E04:5,E09:3,E02:3,E07:3,E08:2,E03:2,E05:3,E01:1,E06:1},
};
const PRIMARY_WEIGHTS:Record<BotStrategy,Record<string,number>>={
 aggressive:{H03:5,H06:4,H02:2,H04:2,H10:2,H01:1,H05:1,H07:1,H08:2,H09:1},
 control:{H01:5,H09:3,H04:3,H07:3,H02:2,H05:1,H03:1,H06:1,H08:1,H10:2},
 growth:{H05:5,H10:4,H08:3,H02:3,H04:2,H06:2,H01:1,H03:1,H07:1,H09:1},
};
const SECONDARY_WEIGHTS:Record<BotStrategy,Record<string,number>>={
 aggressive:{S03:5,S06:4,S09:4,S08:2,S10:2,S00:1,S01:1,S02:1,S04:1,S05:1,S07:1},
 control:{S01:5,S09:4,S04:3,S07:3,S00:2,S02:1,S03:1,S05:1,S06:1,S08:1,S10:1},
 growth:{S05:5,S08:4,S10:3,S02:3,S00:2,S03:2,S04:1,S06:1,S07:1,S01:1,S09:1},
};
const FLEX_WEIGHTS:Record<BotStrategy,Record<string,number>>={
 aggressive:{F01:4,F02:4,F05:3,F06:1,F04:1,F03:1},
 control:{F04:4,F02:3,F01:3,F06:3,F05:2,F03:1},
 growth:{F04:4,F06:4,F03:2,F05:2,F02:2,F01:1},
};
const NAMES:Record<BotStrategy,readonly string[]>={
 aggressive:['卷王','冲刺学长','抢跑同学','Offer 收割机','早八战神','面试连胜学姐'],
 control:['合同大师','面霸学姐','流程专家','HR 老油条','群面控场王','背调小能手'],
 growth:['长期主义','稳健师兄','慢热同学','体制内学姐','读博再说','十年规划党'],
};
const LABEL:Record<BotStrategy,string>={aggressive:'进攻型',control:'控制型',growth:'养成型'};

/** Small deterministic generator so a room's seed reproduces its opponent. */
function generator(seed:number){let state=(seed>>>0)||0x9e3779b9;return ()=>{state=(state+0x6D2B79F5)>>>0;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296}}
function weighted<T extends string>(random:()=>number,weights:Record<T,number>,exclude:ReadonlySet<string>=new Set()):T{
 const entries=(Object.entries(weights) as [T,number][]).filter(([id,w])=>w>0&&!exclude.has(id));
 let roll=random()*entries.reduce((sum,[,w])=>sum+w,0);
 for(const [id,w]of entries){roll-=w;if(roll<0)return id}
 return entries.at(-1)![0];
}
/** A fresh practice opponent: one authored base deck (usually matching its personality), three Offers,
 * a school pairing and three response cards, all drawn from public templates. */
export function botOpponent(strategy:BotStrategy,seed:number,playerId='p2'):BotOpponent{
 const random=generator(seed);
 // Two in three opponents play a base deck of their own personality; the rest borrow another style for variety.
 const fitting=BASES.filter(base=>base.style===strategy),others=BASES.filter(base=>base.style!==strategy);
 const pool=random()<.67?fitting:others,base=pool[Math.floor(random()*pool.length)];
 const offers=new Set<string>();while(offers.size<3)offers.add(weighted(random,OFFER_WEIGHTS[strategy],offers));
 const flex=new Set<string>();while(flex.size<3)flex.add(weighted(random,FLEX_WEIGHTS[strategy],flex));
 const primaryId=weighted(random,PRIMARY_WEIGHTS[strategy]),secondaryId=weighted(random,SECONDARY_WEIGHTS[strategy]);
 const nickname=NAMES[strategy][Math.floor(random()*NAMES[strategy].length)],name=`${nickname} · ${LABEL[strategy]}`;
 return {name,templateId:`${base.id}/${primaryId}${secondaryId}/${[...offers].join('')}`,loadout:{
  playerId,name,primaryId,secondaryId,
  offers:[...offers].map(id=>structuredClone(exampleOffers.find(offer=>offer.id===id)!)),
  baseDeck:[...base.cards],flexDeck:[...flex],
 }};
}
export const BOT_BASE_TEMPLATES=BASES.map(({id,title,style})=>({id,title,style}));
