import {test,expect,type Page,type WebSocketRoute} from '@playwright/test';
import {createMatch,applyCommand,getView,defaultLoadout} from '../../src/game/index';
import {rules,education} from '../../src/game/catalog';
import type {Command,MatchState} from '../../src/game/types';
import {mkdir} from 'node:fs/promises';

function fixture(primaryId:string,secondaryId:string,round=3){
 const own=defaultLoadout('p1','你的角色',5),enemy=defaultLoadout('p2','公开技能对手',5);
 enemy.primaryId=primaryId;enemy.secondaryId=secondaryId;
 const state=createMatch([own,enemy],149,{skipSetup:true,matchId:'opponent-skills-'+primaryId});
 state.round=round;state.activePlayerId='p2';
 for(const p of state.players){p.ownTurn=round;p.timeRemaining=8;}
 return state;
}
function command(state:MatchState,value:Command){
 const result=applyCommand(state,state.activePlayerId,value);
 expect(result.error,JSON.stringify(value)).toBeUndefined();
 return result.state;
}
function nextOpponentTurn(state:MatchState){
 return command(command(state,{type:'END_TURN'}),{type:'END_TURN'});
}
async function wire(page:Page,initial:MatchState){
 let current=initial,channel:WebSocketRoute|undefined;
 const snapshot=()=>({
  room:{id:'opponent-skills-room',code:'SKILL2',status:'playing',mode:'friend',
   players:[{id:'p1',name:'你的角色',ready:true,connected:true,isBot:false},{id:'p2',name:'公开技能对手',ready:true,connected:true,isBot:false}],deadline:null,version:current.version},
  view:getView(current,'p1'),playerId:'p1',roomId:'opponent-skills-room',
 });
 await page.addInitScript(()=>{
  localStorage.setItem('offer-session','opponent-test-token');
  localStorage.setItem('offer-active-room','opponent-skills-room');
  localStorage.setItem('offer-sound','0');localStorage.setItem('offer-reduced','1');
 });
 await page.route('**/api/session',route=>route.fulfill({json:{token:'opponent-test-token',profile:{id:'p1',nickname:'你的角色',offers:[]}}}));
 await page.route('**/api/rooms/opponent-skills-room',route=>route.fulfill({json:snapshot()}));
 await page.routeWebSocket('**/ws?*',socket=>{channel=socket;socket.send(JSON.stringify({type:'state',...snapshot()}));});
 await page.goto('/');await expect(page.locator('.battle-page')).toBeVisible();
 await expect.poll(()=>Boolean(channel)).toBe(true);
 await page.evaluate(()=>document.fonts.ready);
 return async(next:MatchState)=>{current=next;channel!.send(JSON.stringify({type:'state',...snapshot()}));};
}
async function noHorizontalOverflow(page:Page){
 const report=await page.evaluate(()=>({
  width:innerWidth,scroll:document.documentElement.scrollWidth,
  boxes:[...document.querySelectorAll<HTMLElement>('.opponent-skills,.opponent-skill,.opponent-skill-effect')].map(el=>{
   const r=el.getBoundingClientRect();return {class:el.className,left:r.left,right:r.right,scroll:el.scrollWidth,client:el.clientWidth};
  }),
 }));
 expect(report.scroll,JSON.stringify(report)).toBeLessThanOrEqual(report.width+1);
 expect(report.boxes.length).toBeGreaterThan(0);
 for(const box of report.boxes){
  expect(box.left,JSON.stringify(box)).toBeGreaterThanOrEqual(-1);
  expect(box.right,JSON.stringify(box)).toBeLessThanOrEqual(report.width+1);
  expect(box.scroll,JSON.stringify(box)).toBeLessThanOrEqual(box.client+1);
 }
}

