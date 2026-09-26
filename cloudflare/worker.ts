import {OFFER_COMPILER_VERSION} from '../src/game/offerTuning';
import {Fault,failure,json,type Env} from './shared';
export {AccountRegistry} from './accounts';
export {BattleRoom} from './room';

export default {
 async fetch(request:Request,env:Env):Promise<Response>{
  let origin:string|null=null;
  try{
   const url=new URL(request.url);origin=request.headers.get('Origin');
   const allowed=new Set((env.ALLOWED_ORIGINS??'').split(',').map(s=>s.trim()).filter(Boolean));
   if(origin&&origin!==url.origin&&!allowed.has(origin))throw new Fault(403,'请求来源未获允许','ORIGIN_DENIED');
   if(request.method==='OPTIONS'){
    const method=request.headers.get('Access-Control-Request-Method')??'',headers=(request.headers.get('Access-Control-Request-Headers')??'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
    if(!origin||!['GET','POST','PATCH','DELETE'].includes(method)||headers.some(h=>!['authorization','content-type'].includes(h)))throw new Fault(403,'跨域请求未获允许');
    return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, PATCH, DELETE','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600','Vary':'Origin'}});
   }
   let response:Response;
   if(url.pathname==='/healthz')response=json({ok:true,rulesVersion:'2.0.0',offerCompilerVersion:OFFER_COMPILER_VERSION,mode:'cloudflare',storage:'sqlite-durable-objects'});
   else if(url.pathname==='/api/capabilities')response=json({localArt:true,localText:true,extract:false,textProvider:false,imageProvider:false,voiceProvider:false,experimental:{bestOfThree:env.ENABLE_BEST_OF_THREE==='true'},accounts:true,friendRequiresAccount:true,guestMode:'local',offerRevision:true,offerIdempotency:true,generation:{text:{available:true,provider:'local'},image:{available:false,provider:'none'},extract:{available:false,provider:'none'},reference:{available:true,provider:'browser'},localAssembly:{available:true,provider:'bundled'}}});
   else if(url.pathname.startsWith('/api/')||url.pathname==='/ws')response=await env.ACCOUNTS.getByName('registry').fetch(request);
   else throw new Fault(404,'接口不存在');
   if(response.status===101)return response;
   const headers=new Headers(response.headers);headers.set('Vary','Origin');if(origin)headers.set('Access-Control-Allow-Origin',origin);
   return new Response(response.body,{status:response.status,headers});
  }catch(e){const response=failure(e);if(origin&&((env.ALLOWED_ORIGINS??'').split(',').map(s=>s.trim()).includes(origin)||origin===new URL(request.url).origin)){response.headers.set('Access-Control-Allow-Origin',origin);response.headers.set('Vary','Origin');}return response;}
 }
} satisfies ExportedHandler<Env>;
