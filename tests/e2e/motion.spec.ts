import {test,expect,type Page} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
test.use({reducedMotion:'no-preference'});
async function api(page:Page,path:string,body?:unknown){return page.evaluate(async({path,body})=>{const response=await fetch(path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:`Bearer ${localStorage.getItem('offer-session')}`},...(body?{body:JSON.stringify(body)}:{})});return response.json()},{path,body})}
async function state(page:Page){return api(page,`/api/rooms/${await page.evaluate(()=>localStorage.getItem('offer-active-room'))}`)}
async function fixture(page:Page,lessonId:string){await page.goto('/');await page.waitForFunction(()=>!!localStorage.getItem('offer-session'));const room=await api(page,'/api/rooms',{mode:'bot',training:true,lessonId});await page.evaluate(id=>localStorage.setItem('offer-active-room',id),room.room.id);await page.reload();await expect(page.locator('.tutorial-coach')).toBeVisible();return room}
async function idle(page:Page){await expect(page.locator('.battle-effects')).toHaveAttribute('data-busy','false')}

test('attack flies to its actual target and a lethal defender retains a retirement ghost',async({page})=>{
 await page.addInitScript(()=>{const NativeAudio=window.Audio;(window as any).__soundStarts=[];window.Audio=function(src?:string){const a=new NativeAudio(src);a.addEventListener('play',()=>{if(src?.includes('/sfx/'))(window as any).__soundStarts.push(src)});return a} as unknown as typeof Audio;});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await fixture(page,'L02');
 let s=await state(page),c=s.room.tutorial.allowedCommands[0];await page.locator(`[data-hand-id="${c.cardId}"] button`).click();await page.locator('.target-options button').click();await expect.poll(async()=>(await state(page)).room.tutorial.stepIndex).toBe(1);await idle(page);
 s=await state(page);c=s.room.tutorial.allowedCommands[0];const targetId=c.targetId;const soundIndex=await page.evaluate(()=>(window as any).__soundStarts.length);
 const enemy=s.view.players.find((p:any)=>p.id!==s.view.selfId),followerId=enemy.board.find((u:any)=>u.definitionId==='N01').id;
 const row=page.locator(`[data-battle-row="${enemy.id}"]`),dead=row.locator(`[data-battle-id="${targetId}"]`),follower=row.locator(`[data-battle-id="${followerId}"]`);
 // Use row-relative x so the intentional whole-arena impact shake cannot look like a slot change.
 const slotX=(id:string)=>row.locator(`[data-battle-id="${id}"]`).evaluate(el=>el.getBoundingClientRect().left-el.parentElement!.getBoundingClientRect().left);
 // The preceding spell's hit rotation can outlast its busy label; measure the settled slot.
 await dead.evaluate(el=>Promise.all(el.getAnimations().map(animation=>animation.finished.catch(()=>{}))));
 const deadX=await slotX(targetId),followerX=await slotX(followerId);expect(followerX).toBeGreaterThan(deadX+20);
 await page.locator(`[data-battle-id="${c.cardId}"] .unit-main`).click();await dead.locator('.unit-main').click();
 await expect(page.locator('.battle-fx-flight')).toBeVisible();await expect(dead).toHaveAttribute('data-departing','true');await expect(page.locator('.battle-effects')).toHaveCSS('pointer-events','none');
 const motion=page.evaluate(({followerId,targetId,enemyId})=>new Promise<{x:number;flight:boolean;ghost:boolean;departing:boolean}[]>((resolve,reject)=>{
  const samples:{x:number;flight:boolean;ghost:boolean;departing:boolean}[]=[];let seenGhost=false;const started=performance.now();
  const sample=()=>{const row=document.querySelector(`[data-battle-row="${enemyId}"]`)!,follower=row.querySelector(`[data-battle-id="${followerId}"]`)!;const flight=!!document.querySelector('.battle-fx-flight'),ghost=!!document.querySelector(`.battle-fx-ghost[data-departure-id="${targetId}"]`);
   if(flight||ghost)samples.push({x:follower.getBoundingClientRect().left-row.getBoundingClientRect().left,flight,ghost,departing:row.querySelector(`[data-battle-id="${targetId}"]`)?.getAttribute('data-departing')==='true'});
   if(seenGhost&&!ghost){resolve(samples);return}seenGhost ||= ghost;if(performance.now()-started>10000){reject(Error('Retirement ghost did not complete'));return}requestAnimationFrame(sample);
  };sample();
 }),{followerId,targetId,enemyId:enemy.id});
 await expect(page.locator(`.battle-fx-ghost[data-departure-id="${targetId}"]`)).toBeVisible();await mkdir('evidence/screenshots',{recursive:true});await page.screenshot({path:'evidence/screenshots/attack-impact.png'});
 const samples=await motion;expect(samples.some(s=>s.flight&&s.ghost)).toBe(true);expect(samples.filter(s=>s.ghost).every(s=>s.departing)).toBe(true);expect(Math.max(...samples.map(s=>Math.abs(s.x-followerX)))).toBeLessThan(1.5);
 // The fading copy must finish before the original leaves and the survivor eases into its slot.
 await expect(dead).toHaveCount(0,{timeout:500});await expect.poll(async()=>Math.abs((await slotX(followerId))-deadX),{timeout:500,intervals:[16,32,50]}).toBeLessThan(1.5);await expect(follower).toBeVisible();await expect(page.locator(`[data-battle-id="${targetId}"]`)).toHaveCount(0);await idle(page);
 const attackSounds=await page.evaluate(index=>(window as any).__soundStarts.slice(index).map((src:string)=>src.split('?')[0].split('/').at(-1)),soundIndex);expect(attackSounds.filter((x:string)=>x==='attack.wav')).toHaveLength(1);expect(attackSounds.filter((x:string)=>x==='damage.wav')).toHaveLength(1);
 const after=await state(page);expect(after.view.players[1].board.some((u:any)=>u.id===targetId)).toBe(false);expect(after.room.tutorial.stepIndex).toBe(2);
 await page.reload();await expect(page.locator('.tutorial-coach')).toBeVisible();await expect(page.locator('.battle-effects')).toHaveAttribute('data-busy','false');expect(await page.locator('.battle-fx-flight').count()).toBe(0);expect(errors).toEqual([]);
});

