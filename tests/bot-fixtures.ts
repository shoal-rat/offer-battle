import {createMatch,defaultLoadout,applyCommand,getView} from '../src/game/index';
import type {MatchState,Command,Unit} from '../src/game/types';
export function arena(primary='H03',secondary='S08'):MatchState {
 const a=defaultLoadout('a','甲',5),b=defaultLoadout('b','乙',5);a.primaryId=primary;a.secondaryId=secondary;
 const s=createMatch([a,b],42,{skipSetup:true});s.activePlayerId='a';s.round=6;s.topic='life';s.pendingChoice=null;s.result=null;s.phase='playing';
 for(const p of s.players){p.hand=[];p.board=[];p.offerZone=[];p.retort=null;p.ownTurn=3;p.timeRemaining=8;p.mind=30;p.education.usedThisOwnTurn=true;p.education.secondaryUsed=false}
 return s;
}
export function unit(s:MatchState,owner='a',attack=5,health=5,extra:Partial<Unit>={}):Unit {
 const p=s.players.find(p=>p.id===owner)!;const u:Unit={id:`fixture-${s.nextId++}`,ownerId:owner,definitionId:'N01',name:'测试角色',kind:'support',originalTime:2,baseAttack:attack,baseHealth:health,damage:0,ageStage:0,tags:[],modifiers:[],deployedTurn:p.ownTurn-1,attacked:false,rush:false,taunt:false,frozenUntilTurn:0,managed:false,equityDisabled:false,protectionUsed:false,...extra};p.board.push(u);return u;
}
export function hand(s:MatchState,definitionId:string,owner='a') {const id=`fixture-card-${s.nextId++}`;s.players.find(p=>p.id===owner)!.hand.push({id,definitionId,kind:'card',taxes:[],knownTo:[]});return id}
export function offer(s:MatchState,templateId:string,cost=4,owner='a',benefitId:string|null=null) {const id=`fixture-offer-${s.nextId++}`;s.players.find(p=>p.id===owner)!.offerZone.push({id,definition:{id,name:'测试岗位',company:'公开公司',role:'测试岗位',templateId,benefitId,originalTime:cost,baseAttack:3,baseHealth:4,annualPackage:100000,annualFixed:100000,tags:[],rulesVersion:'2.1.0'},ageStage:0,everDeployed:false,status:'available'});return id}
export function run(s:MatchState,c:Command,owner='a') {const r=applyCommand(s,owner,c);if(r.error)throw Error(r.error+' '+JSON.stringify(c));return r.state}
export const observe=(s:MatchState)=>getView(s,'a');
