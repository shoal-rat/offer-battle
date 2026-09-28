import {test,expect,type Page} from '@playwright/test';

async function temporaryRoom(page:Page):Promise<{room:{id:string;tutorial:{stepIndex:number}}}>{
  return page.evaluate(()=>{
    const saved=JSON.parse(sessionStorage.getItem('offer-local-active-v1')||'null');
    if(!saved?.room)throw Error('No active local room');
    // Read the browser's own temporary persistence; commands below still use real UI controls.
    return {room:{id:saved.room.id,tutorial:saved.room.tutorial}};
  });
}
async function playFromHand(page:Page,width:number,card:ReturnType<Page['locator']>){
  if(width>=1024){const a=(await card.boundingBox())!,b=(await page.locator('.friendly-row').boundingBox())!;await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(a.x+a.width/2,a.y+a.height/2-40,{steps:4});await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:12});await page.mouse.up()}
  else{await card.click();await page.getByRole('button',{name:'使用这张牌',exact:true}).click()}
}
async function settled(page:Page){await expect(page.locator('[data-tutorial="endTurn"]')).not.toContainText('结算中')}

for(const width of [1440,390])test(`static guest ${width}px: blocked API, real tutorial actions, refresh recovery and temporary-data cleanup`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:width===390?844:900});
  const errors:string[]=[],apiRequests:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(/\/api\//.test(new URL(request.url()).pathname))apiRequests.push(request.url())});
  await page.route('**/api/**',route=>route.abort());
  await page.goto('./');
  await expect(page.locator('.hotspot-play')).toBeVisible();
  await expect(page.getByRole('button',{name:'游客 · 登录 / 注册',exact:true})).toBeVisible();
  await page.locator('.hotspot-tutorial').click();
  await page.getByRole('button',{name:'开始第一课',exact:true}).click();
  await expect(page.locator('.tutorial-coach')).toBeVisible();
  const first=await temporaryRoom(page);expect(first.room.id).toMatch(/^local_/);
  if(width<1024)await page.getByRole('button',{name:/^我的 Offer/}).click();
  // Desktop lifts cards out of the hand onto the table; the phone reads them close with a tap, then uses them.
  await playFromHand(page,width,page.locator('[data-offer-id="E02"] button.offer-card'));
  await expect.poll(async()=>(await temporaryRoom(page)).room.tutorial!.stepIndex).toBe(1);
  await page.reload();await expect(page.locator('.tutorial-coach')).toBeVisible();
  expect((await temporaryRoom(page)).room.id).toBe(first.room.id);
  expect((await temporaryRoom(page)).room.tutorial!.stepIndex).toBe(1);
  await settled(page);await page.locator('[data-tutorial="endTurn"]').click();
  await expect.poll(async()=>(await temporaryRoom(page)).room.tutorial!.stepIndex).toBe(2);
  await settled(page);await page.locator('.friendly .unit-main').filter({hasText:'国企综合岗'}).click();
  await page.locator('.hero-avatar[data-battle-id="p2"]').click();
  await expect.poll(async()=>(await temporaryRoom(page)).room.tutorial!.stepIndex).toBe(3);
  await settled(page);await playFromHand(page,width,page.getByRole('button',{name:'实习搭子',exact:true}));
  await expect(page.locator('.lesson-complete-overlay')).toBeVisible();
  const completion=await page.locator('.lesson-complete').boundingBox();expect(completion).not.toBeNull();expect(completion!.x).toBeGreaterThanOrEqual(0);expect(completion!.x+completion!.width).toBeLessThanOrEqual(width);expect(completion!.y).toBeGreaterThanOrEqual(0);expect(completion!.y+completion!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  expect(await page.evaluate(()=>sessionStorage.getItem('offer-local-active-v1'))).toBeNull();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
  await page.screenshot({path:testInfo.outputPath(`guest-tutorial-${width}.png`)});
  await page.getByRole('button',{name:'返回课程',exact:true}).click();
  await expect(page.locator('.lesson-card.complete')).toHaveCount(1);
  await page.getByRole('button',{name:'返回首页',exact:true}).click();
  await page.locator('.hotspot-friends').click();await page.getByRole('button',{name:'创建好友房',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'欢迎回来，底牌还在。'})).toBeVisible();
  await expect(page.getByRole('button',{name:'登录并继续',exact:true})).toBeVisible();
  expect(apiRequests).toEqual([]);expect(errors).toEqual([]);
  await testInfo.attach('guest-network-proof',{body:JSON.stringify({width,tutorialSteps:4,refreshResumed:true,endedCacheRemoved:true,apiRequests,pageErrors:errors},null,2),contentType:'application/json'});
});

test('expired or missing guest temporary room returns home without a network recovery request',async({page})=>{
  const apiRequests:string[]=[];page.on('request',request=>{if(/\/api\//.test(new URL(request.url()).pathname))apiRequests.push(request.url())});
  await page.route('**/api/**',route=>route.abort());
  await page.addInitScript(()=>localStorage.setItem('offer-active-room','local_finished-or-expired'));
  await page.goto('./');await expect(page.locator('.hotspot-play')).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('offer-active-room'))).toBeNull();expect(apiRequests).toEqual([]);
});
