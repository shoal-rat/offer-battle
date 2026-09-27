import {cueByKey,MOTION_LIMITS,type MotionChannel,type MotionCueKey} from './cues';
import {getMotionPreferences,subscribeMotionPreferences,pauseMotionBudgetSampling,type MotionPreferences} from './useMotionPreferences';
export type MotionEndReason='finished'|'cancelled'|'superseded'|'catch-up'|'hidden'|'preference'|'disposed'|'error'|'duplicate'|'unconfirmed';
export interface MotionContext {
 durationMs:number;reduced:boolean;quality:'full'|'compact';signal:AbortSignal;
 later:(callback:()=>void,delayMs:number)=>void;
 animate:(element:Element,frames:Keyframe[]|PropertyIndexedKeyframes,options?:KeyframeAnimationOptions)=>Animation|undefined;
 addCleanup:(cleanup:()=>void)=>void;
}
export interface MotionRequest {
 cue:MotionCueKey;id:string;scope:string;confirmed?:boolean;durationMs?:number;channel?:MotionChannel;
 hold?:boolean;actorIds?:readonly string[];run:(context:MotionContext)=>void|(()=>void);
 onSettled?:(reason:MotionEndReason)=>void;
}
export interface MotionHandle {id:string;finished:Promise<MotionEndReason>;cancel:()=>void;fastForward:()=>void}
interface Scheduler {now:()=>number;set:(callback:()=>void,delayMs:number)=>unknown;clear:(handle:unknown)=>void}
interface Job {compressed?:boolean;request:MotionRequest;key:string;channel:MotionChannel;duration:number;controller:AbortController;cleanups:Set<()=>void>;timers:Set<unknown>;animations:Set<Animation>;started:number|null;resolve:(reason:MotionEndReason)=>void;done:boolean;handle:MotionHandle}
export interface MotionDiagnostics {active:number;queued:number;timers:number;animations:number;scopes:string[];compressed:number;caughtUp:number;errors:number;activeChannels:MotionChannel[]}
const nativeScheduler:Scheduler={now:()=>typeof performance!=='undefined'?performance.now():Date.now(),set:(fn,ms)=>setTimeout(fn,ms),clear:id=>clearTimeout(id as ReturnType<typeof setTimeout>)};
const initialPreferences:MotionPreferences={preference:'system',reduced:false,ambientPaused:false,quality:'full',hidden:false};
const limits:Record<MotionChannel,number>={feedback:4,ambient:2,navigation:1,battle:1,attention:1};

