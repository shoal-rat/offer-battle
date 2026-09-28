import {test,expect,type Page,type WebSocketRoute} from '@playwright/test';
import {MOTION_LIMITS} from '../../src/motion/cues';
import {writeFile,mkdir} from 'node:fs/promises';
import {createMatch,applyCommand,getView,defaultLoadout,chooseBotCommand} from '../../src/game/index';
import type {MatchState,Command} from '../../src/game/types';

test.use({reducedMotion:'no-preference'});
function execute(state:MatchState,actor:string,command:Command){const r=applyCommand(state,actor,command);expect(r.error,JSON.stringify(command)).toBeUndefined();return r.state}
function fixture(id='motion-22'){
 let state=createMatch([defaultLoadout('p1','测试甲',5),defaultLoadout('p2','测试乙',5)],412,{skipSetup:true,matchId:id});state.round=5;state.activePlayerId='p1';
 for(const p of state.players){p.ownTurn=5;p.timeRemaining=8;p.board=[];p.hand=[];p.retort=null;}
 for(const actor of ['p1','p2'])for(let n=0;n<2;n++){state.activePlayerId=actor;state.players.find(p=>p.id===actor)!.timeRemaining=8;state.players.find(p=>p.id===actor)!.hand.push({id:`card-${actor}-${n}`,definitionId:'N01',kind:'card',taxes:[],knownTo:[]});state=execute(state,actor,{type:'PLAY_CARD',cardId:`card-${actor}-${n}`});}
 state.activePlayerId='p1';for(const p of state.players){p.timeRemaining=8;for(const u of p.board){u.deployedTurn=4;u.damage=1;}}
 state.events=[];state.eventSequence=0;state.version=0;return state;
}
function attack(state:MatchState,lethal=false){const s=structuredClone(state);if(lethal)s.players[1].mind=1;return execute(s,'p1',{type:'ATTACK',cardId:s.players[0].board[0].id,targetId:lethal?'p2':s.players[1].board[0].id})}
async function wire(page:Page,state:MatchState,reduced=false){let current=state,channel:WebSocketRoute|undefined;
 const snapshot=()=>({room:{id:'motion-room',code:'MOTN22',status:current.phase==='finished'?'finished':'playing',mode:'friend',players:current.players.map(p=>({id:p.id,name:p.name,ready:true,connected:true,isBot:false})),deadline:null,version:current.version},view:getView(current,'p1'),playerId:'p1',roomId:'motion-room'});
 await page.addInitScript(({reduced})=>{localStorage.setItem('offer-session','motion-test-token');localStorage.setItem('offer-active-room','motion-room');localStorage.setItem('offer-sound','0');localStorage.setItem('offer-motion-preference',reduced?'reduced':'full');},{reduced});
 await page.route('**/api/session',r=>r.fulfill({json:{token:'motion-test-token',profile:{id:'p1',nickname:'测试甲',offers:[]}}}));
 await page.route('**/api/rooms/motion-room',r=>r.fulfill({json:snapshot()}));
 await page.routeWebSocket('**/ws?*',socket=>{channel=socket;socket.send(JSON.stringify({type:'state',...snapshot()}));});
 await page.goto('/');await expect(page.locator('.battle-page')).toBeVisible();await expect.poll(()=>!!channel).toBe(true);await expect(page.locator('.battle-effects')).toHaveAttribute('data-reduced-motion',String(reduced));await page.evaluate(()=>document.fonts.ready);
 return async(next:MatchState)=>{current=next;channel!.send(JSON.stringify({type:'state',...snapshot()}));await expect(page.locator('.battle-page')).toHaveAttribute('data-state-version',String(next.version));};
}
async function sample(page:Page){await page.evaluate(()=>{const w=window as any;w.__motionFrames=[];w.__motionSampling=true;let last=performance.now();const tick=(at:number)=>{const effects=document.querySelector<HTMLElement>('.battle-effects');w.__motionFrames.push({at,delta:at-last,phase:effects?.dataset.phase,busy:effects?.dataset.busy,ghosts:document.querySelectorAll('.battle-fx-ghost').length,flights:document.querySelectorAll('.battle-fx-flight').length,particles:document.querySelectorAll('.paper-fx-chip').length,ending:!!document.querySelector('.battle-defeat'),result:!!document.querySelector('.result-banner'),slots:[...document.querySelectorAll<HTMLElement>('.battle-page .battle-unit')].map(n=>({id:n.dataset.battleId,departing:n.dataset.departing,x:n.getBoundingClientRect().x,transform:getComputedStyle(n.querySelector('.unit-health')!).transform}))});last=at;if(w.__motionSampling)requestAnimationFrame(tick)};requestAnimationFrame(tick);});}
async function stop(page:Page){return page.evaluate(()=>{const w=window as any;w.__motionSampling=false;return w.__motionFrames as any[]})}

