import {exampleOffers} from './offers';
import type {Loadout} from './types';

export interface StarterDeck {
 id:string; title:string; primaryId:string; secondaryId:string;
 description:string; strengths:string[]; weakness:string; loadout:Loadout;
}
interface Recipe extends Omit<StarterDeck,'loadout'> {offers:string[];base:string[];flex:string[]}
/** Eight independently playable supports keep each starting deck usable after a board clear.
 * Education supplies the upgrade theme; the four action slots avoid ally-dependent buffs.
 * Authored starting points, not rules or bonuses. Public entries never depend on an unlock.
 */
const recipes:readonly Recipe[]=[
 {
  id:'starter-01',title:'稳步入职',primaryId:'H05',secondaryId:'S05',
  description:'先用便宜助阵站住场，再让耐打的 Offer 接班。受伤后修复，比空场反复回血更划算。',
  strengths:['前两轮有便宜角色可上桌','治疗配合耐打角色，交换后仍能留场'],
  weakness:'直接压低对方心态的手段少；治疗救不了被一击带走的角色，也怕反复回手。',
  offers:['E02','E03','E06'],base:['N01','N01','N02','N02','N03','N04','N04','N05','N07','N10','N09','N18'],flex:['F02','F04','F06'],
 },
 {
  id:'starter-02',title:'先稳后进',primaryId:'H05',secondaryId:'S03',
  description:'前半局先守住底气，第 4 轮后把一次进修强化交给能够继续留场的角色。',
  strengths:['恢复与一次永久强化衔接','单点拆台和少量群伤都能用'],
  weakness:'强化只有一次；押注单个角色后遭回手会损失投入，不能只等后期。',
  offers:['E02','E03','E01'],base:['N01','N01','N02','N02','N03','N04','N05','N06','N07','N08','N18','N22'],flex:['F02','F04','F05'],
 },
 {
  id:'starter-03',title:'人脉接力',primaryId:'H04',secondaryId:'S04',
  description:'靠抽牌保持选择，用低耗时助阵与拆台逐步交换；有牌可抽，也要给上桌留时间。',
  strengths:['补牌不依赖单张行动牌','低耗时交换与回手能打断对方节奏'],
  weakness:'抽牌本身不增加场面；手牌过满会浪费，后期过度抽牌还会提早进入焦虑。',
  offers:['E07','E03','E08'],base:['N01','N01','N02','N02','N03','N03','N04','N05','N07','N10','N12','N22'],flex:['F01','F02','F06'],
 },
 {
  id:'starter-04',title:'争取这一轮',primaryId:'H03',secondaryId:'S03',
  description:'让便宜角色先站住，用本轮强化完成有价值的交换；能推进时再集中开怼主角。',
  strengths:['小角色也能换掉高排面目标','临时强化与进修有不同使用时机'],
  weakness:'主技能与进修都会消耗自己的心态，不能每轮无脑使用；群体受伤后续航有限。',
  offers:['E02','E01','E04'],base:['N01','N01','N02','N02','N03','N03','N04','N04','N07','N07','N08','N18'],flex:['F01','F04','F06'],
 },
 {
  id:'starter-05',title:'看清再出招',primaryId:'H01',secondaryId:'S01',
  description:'在需要判断时看牌加时，再用场上角色推进；知道对手有牌，不等于已经处理掉它。',
  strengths:['公开信息帮助安排后续交换','伤害、降排面与条件退场各有用途'],
  weakness:'两项技能都不直接增加身材；同牌学校加时不累加，对手空手时也无法发挥。',
  offers:['E07','E03','E08'],base:['N01','N02','N02','N03','N03','N04','N05','N06','N07','N10','N14','N20'],flex:['F01','F02','F05'],
 },
 {
  id:'starter-06',title:'远行与照应',primaryId:'H10',secondaryId:'S07',
  description:'分阶段准备一次关键强化，必要时回手救场。先判断保留强化还是保住角色，二者不能兼得。',
  strengths:['分阶段技能能留下一个中期发力点','回手可以避险，并重新利用上桌效果'],
  weakness:'准备技能要花时间，前期场面容易落后；回手会清除本次强化，强力解牌耗时偏高，抽牌也不算充裕。',
  offers:['E02','E04','E03'],base:['N01','N01','N02','N02','N03','N03','N04','N06','N07','N10','N18','N21'],flex:['F02','F05','F06'],
 },
];

/** Callers may edit every returned array/card without changing future presets or public definitions. */
export function getStarterDecks(unlocked:boolean):StarterDeck[]{
 return recipes.slice(0,unlocked?6:5).map(({offers,base,flex,...metadata})=>({
  ...metadata,strengths:[...metadata.strengths],
  loadout:{playerId:'p1',name:'秋招挑战者',primaryId:metadata.primaryId,secondaryId:metadata.secondaryId,
   offers:offers.map(id=>{const offer=exampleOffers.find(o=>o.id===id);if(!offer)throw Error(`Missing public starter offer: ${id}`);return structuredClone(offer)}),
   baseDeck:[...base],flexDeck:[...flex]},
 }));
}
