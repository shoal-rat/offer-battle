import {test,expect} from '@playwright/test';
import {writeFile,unlink} from 'node:fs/promises';

test('writing a test report never reloads a live match or inserts the home page',async({page})=>{
 const generated=`work/preview-reload-regression-${Date.now()}.html`;
 await page.goto('/');await page.getByRole('button',{name:/跟着前辈，打会第一局/}).click();await page.getByRole('button',{name:'开始第一课',exact:true}).click();await expect(page.locator('.tutorial-coach')).toBeVisible();
 const roomId=await page.evaluate(()=>localStorage.getItem('offer-active-room'));
 let navigations=0;page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++});
 await page.evaluate(()=>{(window as any).__homeWasInserted=false;const observer=new MutationObserver(()=>{if(document.querySelector('.home'))(window as any).__homeWasInserted=true});observer.observe(document.body,{subtree:true,childList:true});});
 try{
  await writeFile(generated,'<!doctype html><title>Generated report</title><p>First report</p>');
  await page.waitForTimeout(600);
  await writeFile(generated,'<!doctype html><title>Generated report</title><p>Updated report</p>');
  await page.waitForTimeout(1200);
  expect(navigations).toBe(0);expect(await page.evaluate(()=>(window as any).__homeWasInserted)).toBe(false);
  await expect(page.locator('.tutorial-coach')).toBeVisible();expect(await page.evaluate(()=>localStorage.getItem('offer-active-room'))).toBe(roomId);
  if(process.env.E2E_PRODUCTION)expect(await page.locator('script[src*="@vite"]').count()).toBe(0);
 }finally{await unlink(generated).catch(()=>{});}
});
