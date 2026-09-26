import {useEffect,useRef,useState} from 'react';
import {api,isStaticMode,ApiError,type Profile} from '../api';
import type {Loadout} from '../game/types';
type Patch={nickname?:string;loadout?:Loadout};
export type SaveState='saved'|'saving'|'local-only'|'failed'|'conflict'|'draft-only';
const key='offer-profile-draft-v22';
/** One ordered writer. A conflict requires a human choice; retries reuse the operation ID. */
export function useProfileDraft(profile:Profile|null,onSaved:(profile:Profile)=>void){
 const [state,setState]=useState<SaveState>(isStaticMode?'local-only':'saved'),[error,setError]=useState(''),[conflict,setConflict]=useState<Profile|null>(null);
 const base=useRef<Profile|null>(profile),pending=useRef<Patch>({}),sequence=useRef(0),inFlight=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|null>(null),mounted=useRef(true),callback=useRef(onSaved),conflictRef=useRef<Profile|null>(null),attempt=useRef<{sequence:number;body:Patch&{expectedRevision:number;idempotencyKey:string}}|null>(null),hydrated=useRef(false);callback.current=onSaved;
 const persist=()=>{try{if(Object.keys(pending.current).length)localStorage.setItem(key,JSON.stringify({profileId:base.current?.id,patch:pending.current,expectedRevision:attempt.current?.body.expectedRevision??base.current?.revision??0,attempt:attempt.current}));else localStorage.removeItem(key)}catch{}};
 const flush=async()=>{
  if(inFlight.current||conflictRef.current||!base.current||!Object.keys(pending.current).length)return;
  if(pending.current.loadout&&(pending.current.loadout.offers.length!==3||pending.current.loadout.baseDeck.length!==12||pending.current.loadout.flexDeck.length!==3)){setState('draft-only');return}
  const revision=sequence.current;
  if(attempt.current?.sequence!==revision)attempt.current={sequence:revision,body:{...pending.current,expectedRevision:base.current.revision??0,idempotencyKey:crypto.randomUUID()}};
  const body=attempt.current.body;persist();inFlight.current=true;if(mounted.current)setState('saving');
  try{const result=await api<Profile>('/api/profile',body,'PATCH');base.current=result;
   if(revision===sequence.current){pending.current={};attempt.current=null;persist();if(mounted.current){setState(isStaticMode?'local-only':'saved');setError('');callback.current(result)}}
   else{attempt.current=null;if(mounted.current)callback.current(result)}
  }catch(e){if(mounted.current){if(e instanceof ApiError&&e.code==='PROFILE_REVISION_CONFLICT'&&e.profile){conflictRef.current=e.profile;setConflict(e.profile);setState('conflict');setError('资料已在其他页面更新。请选择要保留的版本。')}else{setState('failed');setError('保存未完成；本机草稿仍在，可以重试。')}}}
  finally{inFlight.current=false;if(mounted.current&&revision!==sequence.current&&!conflictRef.current)void flush()}
 };
 const save=(patch:Patch)=>{
  try{if(patch.loadout)localStorage.setItem('offer-loadout',JSON.stringify(patch.loadout));if(patch.nickname!==undefined)localStorage.setItem('offer-name',patch.nickname)}catch{}
  pending.current={...pending.current,...patch};sequence.current++;attempt.current=null;persist();if(!conflictRef.current)setState('saving');
  if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>void flush(),650);
 };
 useEffect(()=>{
  if(!profile)return;
  if(!base.current||profile.id!==base.current.id||(profile.revision??0)>=(base.current.revision??0))base.current=profile;
  if(!hydrated.current){hydrated.current=true;try{const old=JSON.parse(localStorage.getItem(key)||'null');if(old?.profileId===profile.id&&old.patch&&typeof old.patch==='object'&&Object.keys(old.patch).length){pending.current=old.patch;attempt.current=old.attempt??{sequence:0,body:{...old.patch,expectedRevision:old.expectedRevision,idempotencyKey:crypto.randomUUID()}};sequence.current=attempt.current!.sequence;setState('failed');setError('上次尚未保存的本机草稿已保留，请重试。')}}catch{}}
  if(Object.keys(pending.current).length&&state==='saving')void flush();
 },[profile]);
 const resolve=(choice:'remote'|'local')=>{
  const remote=conflictRef.current;if(!remote)return null;base.current=remote;conflictRef.current=null;setConflict(null);setError('');attempt.current=null;
  if(choice==='remote'){pending.current={};sequence.current++;persist();setState(isStaticMode?'local-only':'saved');callback.current(remote);return remote}
  persist();void flush();return null;
 };
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;if(timer.current)clearTimeout(timer.current)}},[]);
 return {state,error,conflict,save,resolve,retry:()=>void flush(),label:({saved:'已保存',saving:'正在保存…','local-only':'已保存在本机',failed:'保存未完成 · 草稿保留',conflict:'有更新冲突 · 请确认版本','draft-only':'本机草稿 · 阵容待补齐'})[state]};
}
