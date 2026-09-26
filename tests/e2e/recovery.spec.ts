import {test,expect,type Page,type APIRequestContext} from '@playwright/test';

async function savedRoom(request:APIRequestContext){
 const sessionResponse=await request.post('/api/session',{data:{nickname:'恢复连接测试'}});
 expect(sessionResponse.ok()).toBe(true);
 const session=await sessionResponse.json();
 const response=await request.post('/api/rooms',{headers:{Authorization:`Bearer ${session.token}`},data:{mode:'bot',training:true,lessonId:'L01'}});
 expect(response.ok()).toBe(true);
 return {token:session.token,...await response.json()};
}
async function prepare(page:Page,saved:{token:string;room:{id:string}}){
 await page.addInitScript(({token,id})=>{
  localStorage.setItem('offer-session',token);localStorage.setItem('offer-active-room',id);localStorage.setItem('offer-sound','0');localStorage.setItem('offer-reduced','1');
  (window as any).__recoveryHomeSeen=false;
  new MutationObserver(()=>{if(document.querySelector('.paper-stage'))(window as any).__recoveryHomeSeen=true}).observe(document,{childList:true,subtree:true});
 },{token:saved.token,id:saved.room.id});
}
function latch(){let release!:()=>void;const promise=new Promise<void>(resolve=>{release=resolve});return {promise,release};}

test('saved room shows a dedicated loading screen without a home flash, then restores once',async({page,request})=>{
 const saved=await savedRoom(request);await prepare(page,saved);
 const requested=latch(),responseReady=latch();let requests=0;
 await page.route(`**/api/rooms/${saved.room.id}`,async route=>{requests++;requested.release();await responseReady.promise;await route.continue()});
 try{
  await page.goto('/');await requested.promise;
  await expect(page.getByRole('main',{name:'恢复对局'})).toBeVisible();await expect(page.getByText('正在回到你的牌桌。',{exact:true})).toBeVisible();await expect(page.locator('.paper-stage')).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).__recoveryHomeSeen)).toBe(false);
  responseReady.release();await expect(page.locator('.battle-page')).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('offer-active-room'))).toBe(saved.room.id);
  expect(await page.evaluate(()=>(window as any).__recoveryHomeSeen)).toBe(false);expect(requests).toBe(1);
 }finally{responseReady.release()}
});

test('temporary room connection failure preserves the saved room and retry restores it',async({page,request})=>{
 const saved=await savedRoom(request);await prepare(page,saved);let disconnected=true;
 await page.route(`**/api/rooms/${saved.room.id}`,route=>disconnected?route.abort('connectionfailed'):route.continue());
 await page.goto('/');await expect(page.getByText('连接暂时中断。',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>localStorage.getItem('offer-active-room'))).toBe(saved.room.id);await expect(page.locator('.paper-stage')).toHaveCount(0);
 disconnected=false;await page.getByRole('button',{name:'重试连接',exact:true}).click();await expect(page.locator('.battle-page')).toBeVisible();
 expect(await page.evaluate(()=>(window as any).__recoveryHomeSeen)).toBe(false);
});

test('temporary session failure preserves recovery and can retry without reloading',async({page,request})=>{
 const saved=await savedRoom(request);await prepare(page,saved);let disconnected=true;
 await page.route('**/api/session',route=>disconnected?route.fulfill({status:503,json:{error:'暂时离线'}}):route.continue());
 await page.goto('/');await expect(page.getByRole('button',{name:'重试连接',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>localStorage.getItem('offer-active-room'))).toBe(saved.room.id);await expect(page.locator('.paper-stage')).toHaveCount(0);
 disconnected=false;await page.getByRole('button',{name:'重试连接',exact:true}).click();await expect(page.locator('.battle-page')).toBeVisible();
});

test('leaving recovery aborts a delayed room response and does not pull a new action back',async({page,request})=>{
 const saved=await savedRoom(request);await prepare(page,saved);const requested=latch(),responseReady=latch();
 await page.route(`**/api/rooms/${saved.room.id}`,async route=>{const response=await route.fetch();requested.release();await responseReady.promise;await route.fulfill({response}).catch(()=>{})});
 try{
  await page.goto('/');await requested.promise;await page.getByRole('button',{name:'返回会客厅',exact:true}).click();
  await expect(page.locator('.paper-stage')).toBeVisible();expect(await page.evaluate(()=>localStorage.getItem('offer-active-room'))).toBeNull();
  await page.locator('.hotspot-tutorial').click();await expect(page.locator('.academy-page')).toBeVisible();
  responseReady.release();await page.waitForTimeout(300);await expect(page.locator('.academy-page')).toBeVisible();await expect(page.locator('.battle-page')).toHaveCount(0);
 }finally{responseReady.release()}
});

test('leaving while session is delayed prevents any late room restore under StrictMode',async({page,request})=>{
 const saved=await savedRoom(request);await prepare(page,saved);const requested=latch(),responseReady=latch();let roomRequests=0;
 await page.route('**/api/session',async route=>{const response=await route.fetch();requested.release();await responseReady.promise;await route.fulfill({response})});
 await page.route(`**/api/rooms/${saved.room.id}`,route=>{roomRequests++;return route.continue()});
 try{
  await page.goto('/');await requested.promise;await page.getByRole('button',{name:'返回会客厅',exact:true}).click();
  await page.locator('.hotspot-tutorial').click();responseReady.release();
  await page.waitForTimeout(300);await expect(page.locator('.academy-page')).toBeVisible();expect(roomRequests).toBe(0);expect(await page.evaluate(()=>localStorage.getItem('offer-active-room'))).toBeNull();
 }finally{responseReady.release()}
});

for(const state of ['missing','finished'] as const)test(`${state} room safely returns home and clears only the saved room`,async({page,request})=>{
 const saved=await savedRoom(request);await prepare(page,saved);
 await page.route(`**/api/rooms/${saved.room.id}`,route=>state==='missing'?route.fulfill({status:404,json:{error:'找不到房间'}}):route.fulfill({status:200,json:{...saved,room:{...saved.room,status:'finished'}}}));
 await page.goto('/');await expect(page.locator('.paper-stage')).toBeVisible();await expect(page.locator('.recovery-screen')).toHaveCount(0);expect(await page.evaluate(()=>localStorage.getItem('offer-active-room'))).toBeNull();
});