test('secondary skill plays the generated video and the in-game reduced-motion switch suppresses later flight',async({page})=>{
 await fixture(page,'L04');let s=await state(page);
 await page.locator('[data-tutorial="primary"]').click();await page.locator('.target-options button').click();await expect.poll(async()=>(await state(page)).room.tutorial.stepIndex).toBe(1);await idle(page);
 await page.locator('[data-tutorial="endTurn"]').click();await expect.poll(async()=>(await state(page)).room.tutorial.stepIndex).toBe(2);await idle(page);
 await page.locator('[data-tutorial="secondary"]').click();await page.locator('.target-options button').click();await expect(page.locator('.battle-fx-video')).toBeVisible();
 await expect.poll(()=>page.locator('.battle-fx-video').evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(.1);await page.waitForTimeout(300);await page.screenshot({path:'evidence/screenshots/skill-burst.png'});await idle(page);
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'减少动态效果',exact:true}).click();await page.getByRole('button',{name:'关闭',exact:true}).click();
 await expect(page.locator('.battle-effects')).toHaveAttribute('data-reduced-motion','true');s=await state(page);const c=s.room.tutorial.allowedCommands[0];await page.locator(`[data-battle-id="${c.cardId}"] .unit-main`).click();await page.locator('.target-options button').click();await expect.poll(async()=>(await state(page)).room.tutorial.completed).toBe(true);expect(await page.locator('.battle-fx-flight').count()).toBe(0);expect(await page.locator('.battle-fx-video').count()).toBe(0);
});

test('a normal finished match can rematch with version reset while retaining the room',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'先玩一局',exact:true}).click();await page.getByRole('button',{name:'就用这套，开始对局',exact:true}).click();await expect(page.locator('.battle-page')).toBeVisible();await expect.poll(async()=>(await state(page)).view.activePlayerId).toBe('p1');const before=await state(page);
 await api(page,`/api/rooms/${before.room.id}/command`,{matchId:before.view.matchId,commandId:crypto.randomUUID(),expectedStateVersion:before.view.version,type:'CONCEDE',payload:{type:'CONCEDE'}});await expect(page.locator('.result-banner')).toBeVisible();await page.getByRole('button',{name:'同样阵容再来'}).click();await expect(page.locator('.result-banner')).toHaveCount(0);await expect(page.locator('.battle-page')).toBeVisible();
 const after=await state(page);expect(after.room.id).toBe(before.room.id);expect(after.view.matchId).not.toBe(before.view.matchId);expect(after.view.phase).not.toBe('finished');
});
