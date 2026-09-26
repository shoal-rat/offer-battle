import {test,expect,type Page,type WebSocketRoute} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {createMatch,applyCommand,getView,defaultLoadout} from '../../src/game/index';
import type {MatchState,Command} from '../../src/game/types';

test.use({reducedMotion:'no-preference'});

interface DefeatFrame {
 at:number;flight:boolean;defeat:boolean;result:boolean;
 outcome?:string;loserId?:string;stage?:string;
 portrait:{x:number;y:number;width:number;height:number}|null;
}

function apply(state:MatchState,playerId:string,command:Command){
 const applied=applyCommand(state,playerId,command);
 expect(applied.error,JSON.stringify(command)).toBeUndefined();
 return applied.state;
}
function initial(id='defeat-match'){
 return createMatch([defaultLoadout('p1','你的角色',5),defaultLoadout('p2','终局对手',5)],412,{skipSetup:true,matchId:id});
}
function lethal(loserId:'p1'|'p2'){
 const winnerId=loserId==='p1'?'p2':'p1';let state=initial('defeat-'+loserId);
 state.round=5;state.activePlayerId=winnerId;
 for(const player of state.players){player.ownTurn=5;player.timeRemaining=8;player.board=[];player.retort=null;}
 state.players.find(p=>p.id===winnerId)!.hand.push({id:'finisher-card',definitionId:'N01',kind:'card',taxes:[],knownTo:[]});
 state=apply(state,winnerId,{type:'PLAY_CARD',cardId:'finisher-card'});
 const finisher=state.players.find(p=>p.id===winnerId)!.board[0];finisher.deployedTurn=4;
 state.players.find(p=>p.id===loserId)!.mind=1;
 // Everything before the lethal command is already visible when this client connects.
 state.events=[];state.eventSequence=0;state.version=0;
 const finished=apply(state,winnerId,{type:'ATTACK',cardId:finisher.id,targetId:loserId});
 expect(finished.result?.winnerId).toBe(winnerId);
 expect(getView(finished,'p1').visualCues.map(c=>c.kind)).toEqual(expect.arrayContaining(['attack','result']));
 return {state,finished};
}
function draw(){
 const state=initial('defeat-draw');state.round=12;
 state.activePlayerId=state.players.find(p=>p.id!==state.firstPlayerId)!.id;
 for(const player of state.players){player.ownTurn=12;player.mind=15;player.board=[];player.retort=null;}
 state.events=[];state.eventSequence=0;state.version=0;
 const finished=apply(state,state.activePlayerId,{type:'END_TURN'});
 expect(finished.phase).toBe('finished');expect(finished.result?.winnerId).toBeNull();
 return {state,finished};
}
async function wire(page:Page,state:MatchState,reduced=false){
 let current=state,channel:WebSocketRoute|undefined;
 const snapshot=()=>({room:{id:'defeat-room',code:'FINAL2',status:current.phase==='finished'?'finished':'playing',mode:'friend',players:current.players.map(p=>({id:p.id,name:p.name,ready:true,connected:true,isBot:false})),deadline:null,version:current.version},view:getView(current,'p1'),playerId:'p1',roomId:'defeat-room'});
 await page.addInitScript(({reduced})=>{
  localStorage.setItem('offer-session','defeat-test-token');localStorage.setItem('offer-active-room','defeat-room');localStorage.setItem('offer-sound','0');localStorage.setItem('offer-reduced',reduced?'1':'0');
 },{reduced});
 await page.route('**/api/session',route=>route.fulfill({json:{token:'defeat-test-token',profile:{id:'p1',nickname:'你的角色',offers:[]}}}));
 await page.route('**/api/rooms/defeat-room',route=>route.fulfill({json:snapshot()}));
 await page.routeWebSocket('**/ws?*',socket=>{channel=socket;socket.send(JSON.stringify({type:'state',...snapshot()}));});
 await page.goto('/');await expect(page.locator('.battle-page')).toBeVisible();await expect.poll(()=>!!channel).toBe(true);
 await expect(page.locator('.battle-effects')).toHaveAttribute('data-reduced-motion',String(reduced));
 await page.evaluate(()=>document.fonts.ready);
 return async(next:MatchState)=>{current=next;channel!.send(JSON.stringify({type:'state',...snapshot()}));};
}
async function watchFrames(page:Page){
 await page.evaluate(()=>{
  const samples:DefeatFrame[]=[];(window as any).__defeatFrames=samples;
  (window as any).__stopDefeatFrames=false;
  const tick=()=>{
   const ending=document.querySelector<HTMLElement>('.battle-defeat'),portrait=ending?.querySelector<HTMLElement>('.battle-defeat-medallion')?.getBoundingClientRect();
   samples.push({at:performance.now(),flight:!!document.querySelector('.battle-fx-flight'),defeat:!!ending,result:!!document.querySelector('.result-banner'),outcome:ending?.dataset.outcome,loserId:ending?.dataset.loserId,stage:ending?.dataset.stage,portrait:portrait?{x:portrait.x,y:portrait.y,width:portrait.width,height:portrait.height}:null});
   if(!(window as any).__stopDefeatFrames)requestAnimationFrame(tick);
  };requestAnimationFrame(tick);
 });
}
async function resultAfterAnimation(page:Page){
 await expect(page.locator('.result-banner')).toBeVisible();await expect(page.locator('.battle-defeat')).toHaveCount(0);
 const samples=await page.evaluate(()=>{(window as any).__stopDefeatFrames=true;return (window as any).__defeatFrames as DefeatFrame[]});
 const start=samples.findIndex(s=>s.defeat);expect(start).toBeGreaterThanOrEqual(0);
 expect(samples.slice(0,start).some(s=>s.result),'result panel must never flash before the defeat presentation').toBe(false);
 expect(samples.some(s=>s.defeat&&s.result),'result panel must not cover the defeat presentation').toBe(false);
 return samples;
}