test('opponent skill reference exposes public costs and complete rules from the opponent perspective',async({page})=>{
 const state=fixture('H01','S09'),primary=rules.heroes.find(h=>h.id==='H01')!,secondary=education.secondary.find(h=>h.id==='S09')!;
 await wire(page,state);
 const main=page.locator('[data-opponent-skill="primary"]'),further=page.locator('[data-opponent-skill="secondary"]');
 await expect(main).toContainText(primary.skill);await expect(main).toContainText(primary.time_cost+' 小时');
 await expect(main).toContainText('看你的手牌');
 await expect(further).toContainText(secondary.skill);await expect(further).toContainText(secondary.time_cost+' 小时');
 await expect(further).toContainText('第4轮解锁');
 const enemy=getView(state,'p1').players.find(p=>p.id==='p2')!;
 expect(enemy.hand).toHaveLength(0);
 await main.click();await expect(page.getByRole('heading',{name:'知己知彼 · 对方的两项技能'})).toBeVisible();
 await expect(page.locator('.opponent-skill-perspective')).toContainText('“自己／己方”均指对手');
 await expect(page.locator('.opponent-skill-detail').nth(0).locator('p')).toHaveText(primary.text);
 await expect(page.locator('.opponent-skill-detail').nth(1).locator('p')).toHaveText(secondary.text);
 await expect(page.locator('.opponent-skill-shared')).toContainText('每个回合的 1 次学历行动');
 await page.getByRole('button',{name:'关闭',exact:true}).click();await expect(main).toBeVisible();
 await noHorizontalOverflow(page);
});

test('opponent secondary unlocks at round four and actual engine use remains spent on later turns',async({page})=>{
 let state=fixture('H04','S04');
 const publish=await wire(page,state),main=page.locator('[data-opponent-skill="primary"]'),further=page.locator('[data-opponent-skill="secondary"]');
 await expect(further).toContainText('第4轮解锁');
 state=structuredClone(state);state.round=4;state.version++;await publish(state);
 await expect(further).toContainText('每局1次');
 const before=state.players.find(p=>p.id==='p2')!.timeRemaining;
 state=command(state,{type:'USE_SECONDARY'});await publish(state);
 const enemy=state.players.find(p=>p.id==='p2')!;
 expect(enemy.education.secondaryUsed).toBe(true);
 expect(enemy.timeRemaining).toBe(before-education.secondary.find(h=>h.id==='S04')!.time_cost);
 await expect(further).toContainText('本局已用');await expect(further).toHaveClass(/used/);
 await expect(main).toContainText('本回合已用');
 await further.click();
 await expect(page.locator('.opponent-skill-detail').nth(1).locator('p')).toHaveText(education.secondary.find(h=>h.id==='S04')!.text);
 await page.getByRole('button',{name:'关闭',exact:true}).click();
 state=nextOpponentTurn(state);await publish(state);
 await expect(further).toContainText('本局已用');await expect(main).toContainText('每回合1次');
});

test('390px opponent JLU reference tracks real sign-ins, ultimate and meal without horizontal overflow',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 let state=fixture('H10','S10',4);
 const deployment=getView(state,'p2').legalActions.find(action=>action.type==='DEPLOY_OFFER');
 expect(deployment).toBeDefined();state=command(state,deployment!);
 state.players.find(p=>p.id==='p2')!.timeRemaining=8;
 const offer=state.players.find(p=>p.id==='p2')!.board.find(unit=>unit.kind==='offer')!;
 const publish=await wire(page,state),main=page.locator('[data-opponent-skill="primary"]');
 await expect(main).toContainText('校友集合');await expect(main).toContainText('已签到0/2次');await noHorizontalOverflow(page);
 state=command(state,{type:'USE_PRIMARY'});await publish(state);await expect(main).toContainText('已签到1/2次');
 state=nextOpponentTurn(state);state=command(state,{type:'USE_PRIMARY'});await publish(state);
 await expect(main).toContainText('全校撑腰');await expect(main).toContainText('+4排面、+4底气上限');await noHorizontalOverflow(page);
 state=nextOpponentTurn(state);
 const attackBefore=getView(state,'p1').players.find(p=>p.id==='p2')!.board.find(unit=>unit.id===offer.id)!.attack;
 state=command(state,{type:'USE_PRIMARY',targetId:offer.id});await publish(state);
 expect(getView(state,'p1').players.find(p=>p.id==='p2')!.board.find(unit=>unit.id===offer.id)!.attack).toBe(attackBefore+4);
 await expect(main).toContainText('校友饭局');await expect(main).toContainText('自身恢复2心态');await noHorizontalOverflow(page);
 await main.click();await expect(page.locator('.opponent-skill-detail').first().locator('h3')).toContainText('校友饭局');
 await page.getByRole('button',{name:'关闭',exact:true}).click();
 await expect(page.locator('.battle-effects')).toHaveAttribute('data-busy','false');
 await mkdir('evidence/screenshots/opponent-skills',{recursive:true});
 await page.screenshot({path:'evidence/screenshots/opponent-skills/jlu-meal-390.png'});
});
