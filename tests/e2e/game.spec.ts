import {test,expect,type Page} from '@playwright/test';
import {mkdir,readFile} from 'node:fs/promises';
import {chooseBotCommand,cardById} from '../../src/game/index';
import type {MatchView,Command} from '../../src/game/types';

const evidence='evidence/screenshots';
async function ready(page:Page){await page.goto('/');await expect(page.getByRole('button',{name:'先玩一局'})).toBeVisible();await page.waitForFunction(()=>!!localStorage.getItem('offer-session'));}
async function api(page:Page,path:string,body?:unknown){return page.evaluate(async({path,body})=>{const response=await fetch(path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:`Bearer ${localStorage.getItem('offer-session')}`},...(body?{body:JSON.stringify(body)}:{})});const json=await response.json();if(!response.ok||json.ok===false)throw Error(JSON.stringify(json));return json;},{path,body});}
async function roomState(page:Page){const roomId=await page.evaluate(()=>localStorage.getItem('offer-active-room'));return api(page,`/api/rooms/${roomId}`);}
async function command(page:Page,state:any,cmd:Command){return api(page,`/api/rooms/${state.room.id}/command`,{...cmd,commandId:crypto.randomUUID(),matchId:state.view.matchId,expectedStateVersion:state.view.version});}
async function settleImages(page:Page){await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(img=>img.decode().catch(()=>{})));});}
async function screenshot(page:Page,name:string){await mkdir(evidence,{recursive:true});await settleImages(page);await page.screenshot({path:`${evidence}/${name}.png`,fullPage:true,animations:'disabled'});}
async function pngDownload(page:Page,button:string,name:string){await mkdir(evidence,{recursive:true});const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:button,exact:true}).click();const file=await downloaded;await file.saveAs(`${evidence}/${name}.png`);expect((await readFile(`${evidence}/${name}.png`)).subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))).toBe(true);}
async function autoFinish(page:Page){let state=await roomState(page);for(let i=0;i<800&&state.view.phase!=='finished';i++){if(state.view.activePlayerId==='p1'){const cmd=chooseBotCommand(state.view,'aggressive');if(cmd){state=await command(page,state,cmd);continue;}}await page.waitForTimeout(80);state=await roomState(page);}expect(state.view.phase).toBe('finished');return state;}

test('create and confirm an Offer, collect it, select both education slots and all 30 cards',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await ready(page);
 await page.getByRole('button',{name:'录入我的 Offer',exact:true}).click();
 await page.getByPlaceholder('例如：大厂算法岗、银行基层、投行做债').fill('云平台测试岗');await page.getByLabel('公司显示名',{exact:true}).fill('星河测试科技');await page.getByLabel('岗位名称',{exact:true}).fill('测试工程师');await page.getByLabel('职业归类').selectOption('testing');
 await page.getByLabel('固定月薪').fill('20000');await page.getByLabel('保证薪数').fill('14');await page.getByLabel('年度目标奖金').fill('0');
 await page.getByLabel('启用一项已确认条款').selectOption('B01');const save=page.getByRole('button',{name:'生成我的角色卡'});await expect(save).toBeDisabled();
 await page.getByRole('checkbox').check();await expect(save).toBeEnabled();await screenshot(page,'create-confirmed');await save.click();await expect(page.getByText('已收入收藏 · 本地职业插画')).toBeVisible();
 await expect(page.getByRole('button',{name:'个性插画 · 需配置图像服务'})).toBeDisabled();const profile=await api(page,'/api/profile');expect(profile.offers).toHaveLength(1);expect(profile.offers[0].name).toBe('云平台测试岗');expect(profile.offers[0].templateId).toBe('T07');expect(profile.offers[0].annualPackage).toBe(280000);expect(profile.offers[0].baseHealth).toBe(2);
 await page.getByRole('button',{name:'我的卡册',exact:true}).click();await expect(page.locator('.collection-card').filter({hasText:'星河测试科技'})).toBeVisible();expect(await page.locator('.collection-card .card-ribbon').allTextContents()).toEqual(expect.arrayContaining(['大厂算法岗','银行基层','投行做债','央企总部','云平台测试岗']));expect(await page.locator('.collection-card .stats-label').allTextContents()).toContain('一线卷王');await expect(page.locator('.toast')).toHaveCount(0);await screenshot(page,'collection-named-jobs-1440');await page.getByRole('button',{name:'双学历配队',exact:true}).click();
 await page.getByPlaceholder('输入学校名，或直接选择下方流派').fill('吉林大学');await expect(page.getByText('隐藏角色已解锁 · 宇宙吉大')).toBeVisible();await page.getByLabel(/第二学历/).selectOption('S10');
 await expect(page.getByText('本硕连读 · 宇宙吉大',{exact:true})).toBeVisible();await screenshot(page,'loadout-dual-jlu');
 await pngDownload(page,'保存毕业照','graduation-share');
 await page.getByRole('button',{name:/03 · 选择牌组/}).click();await expect(page.locator('.deck-card')).toHaveCount(30);
 await page.reload();await page.getByRole('button',{name:'我的卡册',exact:true}).click();await expect(page.locator('.collection-card').filter({hasText:'星河测试科技'})).toBeVisible();expect(errors).toEqual([]);
});