test('opponent lethal defeat waits for the final hit, breaks the correct hero, then shows victory once',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const {state,finished}=lethal('p2'),publish=await wire(page,state);await watchFrames(page);await publish(finished);
 await expect(page.locator('.battle-fx-flight')).toBeVisible();await expect(page.locator('.battle-defeat')).toHaveCount(0);await expect(page.locator('.result-banner')).toHaveCount(0);
 const defeat=page.locator('.battle-defeat');await expect(defeat).toHaveAttribute('data-outcome','win');await expect(defeat).toHaveAttribute('data-loser-id','p2');
 await expect(defeat).toHaveAttribute('data-stage','fracture');await expect(page.locator('.battle-defeat-shard').first()).toBeVisible();
 await mkdir('evidence/screenshots/defeat',{recursive:true});await page.screenshot({path:'evidence/screenshots/defeat/opponent-fracture.png'});
 const samples=await resultAfterAnimation(page);const firstDefeat=samples.findIndex(s=>s.defeat);expect(samples.slice(0,firstDefeat).some(s=>s.flight)).toBe(true);expect(samples.some(s=>s.flight&&s.defeat)).toBe(false);
 await expect(page.locator('.result-banner h1')).toHaveText('胜利');await publish(finished);await page.waitForTimeout(150);await expect(defeat).toHaveCount(0);
 // A completed real room is forgotten by normal recovery rather than replaying its history.
 await page.reload();await expect(page.locator('.home')).toBeVisible();await expect(defeat).toHaveCount(0);expect(errors).toEqual([]);
});

test('own lethal defeat breaks the own hero and completes before the defeat result',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const {state,finished}=lethal('p1'),publish=await wire(page,state);await watchFrames(page);await publish(finished);
 const samples=await resultAfterAnimation(page);
 // The medallion is removed 260 ms after fracture starts. Capture its identity
 // and geometry in the same rendered frame, rather than separate driver calls.
 const fracture=samples.filter(s=>s.stage==='fracture'&&s.portrait);
 expect(fracture.length,'the losing portrait must render before it breaks into shards').toBeGreaterThan(0);
 for(const frame of fracture){expect(frame.outcome).toBe('lose');expect(frame.loserId).toBe('p1');expect(frame.portrait!.width).toBeGreaterThan(0);expect(frame.portrait!.x).toBeGreaterThanOrEqual(0);expect(frame.portrait!.x+frame.portrait!.width).toBeLessThanOrEqual(390);}
 await expect(page.locator('.result-banner h1')).toHaveText('惜败');
 await mkdir('evidence/screenshots/defeat',{recursive:true});await page.screenshot({path:'evidence/screenshots/defeat/own-result.png'});
});

