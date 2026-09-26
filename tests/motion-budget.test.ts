import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MotionBudgetSampler,startMotionBudgetGovernor,type MotionBudgetSample} from '../src/motion/budgetGovernor';
function source(sampler=new MotionBudgetSampler()){let now=0;const results:MotionBudgetSample[]=[];return {sampler,results,frames(count:number,ms:number,paused=false){for(let i=0;i<count;i++){now+=ms;const sample=sampler.sample(now,paused);if(sample)results.push(sample)}},gap(ms:number){now+=ms;sampler.sample(now)}}}
test('measured sustained poor frames lower quality only once and emit numeric aggregate diagnostics',()=>{
 const s=source();s.frames(140,34);assert.equal(s.results.length,0);s.frames(140,34);assert.equal(s.results.length,1);assert.equal(s.results[0].p95Ms,34);assert.equal(s.results[0].longFrameRatio,0);assert.ok(s.results[0].frames>=120);assert.ok(s.results[0].windowMs>=4000);s.frames(1000,60);s.sampler.reset();s.frames(1000,60);assert.equal(s.results.length,1);assert.deepEqual(Object.keys(s.results[0]).sort(),['frames','longFrameRatio','p95Ms','windowMs']);
});
test('a healthy window between poor windows prevents one-off lowering',()=>{
 const s=source();s.frames(145,34);s.frames(300,16);s.frames(130,34);assert.equal(s.results.length,0);s.frames(150,34);assert.equal(s.results.length,1);
});
test('long frame ratio can lower quality even with an acceptable p95',()=>{
 const s=source();for(let n=0;n<900;n++)s.frames(1,n%50===0?60:16);assert.equal(s.results.length,1);assert.equal(s.results[0].p95Ms,16);assert.ok(s.results[0].longFrameRatio>.01);
});
test('navigation pauses and suspension-sized gaps discard partial windows and restart warmup',()=>{
 const s=source();for(let n=0;n<5;n++){s.frames(145,34);s.frames(2,34,true)}assert.equal(s.results.length,0);for(let n=0;n<5;n++){s.frames(145,34);s.gap(3000)}assert.equal(s.results.length,0);s.frames(280,34);assert.equal(s.results.length,1);
});
test('runtime loop cancels on hidden or reduced settings, resumes cleanly and releases on dispose',()=>{
 let enabled=true,id=0,now=0;const frames=new Map<number,FrameRequestCallback>(),samples:MotionBudgetSample[]=[];
 const g=startMotionBudgetGovernor({enabled:()=>enabled,paused:()=>false,onDowngrade:s=>samples.push(s),request:fn=>{frames.set(++id,fn);return id},cancel:n=>{frames.delete(n)}});
 const advance=(count:number)=>{for(let n=0;n<count;n++){now+=34;const jobs=[...frames.values()];frames.clear();jobs.forEach(fn=>fn(now))}};
 assert.equal(frames.size,1);advance(145);enabled=false;g.refresh();assert.equal(frames.size,0);advance(500);assert.equal(samples.length,0);enabled=true;g.refresh();advance(145);assert.equal(samples.length,0);g.dispose();assert.equal(frames.size,0);g.refresh();assert.equal(frames.size,0);
});
