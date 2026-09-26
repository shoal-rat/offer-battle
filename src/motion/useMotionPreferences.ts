import {useSyncExternalStore} from 'react';
import {startMotionBudgetGovernor} from './budgetGovernor';
export type MotionPreference='system'|'full'|'reduced';
export type MotionQuality='full'|'compact';
export interface MotionPreferences {preference:MotionPreference;reduced:boolean;ambientPaused:boolean;quality:MotionQuality;hidden:boolean}
const listeners=new Set<()=>void>();
let qualityOverride:MotionQuality|undefined;
const storage=(key:string)=>{if(typeof window==='undefined')return null;try{return localStorage.getItem(key)}catch{return null}};
const media=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
function read():MotionPreferences {
 const value=storage('offer-motion-preference');
 const preference:MotionPreference=value==='full'||value==='reduced'||value==='system'?value:storage('offer-reduced')==='1'?'reduced':'system';
 return {preference,reduced:preference==='reduced'||preference==='system'&&media(),ambientPaused:storage('offer-ambient-paused')==='1',quality:qualityOverride??(storage('offer-motion-quality')==='compact'?'compact':'full'),hidden:typeof document!=='undefined'&&document.hidden};
}
let snapshot=read();
let governor:ReturnType<typeof startMotionBudgetGovernor>|undefined;
let samplingPausedUntil=0;
/** Ignore route/panel assembly; performance adaptation must measure steady rendering. */
export function pauseMotionBudgetSampling(durationMs=750){samplingPausedUntil=Math.max(samplingPausedUntil,performance.now()+durationMs)}
function publish(){
 const next=read();
 if(typeof document!=='undefined'){
  document.documentElement.dataset.motionPreference=next.preference;
  document.documentElement.dataset.motionQuality=next.quality;
  document.documentElement.dataset.ambientPaused=String(next.ambientPaused||next.hidden);
  document.documentElement.dataset.reduced=String(next.reduced);
 }
 if(Object.keys(next).every(key=>next[key as keyof MotionPreferences]===snapshot[key as keyof MotionPreferences]))return;
 snapshot=next;governor?.refresh();for(const listener of listeners)listener();
}
let release:(()=>void)|undefined;
export function subscribeMotionPreferences(listener:()=>void){
 listeners.add(listener);
 if(!release&&typeof window!=='undefined'){
  const query=matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change',publish);document.addEventListener('visibilitychange',publish);window.addEventListener('storage',publish);
  governor=startMotionBudgetGovernor({enabled:()=>!snapshot.hidden&&!snapshot.reduced&&snapshot.quality==='full',paused:()=>performance.now()<samplingPausedUntil,request:fn=>requestAnimationFrame(fn),cancel:id=>cancelAnimationFrame(id),onDowngrade:sample=>{
   try{sessionStorage.setItem('offer-motion-budget-diagnostic',JSON.stringify({schemaVersion:1,event:'motion_quality_compact',...sample}))}catch{}
   setMotionQuality('compact');
  }});
  release=()=>{query.removeEventListener('change',publish);document.removeEventListener('visibilitychange',publish);window.removeEventListener('storage',publish);governor?.dispose();governor=undefined;release=undefined};
  publish();
 }
 return()=>{listeners.delete(listener);if(!listeners.size)release?.()};
}
export const getMotionPreferences=()=>snapshot;
function save(key:string,value:string){try{localStorage.setItem(key,value)}catch{}publish()}
export function setMotionPreference(preference:MotionPreference){if(!['system','full','reduced'].includes(preference))return;save('offer-motion-preference',preference)}
export function setAmbientPaused(paused:boolean){save('offer-ambient-paused',paused?'1':'0')}
export function setMotionQuality(quality:MotionQuality){if(['full','compact'].includes(quality)){qualityOverride=quality;save('offer-motion-quality',quality)}}
export function useMotionPreferences(){
 const state=useSyncExternalStore(subscribeMotionPreferences,getMotionPreferences,getMotionPreferences);
 return {...state,setPreference:setMotionPreference,setAmbientPaused,setQuality:setMotionQuality};
}
