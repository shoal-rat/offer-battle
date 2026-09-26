import {test,expect} from '@playwright/test';
test('six new music tracks, sixteen sound effects, and the generated video decode in the browser',async({page})=>{
 await page.goto('/');
 const media=await page.evaluate(async()=>{
  const manifest=await fetch('/assets/audio/music/score-manifest.json').then(r=>r.json());
  const catalog=await fetch('/assets/manifest.json').then(r=>r.json());
  const tracks=[...manifest.tracks,...Object.values(catalog.assets).filter((a:any)=>a.id.startsWith('sfx_')).map((a:any)=>({id:a.id,file:a.url}))];
  const results=[];
  for(const track of tracks){
   const audio=new Audio(track.file);
   const result=await new Promise<{id:string;duration:number;error:number|null}>(resolve=>{
    const timeout=setTimeout(()=>resolve({id:track.id,duration:0,error:-1}),8000);
    audio.oncanplaythrough=()=>{clearTimeout(timeout);resolve({id:track.id,duration:audio.duration,error:null})};
    audio.onerror=()=>{clearTimeout(timeout);resolve({id:track.id,duration:0,error:audio.error?.code||-2})};audio.load();
   });results.push(result);audio.removeAttribute('src');audio.load();
  }
  const video=document.createElement('video');video.muted=true;video.src='/assets/animations/alumni-burst.mp4';
  const motion=await new Promise<{width:number;height:number;duration:number;error:number|null}>(resolve=>{const timeout=setTimeout(()=>resolve({width:0,height:0,duration:0,error:-1}),8000);video.oncanplaythrough=()=>{clearTimeout(timeout);resolve({width:video.videoWidth,height:video.videoHeight,duration:video.duration,error:null})};video.onerror=()=>{clearTimeout(timeout);resolve({width:0,height:0,duration:0,error:video.error?.code||-2})};video.load()});
  return {results,motion};
 });
 expect(media.results).toHaveLength(22);for(const item of media.results){expect(item.error,item.id).toBeNull();expect(item.duration,item.id).toBeGreaterThan(item.id.startsWith('sfx_')?.05:10)}
 expect(media.motion).toEqual({width:960,height:548,duration:expect.any(Number),error:null});expect(media.motion.duration).toBeGreaterThan(5);
});

test('music starts after a gesture, changes for the academy, and mute persists after reload',async({page})=>{
 await page.addInitScript(()=>{
  const OriginalAudio=window.Audio;
  (window as any).__gameAudio=[];
  window.Audio=function(src?:string){const a=new OriginalAudio(src);(window as any).__gameAudio.push(a);return a} as unknown as typeof Audio;
 });
 await page.goto('/');await page.getByRole('button',{name:'设置',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__gameAudio.some((a:HTMLAudioElement)=>new URL(a.src).pathname.endsWith('/music/lobby.mp3')&&!a.paused&&a.currentTime>0))).toBe(true);
 await page.getByRole('button',{name:'关闭',exact:true}).click();await page.getByRole('button',{name:/跟着前辈，打会第一局/}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__gameAudio.some((a:HTMLAudioElement)=>new URL(a.src).pathname.endsWith('/music/tutorial.mp3')&&!a.paused&&a.currentTime>0))).toBe(true);
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'切换音效',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__gameAudio.every((a:HTMLAudioElement)=>a.paused))).toBe(true);
 expect(await page.evaluate(()=>localStorage.getItem('offer-sound'))).toBe('0');await page.reload();await page.getByRole('button',{name:'设置',exact:true}).click();await expect(page.getByRole('button',{name:'切换音效',exact:true})).not.toHaveClass(/on/);
 expect(await page.evaluate(()=>(window as any).__gameAudio.every((a:HTMLAudioElement)=>a.paused))).toBe(true);
});
