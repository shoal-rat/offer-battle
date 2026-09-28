import {test,expect,type Page} from '@playwright/test';
import {mkdir,copyFile,writeFile} from 'node:fs/promises';
import type {Command} from '../../src/game/types';
const shots='evidence/screenshots/tutorial';
async function api(page:Page,path:string,body?:unknown){return page.evaluate(async({path,body})=>{const r=await fetch(path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:`Bearer ${localStorage.getItem('offer-session')}`},...(body?{body:JSON.stringify(body)}:{})});if(!r.ok)throw Error(await r.text());return r.json();},{path,body});}
async function state(page:Page){const id=await page.evaluate(()=>localStorage.getItem('offer-active-room'));return api(page,`/api/rooms/${id}`);}
async function screenshot(page:Page,name:string){await mkdir(shots,{recursive:true});await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));});await page.screenshot({path:`${shots}/${name}.png`,fullPage:true});}
async function play(page:Page,c:Command){
 await expect(page.locator('[data-tutorial="endTurn"]')).not.toContainText('结算中',{timeout:20000});
 const by=(attr:string,id?:string)=>page.locator(`[${attr}="${id}"]`);
 // Cards are played the way a player does: lifted out of the hand onto the table, or straight onto their target.
 // When either end is off screen (a scrolled phone layout) the keyboard path is used: click to read, then use.
 let dropped=false;
 const handCard=async(source:ReturnType<Page['locator']>)=>{
  const dest=c.targetId?by('data-battle-id',c.targetId):page.locator('.friendly-row');
  const a=await source.boundingBox(),b=await dest.boundingBox(),size=page.viewportSize()!;
  const visible=(r:typeof a)=>!!r&&r.y>=0&&r.y+r.height<=size.height;
  if(visible(a)&&visible(b)){
   await page.mouse.move(a!.x+a!.width/2,a!.y+a!.height/2);await page.mouse.down();
   await page.mouse.move(a!.x+a!.width/2,a!.y+a!.height/2-40,{steps:4});await page.mouse.move(b!.x+b!.width/2,b!.y+b!.height/2,{steps:12});await page.mouse.up();
   dropped=!!c.targetId;
  }else{await source.click();await page.getByRole('button',{name:'使用这张牌',exact:true}).click()}
 };
 if(c.type==='DEPLOY_OFFER'){
  if(!await by('data-offer-id',c.offerId).count())await page.getByRole('button',{name:/^我的 Offer/}).click();
  await handCard(by('data-offer-id',c.offerId).locator('button.offer-card'));
 }else if(c.type==='PLAY_CARD'){
  await handCard(by('data-hand-id',c.cardId).locator('button').first());
 }else if(c.type==='ATTACK')await by('data-battle-id',c.cardId).locator('.unit-main').click();
 else if(c.type==='USE_PRIMARY'||c.type==='USE_SECONDARY'){
  await page.locator(`[data-tutorial="${c.type==='USE_PRIMARY'?'primary':'secondary'}"]`).click();await page.getByRole('button',{name:c.type==='USE_PRIMARY'?'选择发动主技能':'选择发动进修技能',exact:true}).click();
 }else if(c.type==='NEGOTIATE')await page.locator('[data-tutorial="negotiate"]').click();
 else if(c.type==='END_TURN'){await page.locator('[data-tutorial="endTurn"]').click();return}
 else throw Error('Unexpected tutorial command '+c.type);
 if(c.targetId&&!dropped){const target=by('data-battle-id',c.targetId);if(await target.locator('.unit-main').count())await target.locator('.unit-main').click();else await target.click();}
 else if(c.type==='NEGOTIATE')await page.locator('[data-tutorial-action="0"]').click();
 if(c.type==='NEGOTIATE')await page.getByRole('button',{name:'确认谈薪',exact:true}).click();
}

