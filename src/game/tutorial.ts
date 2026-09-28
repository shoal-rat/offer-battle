import type {Command,MatchState} from './types';
import {createMatch,applyCommand} from './engine';
import {getView} from './views';
import {defaultLoadout,exampleOffers} from './offers';

export type LessonId='L01'|'L02'|'L03'|'L04'|'L05';
export interface TutorialProgress {lessonId:LessonId;stepIndex:number}
export interface TutorialView extends TutorialProgress {title:string;stepCount:number;objective:string;coachLine:string;hint:string;completed:boolean;allowedCommands:Command[];nextLessonId:LessonId|null;summary:string[];focus:{zone:'offer'|'hand'|'skill'|'target'|'endTurn';ids:string[]}}
type Step={objective:string;coachLine:string;hint:string;zone:TutorialView['focus']['zone'];command:(s:MatchState)=>Command};
const own=(s:MatchState)=>s.players[0],enemy=(s:MatchState)=>s.players[1];
const unit=(s:MatchState,side:0|1,id:string)=>s.players[side].board.find(u=>u.definitionId===id)!;
const hand=(s:MatchState,id:string)=>own(s).hand.find(h=>h.definitionId===id)!.id;
const end:Command={type:'END_TURN'};
const steps:Record<LessonId,Step[]>={
 L01:[
  {objective:'花 3 小时，让国企综合岗上桌',coachLine:'先把第一份底气摆上来。左上角是耗时；上桌后，时间会立即扣除。',hint:'把「我的 Offer」里的国企综合岗拖到牌桌上。新上桌的角色要等到自己的下一回合才能开怼。',zone:'offer',command:()=>({type:'DEPLOY_OFFER',offerId:'E02'})},
  {objective:'结束回合，等角色准备好',coachLine:'现在时间花完了。放心结束回合，我会让你看到时间补满和角色就绪。',hint:'点击金色「结束回合」。导师只会结束自己的回合。',zone:'endTurn',command:()=>end},
  {objective:'用国企综合岗开怼导师主角',coachLine:'它脚下亮了，说明可以行动。排面决定伤害；主角的心态归零就输了。',hint:'先点击己方国企综合岗，再选择导师主角。',zone:'target',command:s=>({type:'ATTACK',cardId:unit(s,0,'E02').id,targetId:enemy(s).id})},
  {objective:'花 1 小时，打出实习搭子',coachLine:'开怼不花时间，每个角色通常每回合一次。剩下的时间可以继续铺场。',hint:'把手牌「实习搭子」拖到牌桌上。助阵角色也能在下回合开怼。',zone:'hand',command:s=>({type:'PLAY_CARD',cardId:hand(s,'N01')})},
 ],
 L02:[
  {objective:'用打听工时削弱挡话的老员工',coachLine:'老员工有「挡话」，你不能绕过它去开怼主角。先用一张行动牌处理它。',hint:'把手牌「打听工时」拖到发光的敌方老员工身上，纸飞机就会飞过去。它会失去 3 点底气。',zone:'hand',command:s=>({type:'PLAY_CARD',cardId:hand(s,'N10'),targetId:unit(s,1,'N05').id})},
  {objective:'用制造业研发击退老员工',coachLine:'它的底气已经降到制造业研发的排面以内。角色交锋时，双方会同时用排面伤害对方。',hint:'选择己方制造业研发，再点击敌方老员工；你的角色也会受伤。',zone:'target',command:s=>({type:'ATTACK',cardId:unit(s,0,'E04').id,targetId:unit(s,1,'N05').id})},
  {objective:'挡话退场后，开怼导师主角',coachLine:'路让出来了。另一个还没行动的角色，现在可以直接冲主角。',hint:'选择己方国企综合岗，再选择导师主角。',zone:'target',command:s=>({type:'ATTACK',cardId:unit(s,0,'E02').id,targetId:enemy(s).id})},
 ],
 L03:[
  {objective:'用外企产品经理抬价，谈薪上桌大厂算法岗',coachLine:'你有 4 小时，但大厂算法岗需要 5。把另一份从未上桌的 Offer 当筹码，能省下它一半耗时（向下取整）。',hint:'点击「谈薪」；选择外企产品经理作筹码、让大厂算法岗上桌。本次花 5 − ⌊4/2⌋ = 3 小时。',zone:'offer',command:()=>({type:'NEGOTIATE',offerId:'E01',sacrificeId:'E03'})},
  {objective:'结束回合，让谈来的 Offer 就绪',coachLine:'筹码已经消耗，一局只能谈薪一次。现在等这位一线卷王准备好。',hint:'点击「结束回合」。岗位名是大厂算法岗，玩法类型仍是一线卷王。',zone:'endTurn',command:()=>end},
  {objective:'用大厂算法岗开怼实习搭子',coachLine:'一线卷王排面很足，但主动开怼会让自己失去 1 点心态。高工资有代价，岗位名和玩法类型也各司其职。',hint:'选择大厂算法岗，再选择敌方实习搭子；留意自己的心态变化。',zone:'target',command:s=>({type:'ATTACK',cardId:unit(s,0,'E01').id,targetId:unit(s,1,'N01').id})},
 ],
 L04:[
  {objective:'发动主技能「再卷一轮」，强化国企综合岗',coachLine:'主学历决定常用打法。这招花 1 小时，给角色本回合 +2 排面，但自己失去 1 点心态。',hint:'点击主技能，再选择己方国企综合岗。',zone:'skill',command:s=>({type:'USE_PRIMARY',targetId:unit(s,0,'E02').id})},
  {objective:'结束回合，恢复本回合的学历行动次数',coachLine:'主技能与进修共用每回合一次的学历行动。刚用了主技能，这回合就不能再用进修。',hint:'点击「结束回合」，下一回合再体验第二学历。',zone:'endTurn',command:()=>end},
  {objective:'发动进修「答辩稳过」，恢复国企综合岗',coachLine:'进修从第 4 轮开放，而且每局只能使用一次。这张卡已经受伤，正适合恢复底气。',hint:'点击第二学历技能，选择己方受伤的国企综合岗；主角也会恢复心态。',zone:'skill',command:s=>({type:'USE_SECONDARY',targetId:unit(s,0,'E02').id})},
  {objective:'用恢复好的国企综合岗开怼导师',coachLine:'学历行动和角色开怼互不占用次数。现在把修复好的场面转成压力。',hint:'选择国企综合岗，再选择导师主角。',zone:'target',command:s=>({type:'ATTACK',cardId:unit(s,0,'E02').id,targetId:enemy(s).id})},
 ],
 L05:[
  {objective:'结束回合，观察 31 岁成长到 35 岁',coachLine:'Offer 每逢自己的回合开始都会长一档年龄：22、27、31、35。年龄不是自动退场倒计时。',hint:'点击「结束回合」。导师让过后，观察大厂算法岗的年龄牌。',zone:'endTurn',command:()=>end},
  {objective:'再结束一次回合，观察优化通知',coachLine:'35 岁的一线 Offer 会成为「三十五岁」的目标。我现在会演示挂通知，给你完整的应对窗口。',hint:'点击「结束回合」。导师只会合法打出「三十五岁」并交还回合。',zone:'endTurn',command:()=>end},
  {objective:'打出转管理，让大厂算法岗离开一线',coachLine:'通知并非立即退场：到发通知者下回合开始才检查。转管理会失去一线标签，代价是 −2 排面。',hint:'把手牌「转管理」拖到己方收到通知的大厂算法岗身上。',zone:'hand',command:s=>({type:'PLAY_CARD',cardId:hand(s,'F03'),targetId:unit(s,0,'E01').id})},
  {objective:'结束回合，亲眼看到优化通知失效',coachLine:'这次让规则自己验证：当导师下回合开始，角色已不在一线，通知就会失效。',hint:'点击「结束回合」。保住角色后，你就完成了全部入门课程。',zone:'endTurn',command:()=>end},
 ],
};
export const tutorialCatalog=[
 {id:'L01',title:'第一份底气',summary:['时间用于出牌，每回合开始补满。','新上桌的角色通常下回合才能开怼。','每个角色通常每回合开怼一次；主角心态归零即输。']},
 {id:'L02',title:'有话好好挡',summary:['挡话会阻止角色绕过去开怼其他目标。','把牌拖出手牌区即可出牌；直接拖到发光目标上会立刻命中，也可以松手后用纸飞机瞄准。单击只会拿近细看。','角色交锋双方同时受伤，底气归零就退场。']},
 {id:'L03',title:'另一份筹码',summary:['谈薪消耗一份从未上桌的 Offer，每局一次。','减费等于筹码原始耗时的一半，向下取整。','岗位名保留具体工作；玩法类型决定技能与代价。']},
 {id:'L04',title:'母校来撑腰',summary:['主技能通常每回合可用。','进修第 4 轮解锁，每局一次。','主技能与进修共享每回合一次学历行动。']},
 {id:'L05',title:'过了三十五',summary:['年龄只在自己的回合开始成长，35 岁不会自动退场。','优化通知在发起者的下个回合开始才检查。','转管理用 2 点排面换掉一线标签，能让通知失效。']},
] as const;
export function isLessonId(value:unknown):value is LessonId{return tutorialCatalog.some(x=>x.id===value)}
const semanticKeys=['type','cardId','offerId','targetId','targetIds','sacrificeId','choiceId','optionId','cardIds','flexIds','topic','benefitChoice'] as const;
export function sameTutorialCommand(a:Command,b:Command){return semanticKeys.every(k=>JSON.stringify(a[k])===JSON.stringify(b[k]));}
export function getTutorialView(state:MatchState,progress:TutorialProgress):TutorialView{
 const index=tutorialCatalog.findIndex(x=>x.id===progress.lessonId),lesson=tutorialCatalog[index],lessonSteps=steps[progress.lessonId],completed=progress.stepIndex>=lessonSteps.length,step=lessonSteps[progress.stepIndex];
 let allowedCommands:Command[]=[];if(step){const expected=step.command(state);allowedCommands=getView(state,own(state).id).legalActions.filter(c=>sameTutorialCommand(c,expected));}
 return {...progress,title:lesson.title,stepCount:lessonSteps.length,completed,objective:step?.objective??(progress.lessonId==='L05'?'毕业了，带着自己的 Offer 开打吧。':'本课完成，把这招带到下一课。'),coachLine:step?.coachLine??'做得好，每一步都是你自己打出来的。',hint:step?.hint??'可以重玩这一课，或继续下一课。',allowedCommands,nextLessonId:tutorialCatalog[index+1]?.id??null,summary:[...lesson.summary],focus:{zone:step?.zone??'endTurn',ids:allowedCommands.flatMap(c=>[c.cardId,c.offerId,c.targetId,c.sacrificeId].filter((x):x is string=>!!x))}};
}
/** Fixed public lesson positions. Only initialization sets up a board; every later action uses the standard engine. */
export function createTutorial(lessonId:LessonId,options:{matchId?:string;name?:string}={}){
 if(!isLessonId(lessonId))throw Error('未知教程课程');
 const a=defaultLoadout('p1',options.name??'入门中的你',5),b=defaultLoadout('p2','前辈 · 秋招导师',5);
 a.offers=['E01','E02',lessonId==='L02'?'E04':'E03'].map(id=>structuredClone(exampleOffers.find(o=>o.id===id)!));a.primaryId='H03';a.secondaryId='S05';b.primaryId='H05';b.secondaryId='S00';
 let state=createMatch([a,b],714025,{skipSetup:true,matchId:options.matchId??`tutorial-${lessonId}`});state.round=lessonId==='L01'?3:lessonId==='L05'?5:4;state.firstPlayerId='p1';state.activePlayerId='p1';state.topic='life';
 for(const p of state.players){p.ownTurn=state.round;p.timeRemaining=8;p.hand=[];p.board=[];p.mind=24;p.actedThisTurn=false;p.education.usedThisOwnTurn=false;}
 function addCard(side:0|1,id:string){const card={id:`tutorial-card-${state.nextId++}`,definitionId:id,kind:'card' as const,taxes:[],knownTo:[]};state.players[side].hand.push(card);return card.id;}
 function setup(side:0|1,c:Command){state.activePlayerId=state.players[side].id;state.players[side].timeRemaining=8;const next=applyCommand(state,state.activePlayerId,c);if(next.error)throw Error(`教程局面无效：${next.error}`);state=next.state;}
 function deploy(side:0|1,id:string){setup(side,{type:'DEPLOY_OFFER',offerId:id});const u=unit(state,side,id);u.deployedTurn=state.players[side].ownTurn-1;return u;}
 function support(side:0|1,id:string){setup(side,{type:'PLAY_CARD',cardId:addCard(side,id)});const u=unit(state,side,id);u.deployedTurn=state.players[side].ownTurn-1;return u;}
 if(lessonId==='L01')addCard(0,'N01');
 if(lessonId==='L02'){deploy(0,'E04');deploy(0,'E02');const defender=support(1,'N05');defender.damage=Math.max(0,defender.baseHealth-3-unit(state,0,'E04').baseAttack);support(1,'N01');addCard(0,'N10');}
 if(lessonId==='L03')support(1,'N01');
 if(lessonId==='L04'){deploy(0,'E02').damage=2;}
 if(lessonId==='L05'){const u=deploy(0,'E01');u.ageStage=2;own(state).offerZone.find(o=>o.id==='E01')!.ageStage=2;addCard(0,'F03');addCard(1,'F01');}
 state.activePlayerId='p1';own(state).timeRemaining=state.round;enemy(state).timeRemaining=state.round;for(const p of state.players){p.actedThisTurn=false;p.education.usedThisOwnTurn=false;}
 state.version=0;state.events=[];state.eventSequence=0;state.processedCommandIds=[];
 return {state,loadouts:[a,b],progress:{lessonId,stepIndex:0} satisfies TutorialProgress};
}
/** Called only after the expected player action succeeded. Returned actions are journaled just like human commands. */
export function tutorialCoachCommands(state:MatchState,progress:TutorialProgress):Command[]{
 if(state.activePlayerId!==enemy(state).id)return [];
 if(progress.lessonId==='L05'&&progress.stepIndex===1){const card=enemy(state).hand.find(h=>h.definitionId==='F01');if(!card)throw Error('教程导师缺少优化通知');return [{type:'PLAY_CARD',cardId:card.id,targetId:unit(state,0,'E01').id},end];}
 return [end];
}
