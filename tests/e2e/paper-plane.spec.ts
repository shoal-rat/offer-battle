import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
async function lesson(page:Page,request:APIRequestContext,reduced=false){
 const auth=await (await request.post('/api/session',{data:{nickname:'纸飞机体验'}})).json();
 const saved=await (await request.post('/api/rooms',{headers:{Authorization:`Bearer ${auth.token}`},data:{mode:'bot',training:true,lessonId:'L02'}})).json();
 await page.addInitScript(({token,id,reduced})=>{localStorage.setItem('offer-session',token);localStorage.setItem('offer-active-room',id);localStorage.setItem('offer-motion-preference',reduced?'reduced':'full');localStorage.setItem('offer-sound','0')},{token:auth.token,id:saved.room.id,reduced});
 const sent:{at:number;body:any}[]=[];page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith(`/api/rooms/${saved.room.id}/command`))sent.push({at:Date.now(),body:r.postDataJSON()})});
 await page.goto('/');await expect(page.locator('.battle-page')).toBeVisible();
 const command=saved.room.tutorial.allowedCommands[0];
 return {saved,command,sent,token:auth.token,source:page.locator(`[data-hand-id="${command.cardId}"] button`).first(),target:page.locator(`[data-battle-id="${command.targetId}"] .unit-main`),state:async()=>(await request.get(`/api/rooms/${saved.room.id}`,{headers:{Authorization:`Bearer ${auth.token}`}})).json()};
}
/** A click lifts the card to read; "使用这张牌" (the keyboard path) arms the plane. */
async function arm(page:Page,f:{source:ReturnType<Page['locator']>}){await f.source.click();await page.getByRole('button',{name:'使用这张牌',exact:true}).click()}
test('using a card arms the generated plane; only a legal target fires after flight and card reveal',async({page,request})=>{
 const f=await lesson(page,request),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await arm(page,f);await expect(page.locator('.paper-plane-aim')).toBeVisible();await expect(page.locator('.action-confirm-tray,.modal')).toHaveCount(0);
 const art=page.locator('.paper-plane-vehicle img');await expect(art).toHaveAttribute('src',/art\/paper-plane\.webp$/);expect(await art.evaluate((n:HTMLImageElement)=>n.complete&&n.naturalWidth===512)).toBe(true);
 expect(f.sent).toHaveLength(0);await page.locator('.own-hero .hero-avatar').click();expect(f.sent).toHaveLength(0);
 await f.target.hover();await expect(page.locator('.paper-plane-aim')).toHaveAttribute('data-valid-target','true');
 expect(await page.locator('.paper-plane-sight>path').evaluate(n=>getComputedStyle(n).strokeDasharray)).not.toBe('none');
 await page.evaluate(()=>{const w=window as any;w.__planeFrames=[];w.__planeTick=true;const tick=(at:number)=>{const p=document.querySelector('.paper-plane-aim'),mini=document.querySelector('.paper-plane-mini');w.__planeFrames.push({at,phase:p?.className,transform:mini?getComputedStyle(mini).transform:null});if(w.__planeTick)requestAnimationFrame(tick)};requestAnimationFrame(tick)});
 const firedAt=Date.now();await f.target.click();await f.target.click({force:true});
 await expect.poll(()=>f.sent.length).toBe(1);expect(f.sent[0].at-firedAt).toBeGreaterThanOrEqual(900);expect(f.sent[0].body.targetId??f.sent[0].body.payload?.targetId).toBe(f.command.targetId);
 await expect.poll(async()=>(await f.state()).room.tutorial.stepIndex).toBe(1);await expect(page.locator('.paper-plane-aim')).toHaveCount(0);
 const frames=await page.evaluate(()=>{const w=window as any;w.__planeTick=false;return w.__planeFrames as {at:number;phase?:string;transform?:string}[]});expect(frames.filter(f=>f.phase?.includes('flying')).length).toBeGreaterThan(20);expect(new Set(frames.map(f=>f.transform)).size).toBeGreaterThan(6);expect(errors).toEqual([]);
});
test('Escape and the cancel button return the card without spending time or sending a command',async({page,request})=>{
 const f=await lesson(page,request);await arm(page,f);await page.keyboard.press('Escape');await expect(page.locator('.paper-plane-aim')).toHaveCount(0);expect(f.sent).toHaveLength(0);
 await arm(page,f);await page.getByRole('button',{name:'取消瞄准',exact:true}).click();expect(f.sent).toHaveLength(0);expect((await f.state()).view.version).toBe(f.saved.view.version);
 await arm(page,f);await f.target.click();await expect(page.locator('.paper-plane-aim')).toHaveClass(/phase-flying/);await page.keyboard.press('Escape');await expect(page.locator('.paper-plane-aim')).toHaveCount(0);await page.waitForTimeout(1100);expect(f.sent).toHaveLength(0);
});
test('an authoritative state change cancels an in-flight gesture and never resends its stale action',async({page,request})=>{
 const f=await lesson(page,request);await arm(page,f);await f.target.click();await expect(page.locator('.paper-plane-aim')).toHaveClass(/phase-flying/);
 const response=await request.post(`/api/rooms/${f.saved.room.id}/command`,{headers:{Authorization:`Bearer ${f.token}`},data:{...f.command,commandId:crypto.randomUUID(),matchId:f.saved.view.matchId,expectedStateVersion:f.saved.view.version}});expect(response.ok()).toBe(true);
 await expect(page.locator('.paper-plane-aim')).toHaveCount(0);await page.waitForTimeout(1100);expect(f.sent).toHaveLength(0);expect((await f.state()).room.tutorial.stepIndex).toBe(1);
});
test('390px reduced motion can target with the keyboard without a modal or travelling animation',async({page,request})=>{
 await page.setViewportSize({width:390,height:844});const f=await lesson(page,request,true);await arm(page,f);await expect(page.locator('.paper-plane-sight')).toHaveCount(0);await expect(page.locator('.modal,.action-confirm-tray')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(392);await f.target.focus();await page.keyboard.press('Enter');await expect.poll(()=>f.sent.length).toBe(1);await expect.poll(async()=>(await f.state()).room.tutorial.stepIndex).toBe(1);await expect(page.locator('.paper-plane-aim')).toHaveCount(0);
});