test('bot game: UI actions, actual JLU ultimate, full result and verified replay',async({page})=>{
 await ready(page);await page.getByRole('button',{name:'双学历配队',exact:true}).click();await page.getByPlaceholder('输入学校名，或直接选择下方流派').fill('吉林大学');await page.getByLabel('推荐阵容').selectOption('P02');
 await page.getByRole('button',{name:'用这套阵容开打'}).click();await page.getByRole('button',{name:'就用这套，开始对局'}).click();await expect(page.locator('.battle-page')).toBeVisible();await expect(page.locator('.skill-button.secondary')).toBeDisabled();
 let state=await roomState(page);let usedUltimate=false;
 for(let step=0;step<180&&!usedUltimate;step++){
   const view:MatchView=state.view,me=view.players.find(p=>p.id==='p1')!;
   if(view.phase==='finished')break;
   if(view.activePlayerId!=='p1'){await page.waitForTimeout(100);state=await roomState(page);continue;}
   if(me.education.jluSignins<2&&view.round>=2){const gather=view.legalActions.find(c=>c.type==='USE_PRIMARY');if(gather){await page.getByRole('button',{name:/校友集合/}).click();await expect.poll(async()=>(await roomState(page)).view.version).toBeGreaterThan(view.version);state=await roomState(page);continue;}}
   if(me.education.jluSignins===2&&!me.education.usedThisOwnTurn){const deploy=view.legalActions.find(c=>c.type==='NEGOTIATE'&&me.offerZone.find(o=>o.id===c.offerId)?.definition.id==='E02')??view.legalActions.find(c=>c.type==='DEPLOY_OFFER'&&(me.offerZone.find(o=>o.id===c.offerId)?.cost??Infinity)<=me.timeRemaining-2);
    if(!me.board.some(u=>u.kind==='offer')&&deploy){state=await command(page,state,deploy);continue;}
    const ultimate=view.legalActions.find(c=>c.type==='USE_PRIMARY'&&c.targetId);if(ultimate){await page.getByRole('button',{name:/全校撑腰/}).click();await page.locator('.target-options button').first().click();await expect.poll(async()=>(await roomState(page)).view.players[0].education.jluUltimateUsed).toBe(true);await screenshot(page,'jlu-ultimate');state=await roomState(page);usedUltimate=true;break;}
   }
   if(view.pendingChoice){const choice=view.legalActions.find(c=>c.type==='RESOLVE_CHOICE');if(choice){state=await command(page,state,choice);continue;}}
   if(await page.getByRole('button',{name:'结束回合',exact:true}).isEnabled())await page.getByRole('button',{name:'结束回合',exact:true}).click();else await command(page,state,{type:'END_TURN'});await page.waitForTimeout(100);state=await roomState(page);
 }
 expect(usedUltimate).toBe(true);await screenshot(page,'battle-populated');
 // A subsequent accepted command must not cancel the independent ultimate hide timer.
 state=await command(page,state,{type:'END_TURN'});await expect(page.locator('.jlu-ultimate')).toHaveCount(0,{timeout:2500});
 state=await autoFinish(page);await expect(page.locator('.result-banner')).toBeVisible();await screenshot(page,'match-result');
 const replay=await api(page,`/api/rooms/${state.room.id}/replay`);expect(replay.verified).toBe(true);expect(replay.frames.length).toBeGreaterThan(20);expect(replay.events.some((e:any)=>/全校撑腰/.test(e.text))).toBe(true);
 await page.getByRole('button',{name:'回放本局'}).click();const replayDialog=page.getByRole('dialog',{name:'把这一局，重新走一遍。'});await expect(replayDialog.getByText('✓ 确定性重放校验一致')).toBeVisible();await replayDialog.getByLabel('回放进度').focus();await replayDialog.getByLabel('回放进度').press('End');await screenshot(page,'replay-verified');expect((await roomState(page)).view.version).toBe(state.view.version);await replayDialog.getByRole('button',{name:'关闭',exact:true}).click();
 await pngDownload(page,'保存名场面','battle-share');
});