/** Owns visual work only. No rules RNG, network request, or turn deadline is touched. */
export class MotionDirector {
 private active=new Set<Job>();private queue:Job[]=[];private seen=new Set<string>();
 private preferences:MotionPreferences;private listeners=new Set<()=>void>();private disposed=false;
 private counts={compressed:0,caughtUp:0,errors:0};
 constructor(private scheduler:Scheduler=nativeScheduler,preferences:MotionPreferences=initialPreferences){this.preferences={...preferences}}
 actorIds(scope?:string){return new Set([...this.active,...this.queue].filter(job=>!scope||job.request.scope===scope).flatMap(job=>[...(job.request.actorIds??[])]))}
 subscribe(listener:()=>void){this.listeners.add(listener);return()=>{this.listeners.delete(listener)}}
 private emit(){for(const listener of this.listeners)listener()}
 diagnostics():MotionDiagnostics {return {active:this.active.size,queued:this.queue.length,timers:[...this.active].reduce((sum,job)=>sum+job.timers.size,0),animations:[...this.active].reduce((sum,job)=>sum+job.animations.size,0),scopes:[...new Set([...this.active,...this.queue].map(job=>job.request.scope))],...this.counts,activeChannels:[...this.active].map(job=>job.channel)}}
 play(request:MotionRequest):MotionHandle {
  const cue=cueByKey[request.cue],channel=request.channel??cue.channel,key=`${request.scope}:${request.id}:${channel}`;
  let resolve!:(reason:MotionEndReason)=>void;const finished=new Promise<MotionEndReason>(done=>{resolve=done});
  const job:Job={request,key,channel,duration:this.preferences.reduced?cue.reducedDurationMs:request.durationMs??cue.durationMs,controller:new AbortController(),cleanups:new Set(),timers:new Set(),animations:new Set(),started:null,resolve,done:false,handle:null!};
  const handle:MotionHandle={id:request.id,finished,cancel:()=>this.end(job,'cancelled'),fastForward:()=>this.end(job,'catch-up')};job.handle=handle;
  if(this.disposed){this.end(job,'disposed');return handle}
  if(cue.confirmationRequired&&request.confirmed!==true){this.end(job,'unconfirmed');return handle}
  if(this.seen.has(key)){this.end(job,'duplicate');return handle}
  this.seen.add(key);if(this.seen.size>1200)this.seen.delete(this.seen.values().next().value!);
  if(this.preferences.hidden||channel==='ambient'&&(this.preferences.ambientPaused||this.preferences.reduced)){this.end(job,'hidden');return handle}
  if(channel==='navigation')pauseMotionBudgetSampling((request.durationMs??cue.durationMs)+750);
  if(channel==='navigation'||channel==='attention'){
   for(const old of [...this.active,...this.queue])if(old.channel===channel)this.end(old,'superseded',false);
  }
  if(channel==='feedback'&&[...this.active].filter(old=>old.channel===channel).length>=limits.feedback){
   const oldest=[...this.active].find(old=>old.channel===channel);if(oldest)this.end(oldest,'superseded',false);
  }
  if(channel==='battle'){
   const pending=[...this.active,...this.queue].filter(old=>old.channel==='battle'&&old.request.scope===request.scope);
   const budget=pending.reduce((sum,old)=>sum+(old.started===null?old.duration:Math.max(0,old.duration-(this.scheduler.now()-old.started))),0)+job.duration;
   if(budget>MOTION_LIMITS.catchUpAfterMs){this.counts.caughtUp++;for(const old of pending)this.end(old,'catch-up',false);this.end(job,'catch-up');return handle}
   // Speed up what has not started yet instead of flashing it: every blow still reads.
   if(budget>MOTION_LIMITS.compressAfterMs){this.counts.compressed++;const quicker=(ms:number)=>Math.min(ms,Math.max(MOTION_LIMITS.compressFloorMs,Math.round(ms*MOTION_LIMITS.compressScale)));for(const old of pending)if(old.started===null&&!old.compressed){old.duration=quicker(old.duration);old.compressed=true}job.duration=quicker(job.duration);job.compressed=true}
  }
  this.queue.push(job);this.pump();return handle;
 }
 private pump(){
  if(this.disposed)return;
  for(const job of [...this.queue]){
   if(job.done||job.started!==null)continue;
   if([...this.active].filter(active=>active.channel===job.channel).length>=limits[job.channel])continue;
   const actors=new Set(job.request.actorIds??[]);
   if([...this.active].some(active=>(active.request.actorIds??[]).some(id=>actors.has(id))))continue;
   this.queue=this.queue.filter(item=>item!==job);this.start(job);
  }
  this.emit();
 }
 private start(job:Job){
  job.started=this.scheduler.now();this.active.add(job);
  const later=(callback:()=>void,ms:number)=>{
   if(job.done)return;
   const id=this.scheduler.set(()=>{job.timers.delete(id);if(job.done)return;try{callback()}catch{this.counts.errors++;this.end(job,'error')}},Math.max(0,ms));job.timers.add(id);
  };
  const context:MotionContext={durationMs:job.duration,reduced:this.preferences.reduced,quality:this.preferences.quality,signal:job.controller.signal,later,addCleanup:cleanup=>{if(job.done)cleanup();else job.cleanups.add(cleanup)},animate:(element,frames,options={})=>{
   if(job.done||typeof element.animate!=='function')return;
   const animation=element.animate(frames,{duration:job.duration,easing:'cubic-bezier(.2,.7,.3,1)',...options});job.animations.add(animation);
   animation.finished.catch(()=>{}).finally(()=>{job.animations.delete(animation)});return animation;
  }};
  try{const cleanup=job.request.run(context);if(cleanup)context.addCleanup(cleanup)}catch{this.counts.errors++;this.end(job,'error');return}
  // Settlement is an independent bounded timer: decorative completion can never hold input/results.
  if(!job.done&&!job.request.hold)later(()=>this.end(job,'finished'),Math.max(0,job.duration));
 }
 private end(job:Job,reason:MotionEndReason,pump=true){
  if(job.done)return;job.done=true;job.controller.abort(reason);
  this.queue=this.queue.filter(item=>item!==job);this.active.delete(job);
  for(const timer of job.timers)this.scheduler.clear(timer);job.timers.clear();
  for(const animation of job.animations)try{animation.cancel()}catch{}job.animations.clear();
  for(const cleanup of job.cleanups)try{cleanup()}catch{this.counts.errors++}job.cleanups.clear();
  try{job.request.onSettled?.(reason)}catch{this.counts.errors++}job.resolve(reason);
  if(pump)this.pump();
 }
 cancelScope(scope:string,reason:MotionEndReason='cancelled') {for(const job of [...this.active,...this.queue])if(job.request.scope===scope)this.end(job,reason,false);this.pump()}
 catchUp(scope:string){this.counts.caughtUp++;this.cancelScope(scope,'catch-up')}
 setPreferences(next:MotionPreferences){
  const previous=this.preferences;this.preferences={...next};
  if(next.hidden&&!previous.hidden){for(const job of [...this.active,...this.queue])this.end(job,'hidden',false)}
  else if(next.reduced!==previous.reduced||next.quality!==previous.quality){for(const job of [...this.active,...this.queue])this.end(job,'preference',false)}
  else if(next.ambientPaused&&!previous.ambientPaused){for(const job of [...this.active,...this.queue])if(job.channel==='ambient')this.end(job,'preference',false)}
  this.pump();
 }
 dispose(){this.disposed=true;for(const job of [...this.active,...this.queue])this.end(job,'disposed',false);this.listeners.clear();this.seen.clear()}
}
export const motionDirector=new MotionDirector(undefined,getMotionPreferences());
if(typeof window!=='undefined')subscribeMotionPreferences(()=>motionDirector.setPreferences(getMotionPreferences()));