test('all five playable lessons: normal animation, real UI actions, guided rejection, resume and graduation',async({browser},testInfo)=>{
 test.setTimeout(240000);const context=await browser.newContext({baseURL:String(testInfo.project.use.baseURL),viewport:{width:1440,height:900},locale:'zh-CN',colorScheme:'dark',reducedMotion:'no-preference',recordVideo:{dir:'work/tutorial-video',size:{width:1440,height:900}}});const page=await context.newPage();const video=page.video()!;const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const report:any[]=[];
 try{
 await page.goto('/');await page.locator('.hotspot-tutorial').click();await expect(page.locator('.academy-page')).toBeVisible();await screenshot(page,'academy-before');await page.getByRole('button',{name:'开始第一课',exact:true}).click();
 for(const id of ['L01','L02','L03','L04','L05']){
  await expect(page.locator('.tutorial-coach')).toBeVisible({timeout:10000});
  await page.waitForFunction(()=>Boolean(localStorage.getItem('offer-active-room')),{},{timeout:10000});
  await expect.poll(async()=>(await state(page)).room.tutorial?.lessonId,{timeout:10000}).toBe(id);let room=await state(page);expect(room.room.tutorial.lessonId).toBe(id);await screenshot(page,`${id}-start`);const count=room.room.tutorial.stepCount;
  for(let index=0;index<count;index++){
   expect(room.room.tutorial.allowedCommands).toHaveLength(1);const cmd=room.room.tutorial.allowedCommands[0];
   if(id==='L01'&&index===0){const denied=await api(page,`/api/rooms/${room.room.id}/command`,{type:'END_TURN',commandId:crypto.randomUUID(),matchId:room.view.matchId,expectedStateVersion:room.view.version});expect(denied.errorCode).toBe('TUTORIAL_STEP');expect(denied.view.version).toBe(room.view.version);await expect(page.locator('[data-tutorial="endTurn"]')).toBeDisabled();}
   await play(page,cmd);await expect.poll(async()=>(await state(page)).room.tutorial.stepIndex).toBe(index+1);room=await state(page);report.push({lesson:id,step:index+1,type:cmd.type,version:room.view.version});
   if(id==='L01'&&index===0){await page.reload();await expect(page.locator('.tutorial-coach')).toBeVisible();const resumed=await state(page);expect(resumed.room.tutorial.stepIndex).toBe(1);expect(resumed.view.version).toBe(room.view.version);}
   if(id==='L04'&&index===0){await page.locator('[data-tutorial="secondary"]').click();await expect(page.getByRole('button',{name:'选择发动进修技能',exact:true})).toBeDisabled();await page.getByRole('button',{name:'返回牌桌',exact:true}).click();}
  }
  await expect(page.locator('.lesson-complete-overlay')).toBeVisible({timeout:20000});await screenshot(page,`${id}-complete`);const replay=await api(page,`/api/rooms/${room.room.id}/replay`);expect(replay.verified).toBe(true);expect(room.room.tutorial.completed).toBe(true);
  if(id!=='L05')await page.getByRole('button',{name:'下一课',exact:true}).click();
 }
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('offer-tutorial-completed-v1')||'[]'))).toEqual(['L01','L02','L03','L04','L05']);await page.getByRole('button',{name:'返回课程',exact:true}).click();await expect(page.locator('.lesson-card.complete')).toHaveCount(5);await screenshot(page,'academy-graduated');await page.reload();await page.locator('.hotspot-tutorial').click();await expect(page.locator('.lesson-card.complete')).toHaveCount(5);expect(errors).toEqual([]);
 await writeFile('evidence/tutorial-ui-actions.json',JSON.stringify({normalMotion:true,allActionsViaUI:true,steps:report,allReplaysVerified:true,pageErrors:errors},null,2));
 }finally{await context.close();await mkdir('evidence/video',{recursive:true});await copyFile(await video.path(),'evidence/video/tutorial-playthrough.webm');}
});

test('390px tutorial: no horizontal overflow, restart, directory, refresh resume and touch-sized playthrough',async({page})=>{
 test.setTimeout(120000);await page.setViewportSize({width:390,height:844});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.locator('.hotspot-tutorial').click();await expect(page.locator('.academy-page')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);await screenshot(page,'academy-mobile-390');await page.getByRole('button',{name:'开始第一课',exact:true}).click();await expect(page.locator('.tutorial-coach')).toBeVisible();let room=await state(page);const originalRoomId=room.room.id;
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);await screenshot(page,'L01-mobile-start');await play(page,room.room.tutorial.allowedCommands[0]);await expect.poll(async()=>(await state(page)).room.tutorial.stepIndex).toBe(1);await page.reload();await expect(page.locator('.tutorial-coach')).toBeVisible();room=await state(page);expect(room.room.id).toBe(originalRoomId);expect(room.room.tutorial.stepIndex).toBe(1);
 await page.getByRole('button',{name:'重来本课',exact:true}).click();await expect.poll(async()=>(await state(page)).room.id).not.toBe(originalRoomId);room=await state(page);expect(room.room.tutorial.stepIndex).toBe(0);await page.getByRole('button',{name:'课程目录',exact:true}).click();await expect(page.locator('.academy-page')).toBeVisible();await page.getByRole('button',{name:'开始第一课',exact:true}).click();await expect(page.locator('.tutorial-coach')).toBeVisible();room=await state(page);
 for(let index=0;index<room.room.tutorial.stepCount;index++){await play(page,room.room.tutorial.allowedCommands[0]);await expect.poll(async()=>(await state(page)).room.tutorial.stepIndex).toBe(index+1);room=await state(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);}
 await expect(page.locator('.lesson-complete-overlay')).toBeVisible({timeout:20000});await screenshot(page,'L01-mobile-complete');await page.getByRole('button',{name:'返回课程',exact:true}).click();await expect(page.locator('.lesson-card.complete')).toHaveCount(1);expect(errors).toEqual([]);
});