test('round twelve draw uses a neutral ending without declaring or shattering a loser',async({page})=>{
 const {state,finished}=draw(),publish=await wire(page,state);await watchFrames(page);await publish(finished);
 const defeat=page.locator('.battle-defeat');await expect(defeat).toHaveAttribute('data-outcome','draw');expect(await defeat.getAttribute('data-loser-id')).toBeFalsy();await expect(page.locator('.battle-defeat-shard')).toHaveCount(0);
 await resultAfterAnimation(page);await expect(page.locator('.result-banner h1')).toHaveText('平局');
});

test('reduced motion keeps a brief readable defeat with no shards or flying attack',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 const {state,finished}=lethal('p1'),publish=await wire(page,state,true);await watchFrames(page);await publish(finished);
 const defeat=page.locator('.battle-defeat');await expect(defeat).toHaveAttribute('data-outcome','lose');await expect(defeat).toHaveAttribute('data-loser-id','p1');await expect(page.locator('.battle-defeat-shard')).toHaveCount(0);await expect(page.locator('.battle-fx-flight')).toHaveCount(0);
 const started=Date.now();await resultAfterAnimation(page);expect(Date.now()-started).toBeLessThan(1300);await expect(page.locator('.result-banner h1')).toHaveText('惜败');
});

test('a fresh match arriving during the ending cleans the old overlay and its delayed callbacks',async({page})=>{
 const {state,finished}=lethal('p2'),publish=await wire(page,state);await publish(finished);await expect(page.locator('.battle-defeat')).toBeVisible();
 const next=initial('after-defeat-rematch');await publish(next);
 await expect(page.locator('.battle-defeat')).toHaveCount(0);await expect(page.locator('.battle-defeat-shard')).toHaveCount(0);await expect(page.locator('.battle-effects')).toHaveAttribute('data-busy','false');
 await page.waitForTimeout(2700);await expect(page.locator('.result-banner')).toHaveCount(0);await expect(page.locator('.battle-defeat')).toHaveCount(0);await expect(page.locator('.battle-page')).toBeVisible();
 const own=getView(next,'p1').players.find(p=>p.id==='p1')!;await expect(page.locator('.own-hero .hero-mind')).toHaveText(String(own.mind));
});

test('switching to reduced motion during the lethal attack shortens the already queued ending',async({page})=>{
 const {state,finished}=lethal('p1'),publish=await wire(page,state);await watchFrames(page);await publish(finished);
 await expect(page.locator('.battle-fx-flight')).toBeVisible();await expect(page.locator('.battle-defeat')).toHaveCount(0);
 // Exercise the preference observer while the final result still waits behind the attack.
 await page.evaluate(()=>{document.documentElement.dataset.reduced='true'});
 await expect(page.locator('.battle-effects')).toHaveAttribute('data-reduced-motion','true');
 // Poll every rendered frame: default locator backoff can jump over this 420 ms ending.
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('.battle-defeat')?.dataset.reduced==='true');
 const defeat=page.locator('.battle-defeat');await expect(defeat).toHaveAttribute('data-outcome','lose');await expect(page.locator('.battle-defeat-shard')).toHaveCount(0);
 const started=Date.now(),samples=await resultAfterAnimation(page);
 expect(Date.now()-started,'queued normal duration must not leave a two-second empty table').toBeLessThan(1300);
 const lastEnding=samples.findLast(s=>s.defeat)!,firstResult=samples.find(s=>s.result);
 if(firstResult)expect(firstResult.at-lastEnding.at,'result panel follows the short ending without a stale busy interval').toBeLessThan(350);
 await expect(page.locator('.result-banner h1')).toHaveText('惜败');
});
