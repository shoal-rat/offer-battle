import {test,expect,type Locator} from '@playwright/test';

async function uncovered(control:Locator){
 await expect(control).toBeVisible();
 await expect.poll(()=>control.evaluate(el=>{
  const r=el.getBoundingClientRect(),coach=document.querySelector('.tutorial-coach')!.getBoundingClientRect();
  const points=el.matches('.unit-main')?[[.5,.5]]:[[.5,.5],[.15,.15],[.85,.15],[.15,.85],[.85,.85]];
  return {inside:r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth,
   noCoachOverlap:r.bottom<=coach.top||r.top>=coach.bottom||r.right<=coach.left||r.left>=coach.right,
   hit:points.every(([x,y])=>el.contains(document.elementFromPoint(r.left+r.width*x,r.top+r.height*y)))};
 })).toEqual({inside:true,noCoachOverlap:true,hit:true});
}

for(const width of [390,1440])test(`${width}px L02 coach leaves opponent skills and the aimed target readable and clickable`,async({page,request},testInfo)=>{
 await page.setViewportSize({width,height:width===390?844:900});
 const auth=await(await request.post('/api/session',{data:{nickname:'教程布局体验'}})).json();
 const saved=await(await request.post('/api/rooms',{headers:{Authorization:`Bearer ${auth.token}`},data:{mode:'bot',training:true,lessonId:'L02'}})).json();
 await page.addInitScript(({token,id})=>{localStorage.setItem('offer-session',token);localStorage.setItem('offer-active-room',id);localStorage.setItem('offer-motion-preference','full');localStorage.setItem('offer-sound','0')},{token:auth.token,id:saved.room.id});
 const state=async()=>(await request.get(`/api/rooms/${saved.room.id}`,{headers:{Authorization:`Bearer ${auth.token}`}})).json();
 const command=saved.room.tutorial.allowedCommands[0],errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/');await expect(page.locator('.tutorial-coach')).toBeVisible();
 const coach=page.locator('.tutorial-coach');
 if(width===1440)expect((await coach.boundingBox())!.height).toBeLessThan(190);
 await page.locator(`[data-hand-id="${command.cardId}"] button`).first().click();await page.getByRole('button',{name:'使用这张牌',exact:true}).click();await expect(page.locator('.paper-plane-aim')).toBeVisible();
 const target=page.locator(`[data-battle-id="${command.targetId}"] .unit-main`);
 await target.hover();await expect(page.locator('.paper-plane-aim')).toHaveAttribute('data-valid-target','true');
 await uncovered(target);
 await uncovered(page.locator('[data-opponent-skill="primary"]'));
 await uncovered(page.locator('[data-opponent-skill="secondary"]'));
 await page.screenshot({path:testInfo.outputPath(`L02-${width}-aim-uncovered.png`)});
 await page.locator('[data-opponent-skill="primary"]').click();const rules=page.getByRole('dialog',{name:'知己知彼 · 对方的两项技能'});await expect(rules).toBeVisible();await expect(rules.locator('.opponent-skill-detail')).toHaveCount(2);await rules.getByRole('button',{name:'关闭',exact:true}).click();
 await target.hover();await uncovered(target);await target.click();
 await expect.poll(async()=>(await state()).room.tutorial.stepIndex).toBe(1);await expect(page.locator('.paper-plane-aim')).toHaveCount(0);expect(errors).toEqual([]);
});