test('friends in two isolated browser contexts: ready, flex, mulligan, private hand, reconnect and complete match',async({browser})=>{
 const first=await browser.newContext({viewport:{width:1440,height:900}}),second=await browser.newContext({viewport:{width:390,height:844}});const a=await first.newPage(),b=await second.newPage();
 try{await ready(a);await ready(b);await a.getByRole('button',{name:'和朋友约一场'}).click();await a.getByRole('button',{name:'创建好友房',exact:true}).click();await expect(a.locator('.room-code strong')).toBeVisible();const code=await a.locator('.room-code strong').innerText();
 await pngDownload(a,'保存邀请图','invitation-share');
 await b.getByRole('button',{name:'和朋友约一场'}).click();await b.getByPlaceholder('输入房间码').fill(code);await b.getByRole('button',{name:'加入房间',exact:true}).click();await a.getByRole('button',{name:'准备好了'}).click();await b.getByRole('button',{name:'准备好了'}).click();
 await expect(a.getByRole('dialog',{name:'看清对手，再留三张底牌。'})).toBeVisible();await expect(b.getByRole('dialog',{name:'看清对手，再留三张底牌。'})).toBeVisible();
 await a.getByRole('button',{name:'确认应对牌 3/3'}).click();await b.getByRole('button',{name:'确认应对牌 3/3'}).click();await a.getByRole('button',{name:'保留起手，开始对局'}).click();await b.getByRole('button',{name:'保留起手，开始对局'}).click();
 await expect.poll(async()=>(await roomState(a)).view.phase).toBe('playing');await expect(a.getByRole('dialog',{name:'看清对手，再留三张底牌。'})).not.toBeVisible();await expect(b.getByRole('dialog',{name:'看清对手，再留三张底牌。'})).not.toBeVisible();let state=await roomState(a);expect(state.view.players[1].hand).toEqual([]);const priorDeadline=state.room.deadline;expect(priorDeadline).toBeGreaterThan(Date.now());
 await second.setOffline(true);await b.waitForTimeout(200);await second.setOffline(false);await b.reload();await expect(b.locator('.battle-page')).toBeVisible();const reconnect=await roomState(b);expect(reconnect.playerId).toBe('p2');expect(reconnect.room.deadline).toBe(priorDeadline);
 await screenshot(b,'friend-mobile-390');
 // Fill all eight public slots through ordinary legal actions, without attacks or fixture injection.
 for(let step=0;step<160&&!state.view.players.every((p:any)=>p.board.length===4);step++){
  const active=state.view.activePlayerId==='p1'?a:b,own=await roomState(active),me=own.view.players.find((p:any)=>p.id===own.playerId);
  const fill=own.view.legalActions.find((c:Command)=>c.type==='DEPLOY_OFFER')??own.view.legalActions.find((c:Command)=>c.type==='PLAY_CARD'&&cardById[me.hand.find((h:any)=>h.id===c.cardId)?.definitionId]?.type==='support')??own.view.legalActions.find((c:Command)=>c.type==='RESOLVE_CHOICE')??{type:'END_TURN'};
  state=await command(active,own,fill);
 }
 expect(state.view.players.every((p:any)=>p.board.length===4)).toBe(true);await screenshot(a,'battle-full-desktop');await screenshot(b,'battle-full-390');await b.setViewportSize({width:360,height:780});await screenshot(b,'battle-full-360');await b.setViewportSize({width:768,height:1024});await screenshot(b,'battle-full-768');
 const attackPage=state.view.activePlayerId==='p1'?a:b;await attackPage.locator('.friendly.ready .unit-main').first().click();await attackPage.locator('.target-options button').first().click();await expect.poll(async()=>(await roomState(attackPage)).view.version).toBeGreaterThan(state.view.version);state=await roomState(attackPage);
 for(let step=0;step<350&&state.view.phase!=='finished';step++){const active=state.view.activePlayerId==='p1'?a:b;const own=await roomState(active);const cmd=chooseBotCommand(own.view,'aggressive');expect(cmd).toBeTruthy();state=await command(active,own,cmd!);}
 expect(state.view.phase).toBe('finished');await expect(a.locator('.result-banner')).toBeVisible();await expect(b.locator('.result-banner')).toBeVisible();const replay=await api(a,`/api/rooms/${state.room.id}/replay`);expect(replay.verified).toBe(true);
 }finally{await first.close();await second.close();}
});

for(const [width,height]of [[1440,900],[768,1024],[390,844],[360,780]])test(`visual layout ${width}x${height}: home, creator, loadout, and battle controls`,async({page})=>{
 await page.setViewportSize({width,height});await ready(page);await settleImages(page);await expect(page).toHaveScreenshot(`home-${width}.png`,{fullPage:true});await screenshot(page,`home-${width}`);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
 await page.getByRole('button',{name:'录入我的 Offer',exact:true}).click();await expect(page.getByLabel('公司显示名',{exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);await settleImages(page);await expect(page).toHaveScreenshot(`creator-${width}.png`,{fullPage:true});await screenshot(page,`creator-${width}`);
 await page.getByRole('button',{name:'双学历配队',exact:true}).click();await expect(page.getByLabel(/第二学历/)).toBeVisible();await settleImages(page);await expect(page).toHaveScreenshot(`loadout-${width}.png`,{fullPage:true});await screenshot(page,`loadout-${width}`);
 await page.getByRole('button',{name:'用这套阵容开打'}).click();await page.getByRole('button',{name:'就用这套，开始对局'}).click();await expect(page.locator('.education-controls')).toBeVisible();await screenshot(page,`battle-${width}`);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
 await page.waitForFunction(()=>[...document.images].every(img=>img.complete));const broken=await page.locator('img').evaluateAll(imgs=>imgs.filter(img=>!(img as HTMLImageElement).naturalWidth).map(img=>img.getAttribute('src')));expect(broken).toEqual([]);
});