test('normal-speed contact keeps reserved slots and readable UI, then compacts after retirement',async({page})=>{
 const state=fixture(),send=await wire(page,state),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await sample(page);await send(attack(state));
 // Read-only controls work while formal battle effects are active.
 await page.getByRole('button',{name:'战斗记录',exact:true}).click();await expect(page.getByText('这局都发生了什么',{exact:true})).toBeVisible();
 await expect(page.locator('.battle-effects')).toHaveAttribute('data-busy','false');await page.waitForTimeout(240);const frames=await stop(page);await mkdir('work/motion-v22',{recursive:true});await writeFile('work/motion-v22/contact-frames.json',JSON.stringify({cues:getView(attack(state),'p1').visualCues,frames},null,2));
 expect(frames.some(f=>f.flights>0)).toBe(true);expect(frames.some(f=>f.ghosts===2)).toBe(true);
 const dying=new Set([state.players[0].board[0].id,state.players[1].board[0].id]);
 for(const f of frames.filter(f=>f.ghosts>0)){expect(f.slots.filter((s:any)=>dying.has(s.id)&&s.departing==='true')).toHaveLength(2);for(const s of f.slots)expect(s.transform).toBe('none');}
 await expect(page.locator('[data-departing=true]')).toHaveCount(0);await expect(page.locator('.battle-fx-ghost')).toHaveCount(0);expect(errors).toEqual([]);
});

test('real layered SVG masks remain local and unique in attack flights and retirement ghosts',async({page})=>{
 const state=fixture('layered-clones');
 // Use an approved three-mask character on this engine fixture independently of support art revisions.
 for(const p of state.players)p.board[0].templateId='T01';
 const send=await wire(page,state);
 for(const p of state.players)await expect(page.locator(`.battle-page [data-battle-id="${p.board[0].id}"] svg[data-art-layering="complementary-runtime-masks"]`)).toBeVisible();
 await page.evaluate(()=>{
  const w=window as any;w.__cloneMaskSamples=[];w.__cloneMaskSampling=true;
  const liveIds=new Set([...document.querySelectorAll('.battle-page [id]')].map(el=>el.id));
  const inspect=()=>{
   for(const host of document.querySelectorAll('.battle-fx-flight,.battle-fx-ghost')){
    const errors:string[]=[];let refs=0;
    const svgs=[...host.querySelectorAll('svg[data-art-layering="complementary-runtime-masks"]')];
    for(const svg of svgs){
     for(const part of ['body','face','prop'])if(!svg.querySelector(`[data-rig-layer="${part}"] image[mask]`))errors.push(`missing layer ${part}`);
     for(const node of [svg,...svg.querySelectorAll('*')])for(const attribute of [...node.attributes]){
      const ids=[...attribute.value.matchAll(/url\(\s*['"]?#([^)'"\s]+)['"]?\s*\)/g)].map(m=>m[1]);
      if(['href','xlink:href'].includes(attribute.name)&&attribute.value.startsWith('#'))ids.push(attribute.value.slice(1));
      for(const id of ids){refs++;const selector=`[id="${CSS.escape(id)}"]`;if(svg.querySelectorAll(`defs ${selector}`).length!==1)errors.push(`unresolved local reference ${id}`);if(document.querySelectorAll(selector).length!==1)errors.push(`duplicate document ID ${id}`);if(liveIds.has(id))errors.push(`live ID collision ${id}`);}
     }
    }
    w.__cloneMaskSamples.push({kind:host.classList.contains('battle-fx-flight')?'flight':'ghost',svgs:svgs.length,refs,errors});
   }
   if(w.__cloneMaskSampling)requestAnimationFrame(inspect);
  };requestAnimationFrame(inspect);
 });
 await send(attack(state));await expect(page.locator('.battle-effects')).toHaveAttribute('data-busy','false');
 const samples=await page.evaluate(()=>{const w=window as any;w.__cloneMaskSampling=false;return w.__cloneMaskSamples as {kind:string;svgs:number;refs:number;errors:string[]}[]});
 for(const kind of ['flight','ghost'])expect(samples.some(s=>s.kind===kind&&s.svgs>0&&s.refs>=3),`${kind} must retain actual body, face and prop masks`).toBe(true);
 expect(samples.flatMap(s=>s.errors)).toEqual([]);
 await mkdir('work/motion-v22',{recursive:true});await writeFile('work/motion-v22/clone-masks.json',JSON.stringify({samples:samples.length,flights:samples.filter(s=>s.kind==='flight').length,ghosts:samples.filter(s=>s.kind==='ghost').length,errors:samples.flatMap(s=>s.errors)},null,2));
});

