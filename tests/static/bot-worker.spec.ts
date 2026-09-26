import {test,expect} from '@playwright/test';
import {createMatch,defaultLoadout} from '../../src/game/index';
import type {Unit} from '../../src/game/types';
function fixture(){const loadouts=[defaultLoadout('p1','测试玩家',5),defaultLoadout('p2','终面Boss',6)] as const;const state=createMatch([...loadouts],981,{skipSetup:true,matchId:'worker-live-fixture'});state.activePlayerId='p2';state.round=7;state.topic='future';for(const p of state.players){p.ownTurn=4;p.timeRemaining=8;p.education.usedThisOwnTurn=false;p.hand=['N07','N10','N16','N18','N11'].map((definitionId,i)=>({id:`fixture-${p.id}-${i}`,definitionId,kind:'card' as const,taxes:[],knownTo:[]}));p.board=Array.from({length:3},(_,i)=>({id:`unit-${p.id}-${i}`,ownerId:p.id,definitionId:'N02',name:'测试角色',kind:'support',originalTime:2,baseAttack:3+i,baseHealth:7,damage:0,ageStage:0,tags:[],modifiers:[],deployedTurn:3,attacked:false,rush:false,taunt:i===0,frozenUntilTurn:0,managed:false,equityDisabled:false,protectionUsed:false} satisfies Unit))}return {state,loadouts}}
test('expert guest search runs in a real worker while animation frames continue; new match cancels old work',async({page})=>{
 await page.goto('./');const f=fixture();
 const result=await page.evaluate(async({state,loadouts})=>{
  const moduleUrl=new URL('src/local-backend.ts',location.href).href;const {LocalBackend}=await import(/* @vite-ignore */ moduleUrl);
  class Memory {values=new Map<string,string>();getItem(k:string){return this.values.get(k)??null}setItem(k:string,v:string){this.values.set(k,v)}removeItem(k:string){this.values.delete(k)}}
  const persistentStorage=new Memory(),transientStorage=new Memory(),native=window.Worker;let started=0,terminated=0,messages=0;
  window.Worker=class extends native {constructor(url:string|URL,options?:WorkerOptions){super(url,options);started++;this.addEventListener('message',()=>messages++)}terminate(){terminated++;super.terminate()}};
  const room={id:'local_worker_fixture',code:'LOCAL',mode:'bot',strategy:'control',difficulty:'expert',setupMode:'quick',botVersion:'2.2.0',botSeed:111,training:true,status:'playing',seats:loadouts.map((loadout,index)=>({id:loadout.playerId,name:loadout.name,loadout,isBot:index===1,ready:true})),state,initialState:state,journal:[],receipts:{},deadline:null,lastBotAt:0,seed:981,skipSetup:true};
  transientStorage.setItem('offer-local-active-v1',JSON.stringify({expiresAt:Date.now()+60000,room}));
  const backend=new LocalBackend({persistentStorage,transientStorage,autoTick:false,botDelayMs:0});const socket=backend.connect(room.id);await Promise.resolve();
  const frames:number[]=[];let stop=false;const frame=(now:number)=>{frames.push(now);if(!stop)requestAnimationFrame(frame)};requestAnimationFrame(frame);
  backend.tick();const thinking=backend.request(`/api/rooms/${room.id}`).room.botThinking;
  const until=Date.now()+4000;while(backend.request(`/api/rooms/${room.id}`).view.version===state.version&&Date.now()<until)await new Promise(r=>setTimeout(r,10));
  const completed=backend.getReplay(room.id),version=backend.request(`/api/rooms/${room.id}`).view.version;
  backend.tick();const beforeCancel=backend.request(`/api/rooms/${room.id}`).view.version;
  const fresh=backend.request('/api/rooms',{mode:'bot',difficulty:'normal',training:true,setupMode:'full'},'POST');
  await new Promise(r=>setTimeout(r,200));const afterCancel=backend.request(`/api/rooms/${room.id}`).view.version;
  stop=true;socket.close();backend.dispose();window.Worker=native;
  return {thinking,version,startVersion:state.version,started,terminated,messages,frameCount:frames.length,maxFrameGap:Math.max(0,...frames.slice(1).map((n,i)=>n-frames[i])),decision:completed.botDecisions?.[0],beforeCancel,afterCancel,freshMatchId:fresh.view.matchId};
 },f);
 expect(result.thinking).toBe(true);expect(result.version).toBeGreaterThan(result.startVersion);expect(result.started).toBeGreaterThanOrEqual(1);expect(result.messages).toBeGreaterThanOrEqual(1);expect(result.frameCount).toBeGreaterThan(3);expect(result.decision?.fallbackReason).not.toBe('worker-error');expect(result.decision?.fallbackReason).not.toBe('worker-timeout');expect(result.beforeCancel).toBe(result.afterCancel);expect(result.terminated).toBe(result.started);
 await test.info().attach('worker-runtime.json',{body:JSON.stringify(result,null,2),contentType:'application/json'});
});
