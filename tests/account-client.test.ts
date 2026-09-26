import {test} from 'node:test';
import assert from 'node:assert/strict';
import {accountApi,currentAccount,loginAccount,logoutAccount,registerAccount,ApiError} from '../src/api';
import type {AccountResponse} from '../src/api';

function fixture(){
  const storage=new Map<string,string>(),descriptors=new Map<string,PropertyDescriptor|undefined>();
  const memory={getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,String(value)),removeItem:(key:string)=>storage.delete(key)};
  for(const name of ['localStorage','fetch','window'])descriptors.set(name,Object.getOwnPropertyDescriptor(globalThis,name));
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:memory});
  Object.defineProperty(globalThis,'window',{configurable:true,value:new EventTarget()});
  return {storage,restore(){for(const[name,descriptor]of descriptors)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name)}};
}
const response=(username:string):AccountResponse=>({token:`account-token-${username}`,account:{id:`account-${username}`,username,nickname:username},profile:{id:`profile-${username}`,nickname:username,offers:[]}});
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});

test('cloud account login keeps guest profile, active room and legacy token intact; guests cannot call protected cloud APIs',async()=>{
  const env=fixture();try {
    const guestKeys={'offer-session':'legacy-local-session','offer-local-profile-v1':'guest-profile','offer-active-room':'local-current-match','offer-loadout':'guest-loadout'};
    for(const[key,value]of Object.entries(guestKeys))env.storage.set(key,value);
    let requests=0;globalThis.fetch=(async(path,options)=>{requests++;assert.equal(path,'/api/auth/register');assert.equal((options?.headers as Record<string,string>).Authorization,undefined);return json({...response('player_one'),recoveryKey:'one-time-key'})}) as typeof fetch;
    await assert.rejects(accountApi('/api/matches'),(error:unknown)=>error instanceof ApiError&&error.code==='AUTH_REQUIRED');assert.equal(requests,0);
    const registered=await registerAccount({username:'player_one',password:'a-long-test-password'});assert.equal(registered.recoveryKey,'one-time-key');assert.equal(currentAccount()?.username,'player_one');
    for(const[key,value]of Object.entries(guestKeys))assert.equal(env.storage.get(key),value);
    globalThis.fetch=(async(path,options)=>{assert.equal(path,'/api/matches');assert.equal((options?.headers as Record<string,string>).Authorization,'Bearer account-token-player_one');return json({matches:[]})}) as typeof fetch;
    assert.deepEqual(await accountApi('/api/matches'),{matches:[]});
  }finally{env.restore()}
});

test('network failures preserve the account; a definitive 401 expires only the credential used by that request',async()=>{
  const env=fixture();try {
    globalThis.fetch=(async()=>json(response('old_player'))) as typeof fetch;await loginAccount({username:'old_player',password:'a-long-test-password'});
    globalThis.fetch=(async()=>{throw new TypeError('network offline')}) as typeof fetch;await assert.rejects(accountApi('/api/matches'),/network offline/);assert.equal(currentAccount()?.username,'old_player');
    let release:(response:Response)=>void=()=>{};
    globalThis.fetch=(async path=>path==='/api/matches'?new Promise<Response>(resolve=>release=resolve):json(response('new_player'))) as typeof fetch;
    const pending=accountApi('/api/matches');
    await loginAccount({username:'new_player',password:'a-long-test-password'});
    release(json({error:'old session expired',errorCode:'AUTH_REQUIRED'},401));await assert.rejects(pending,(error:unknown)=>error instanceof ApiError&&error.status===401);
    assert.equal(currentAccount()?.username,'new_player','an old request must not revoke a newer sign-in');
    globalThis.fetch=(async()=>json({error:'session expired'},401)) as typeof fetch;await assert.rejects(accountApi('/api/matches'));assert.equal(currentAccount(),null);
  }finally{env.restore()}
});

test('delayed logout does not delete a new login from another tab',async()=>{
  const env=fixture();try {
    globalThis.fetch=(async()=>json(response('old_player'))) as typeof fetch;await loginAccount({username:'old_player',password:'a-long-test-password'});
    let release:(response:Response)=>void=()=>{};
    globalThis.fetch=(async path=>path==='/api/auth/logout'?new Promise<Response>(resolve=>release=resolve):json(response('new_player'))) as typeof fetch;
    const pending=logoutAccount();await loginAccount({username:'new_player',password:'a-long-test-password'});release(json({ok:true}));await pending;
    assert.equal(currentAccount()?.username,'new_player');
  }finally{env.restore()}
});