test('rapid confirmed snapshots cannot strand results behind battle queues; full and reduced finish once',async({page})=>{
 const state=fixture(),send=await wire(page,state);await sample(page);
 // One authoritative snapshot may carry multiple public resolver groups after reconnect.
 const crowded=structuredClone(state);for(let i=0;i<12;i++){crowded.version++;crowded.eventSequence++;crowded.events.push({sequence:crowded.eventSequence,type:'card',text:'已确认行动',actorId:'p1',visual:{kind:'card',playerId:'p1',label:'已确认行动'}} as any)}
 await send(crowded);await send(attack(crowded,true));await expect(page.locator('.result-banner')).toBeVisible();const frames=await stop(page);
 const received=frames.find(f=>f.phase==='finished'),result=frames.find(f=>f.result);await mkdir('work/motion-v22',{recursive:true});await writeFile('work/motion-v22/result-deadline.json',JSON.stringify({receivedAt:received?.at,resultAt:result?.at,elapsedMs:result?.at-received?.at,resultOverlap:frames.some(f=>f.ending&&f.result)},null,2));expect(received).toBeTruthy();expect(result).toBeTruthy();expect(result.at-received.at).toBeLessThanOrEqual(MOTION_LIMITS.resultDeadlineMs);expect(frames.some(f=>f.ending&&f.result)).toBe(false);expect(frames.some(f=>f.ending)).toBe(true);
 await expect(page.locator('.battle-effects')).toHaveAttribute('data-busy','false');await expect(page.locator('.battle-effects')).toHaveAttribute('data-director-errors','0');
 await send(attack(crowded,true));await page.waitForTimeout(200);await expect(page.locator('.battle-defeat')).toHaveCount(0);
});

test('reduced mode, hidden lifecycle and ten match replacements clean all battle resources',async({page})=>{
 let state=fixture(),send=await wire(page,state,true);await sample(page);await send(attack(state,true));await expect(page.locator('.result-banner')).toBeVisible();let frames=await stop(page);expect(frames.every(f=>!f.flights&&!f.particles)).toBe(true);
 await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>{localStorage.setItem('offer-motion-preference','full');window.dispatchEvent(new Event('storage'))});await expect(page.locator('.battle-effects')).toHaveAttribute('data-reduced-motion','false');
 for(let n=0;n<10;n++){
  state=fixture(`replacement-${n}`);await send(state);const afterAttack=attack(state);await send(afterAttack);if(n===0)await expect(page.locator('.battle-fx-flight')).toBeVisible();
  // Deterministic visibility event exercises browser resource ownership; this is not OS throttling.
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))});
  await send(attack(afterAttack));
  await expect(page.locator('.battle-effects')).toHaveAttribute('data-busy','false');
  await expect(page.locator('.battle-effects')).toHaveAttribute('data-director-timers','0');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'))});
  await expect(page.locator('.battle-fx-ghost,.battle-fx-flight,.battle-defeat')).toHaveCount(0);
 }
 await expect(page.locator('[data-departing=true]')).toHaveCount(0);await expect(page.locator('.battle-effects')).toHaveAttribute('data-director-active','0');
});

