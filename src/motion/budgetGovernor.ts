/** Local rendering measurements only: no player, card, route, or network data. */
export interface MotionBudgetSample {frames:number;windowMs:number;p95Ms:number;longFrameRatio:number}
export const MOTION_BUDGET={warmupMs:750,windowMs:4000,minFrames:120,maxGapMs:250,p95Ms:25,longFrameMs:50,longFrameRatio:.01,badWindows:2} as const;
/** Consecutive settled windows prevent a single navigation/render spike from changing quality. */
export class MotionBudgetSampler {
 private previous:number|null=null;private start:number|null=null;private warmUntil=0;private frames:number[]=[];private badWindows=0;private lowered=false;
 reset(){this.previous=null;this.start=null;this.frames=[];this.badWindows=0;this.warmUntil=0}
 sample(now:number,paused=false):MotionBudgetSample|null {
  if(this.lowered)return null;
  if(paused||!Number.isFinite(now)){this.reset();return null}
  if(this.previous===null){this.previous=now;this.warmUntil=now+MOTION_BUDGET.warmupMs;return null}
  const delta=now-this.previous;this.previous=now;
  if(delta<=0||delta>MOTION_BUDGET.maxGapMs){this.reset();this.previous=now;this.warmUntil=now+MOTION_BUDGET.warmupMs;return null}
  if(now<this.warmUntil)return null;
  if(this.start===null){this.start=now;return null}
  this.frames.push(delta);
  if(now-this.start<MOTION_BUDGET.windowMs||this.frames.length<MOTION_BUDGET.minFrames)return null;
  const sorted=[...this.frames].sort((a,b)=>a-b),sample={frames:this.frames.length,windowMs:Math.round(now-this.start),p95Ms:Math.round(sorted[Math.ceil(sorted.length*.95)-1]*10)/10,longFrameRatio:this.frames.filter(ms=>ms>MOTION_BUDGET.longFrameMs).length/this.frames.length};
  const over=sample.p95Ms>MOTION_BUDGET.p95Ms||sample.longFrameRatio>MOTION_BUDGET.longFrameRatio;
  this.badWindows=over?this.badWindows+1:0;this.start=now;this.frames=[];
  if(this.badWindows<MOTION_BUDGET.badWindows)return null;
  this.lowered=true;return sample;
 }
}
interface GovernorOptions {enabled:()=>boolean;paused:()=>boolean;onDowngrade:(sample:MotionBudgetSample)=>void;request:(callback:FrameRequestCallback)=>number;cancel:(id:number)=>void}
/** One RAF owner, explicitly cancellable on hidden/reduced preferences and teardown. */
export function startMotionBudgetGovernor(options:GovernorOptions){
 const sampler=new MotionBudgetSampler();let frame:number|null=null,disposed=false,lowered=false;
 const schedule=()=>{if(!disposed&&!lowered&&frame===null&&options.enabled())frame=options.request(tick)};
 function tick(now:number){frame=null;if(disposed||lowered||!options.enabled()){sampler.reset();return}const sample=sampler.sample(now,options.paused());if(sample){lowered=true;options.onDowngrade(sample)}schedule()}
 function refresh(){sampler.reset();if(frame!==null){options.cancel(frame);frame=null}schedule()}
 refresh();return {refresh,dispose(){disposed=true;if(frame!==null)options.cancel(frame);frame=null;sampler.reset()}};
}
