import {test,expect,type Page} from '@playwright/test';
import {createMatch,applyCommand,getView,defaultLoadout} from '../../src/game/index';
import type {MatchState} from '../../src/game/types';

const sizes=[[1440,900],[1280,720],[390,844],[360,740],[320,568],[844,390]];
async function settle(page:Page){await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))});await page.waitForTimeout(160)}
async function noHorizontalOverflow(page:Page){expect(await page.evaluate(()=>({width:innerWidth,content:document.documentElement.scrollWidth}))).toEqual({width:page.viewportSize()!.width,content:page.viewportSize()!.width})}
async function separateCardRows(page:Page){
 const problems=await page.locator('.offer-card,.common-card').evaluateAll(cards=>cards.flatMap(card=>{
  const rect=(s:string)=>{const el=card.querySelector(s);return el&&getComputedStyle(el).display!=='none'?el.getBoundingClientRect():null};
  const regions=['.card-art,.common-art','.card-ribbon','.card-copy>p,:scope>p','.benefit-pill','.card-stats,.common-bottom'].map(s=>({s,r:rect(s)})).filter(x=>x.r&&x.r.height>0);
  const errors:string[]=[];for(let i=1;i<regions.length;i++)if(regions[i].r!.top<regions[i-1].r!.bottom-1)errors.push(`${card.getAttribute('data-card-id')}: ${regions[i-1].s} overlaps ${regions[i].s}`);
  const bounds=card.getBoundingClientRect();for(const x of regions)if(x.r!.bottom>bounds.bottom+1)errors.push(`${card.getAttribute('data-card-id')}: ${x.s} outside card`);return errors;
 }));expect(problems).toEqual([]);
}
function fullBoard(){let state=createMatch([defaultLoadout('p1','测试甲',5),defaultLoadout('p2','测试乙',5)],311,{skipSetup:true,matchId:'layout-full'});state.round=8;state.events=[];state.version=0;state.eventSequence=0;
 for(const p of state.players){p.board=[];p.hand=[];p.ownTurn=8;p.timeRemaining=8}
 for(const actor of ['p1','p2'])for(let i=0;i<4;i++){state.activePlayerId=actor;const p=state.players.find(x=>x.id===actor)!;p.timeRemaining=8;p.hand.push({id:`fill-${actor}-${i}`,definitionId:['N01','N02','N03','N05'][i],kind:'card',taxes:[],knownTo:[]});const r=applyCommand(state,actor,{type:'PLAY_CARD',cardId:`fill-${actor}-${i}`});if(r.error)throw Error(r.error);state=r.state}
 state.activePlayerId='p1';state.players[0].timeRemaining=8;state.players[0].hand=['N03','N07','N09','N10','N13','N15','N21','F04'].map((definitionId,i)=>({id:`hand-${i}`,definitionId,kind:'card',taxes:[],knownTo:[]}));state.events=[];return state;
}
async function wire(page:Page,state:MatchState){const data={room:{id:'layout-room',code:'LAYT22',status:'playing',mode:'friend',players:state.players.map(p=>({id:p.id,name:p.name,ready:true,connected:true,isBot:false})),deadline:null,version:state.version},view:getView(state,'p1'),playerId:'p1',roomId:'layout-room'};
 await page.addInitScript(()=>{localStorage.setItem('offer-session','layout-test');localStorage.setItem('offer-active-room','layout-room');localStorage.setItem('offer-motion-preference','reduced');localStorage.setItem('offer-sound','0')});
 await page.route('**/api/session',r=>r.fulfill({json:{token:'layout-test',profile:{id:'p1',nickname:'测试甲',offers:[],revision:0}}}));await page.route('**/api/rooms/layout-room',r=>r.fulfill({json:data}));await page.routeWebSocket('**/ws?*',s=>s.send(JSON.stringify({type:'state',...data})));await page.goto('/');await expect(page.locator('.battle-unit')).toHaveCount(8);await settle(page);
}
for(const [width,height] of sizes){
 test(`collection and loadout cards own non-overlapping rows ${width}x${height}`,async({page},info)=>{
  await page.setViewportSize({width,height});await page.goto('/');await page.locator('.hotspot-collection').click();await expect(page.locator('.collection-page')).toBeVisible();await settle(page);await noHorizontalOverflow(page);await separateCardRows(page);
  await page.getByRole('button',{name:'助阵',exact:true}).click();await expect(page.locator('.common-card')).toHaveCount(6);await settle(page);await separateCardRows(page);await noHorizontalOverflow(page);await page.screenshot({path:info.outputPath('supports.png'),fullPage:true});
  await page.getByRole('button',{name:'校招生鼠鼠',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await separateCardRows(page);await page.getByRole('button',{name:'关闭',exact:true}).click();
  await page.getByRole('button',{name:'双学历配队',exact:true}).click();await expect(page.locator('.loadout-page')).toBeVisible();await settle(page);await noHorizontalOverflow(page);await separateCardRows(page);await page.screenshot({path:info.outputPath('loadout.png'),fullPage:true});
 });
 test(`full board, eight cards and three offers stay separated ${width}x${height}`,async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width,height});await wire(page,fullBoard());await noHorizontalOverflow(page);await separateCardRows(page);
  const overlap=await page.evaluate(()=>{const r=(s:string)=>document.querySelector(s)!.getBoundingClientRect();return {skillsAgainstUnits:r('.opponent-zone').bottom>r('.enemy-row').top+1,unitsAgainstTopic:r('.enemy-row').bottom>r('.topic-bar').top+1,topicAgainstUnits:r('.topic-bar').bottom>r('.friendly-row').top+1,unitsAgainstConsole:r('.friendly-row').bottom>r('.player-console').top+1}});expect(overlap).toEqual({skillsAgainstUnits:false,unitsAgainstTopic:false,topicAgainstUnits:false,unitsAgainstConsole:false});
  if(!await page.locator('.offer-hand').isVisible())await page.getByRole('button',{name:/我的 Offer/}).click();await expect(page.locator('.offer-hand')).toBeVisible();await separateCardRows(page);await page.getByRole('button',{name:/我的 Offer/}).click();
  await page.screenshot({path:info.outputPath('full-board.png'),fullPage:true});expect(errors).toEqual([]);
 });
}