test('normal 30-second interaction recording measures frame budget without speeding time',async({page},info)=>{
 test.setTimeout(60000);// PW_CPU_THROTTLE=n slows the main thread n× to probe the budget on a fast machine.
 if(process.env.PW_CPU_THROTTLE)await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate',{rate:Number(process.env.PW_CPU_THROTTLE)});let state=fixture();const send=await wire(page,state);await sample(page);const started=Date.now();let actions=0;
 while(Date.now()-started<30000){if(state.phase==='finished')state=fixture(`performance-${actions}`);const actor=state.pendingChoice?.ownerId??state.activePlayerId,command=chooseBotCommand(getView(state,actor),'control');if(command){state=execute(state,actor,command);actions++;await send(state)}await page.waitForTimeout(700)}
 const frames=await stop(page),deltas=frames.slice(1).map(f=>f.delta).sort((a,b)=>a-b),p95=deltas[Math.floor(deltas.length*.95)],over50=deltas.filter(d=>d>50).length/deltas.length;
 const platform=await page.evaluate(()=>({userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency,viewport:[innerWidth,innerHeight],devicePixelRatio,visibility:document.visibilityState}));
 const report={actions,sampleMs:frames.at(-1).at-frames[0].at,frames:frames.length,estimatedRefreshHz:1000/deltas[Math.floor(deltas.length*.5)],p95Ms:p95,over50Ratio:over50,...platform,method:'Real-time Chromium requestAnimationFrame sampling with confirmed engine events; headless laboratory sample, not a physical mobile device.'};
 await mkdir('work/motion-v22',{recursive:true});await writeFile('work/motion-v22/frame-budget.json',JSON.stringify(report,null,2));await info.attach('normal-frame-budget',{body:JSON.stringify(report,null,2),contentType:'application/json'});
 // Development machines hold the strict 60 Hz budget. Shared CI runners rasterise the paper table in software on 2–4 vCPUs,
 // so there the check only guards against a real regression; slow devices are handled in-app by the frame-budget governor.
 const budget=process.env.CI?{p95:40,over50:.03}:{p95:25,over50:.01};
 expect(report.sampleMs).toBeGreaterThanOrEqual(29000);expect(p95).toBeLessThanOrEqual(budget.p95);expect(over50).toBeLessThanOrEqual(budget.over50);
});

test('mobile result recap links to its actual replay event and opponent rules remain legible',async({page})=>{
 await page.setViewportSize({width:390,height:844});const state=fixture(),finished=attack(state,true);
 await page.route('**/api/rooms/motion-room/replay?*',r=>r.fulfill({json:{frames:[getView(state,'p1'),getView(finished,'p1')],verified:true}}));
 const send=await wire(page,state,true);const rules=await page.locator('.opponent-skill-effect').evaluateAll(nodes=>nodes.map(n=>({size:parseFloat(getComputedStyle(n).fontSize),right:n.getBoundingClientRect().right,left:n.getBoundingClientRect().left})));for(const rule of rules){expect(rule.size).toBeGreaterThanOrEqual(13);expect(rule.left).toBeGreaterThanOrEqual(0);expect(rule.right).toBeLessThanOrEqual(390)}
 await send(finished);await expect(page.locator('.result-banner')).toBeVisible();await expect(page.getByRole('region',{name:'本局复盘'})).toBeVisible();await page.getByRole('button',{name:'回看终局',exact:true}).click();
 const replay=page.getByRole('dialog',{name:'把这一局，重新走一遍。'});await expect(replay.getByLabel('回放进度')).toHaveValue('1');await expect(replay.getByText(/已定位到包含事件/)).toBeVisible();await replay.getByText(/按公开事件跳转/).click();await expect(replay.locator('.replay-event-list li')).toHaveCount(finished.events.length);
 await mkdir('work/motion-v22',{recursive:true});await page.screenshot({path:'work/motion-v22/mobile-replay.png'});
});
