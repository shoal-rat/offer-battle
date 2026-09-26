import type {IncomingMessage, ServerResponse} from 'node:http';

export interface NetworkOptions {
  allowedOrigins?: string[];
  trustProxyHops?: number;
  rateWindowMs?: number;
  sessionRateLimit?: number;
  roomRateLimit?: number;
  creationRateLimit?: number;
  uploadRateLimit?: number;
  wsRateLimit?: number;
  wsMessageRateLimit?: number;
  wsMaxPerSession?: number;
  wsMaxPerIp?: number;
  heartbeatMs?: number;
}

export class NetworkError extends Error {
  constructor(public status:number, message:string, public retryAfter?:number) { super(message); }
}

function integer(value:number|string|undefined, fallback:number, name:string) {
  const n=value===undefined?fallback:Number(value);
  if(!Number.isSafeInteger(n)||n<1)throw new Error(`${name} must be a positive integer`);
  return n;
}

function exactOrigin(value:string) {
  try {
    const url=new URL(value);
    if(!['http:','https:'].includes(url.protocol)||url.origin!==value||url.username||url.password)throw new Error();
    return url.origin;
  } catch { throw new Error(`ALLOWED_ORIGINS requires exact HTTP(S) origins without paths: ${value}`); }
}

/** Browser origins and proxy headers have one trust policy for HTTP and WebSocket. */
export function networkPolicy(options:NetworkOptions={}) {
  const origins=new Set((options.allowedOrigins??(process.env.ALLOWED_ORIGINS??'').split(',').map(s=>s.trim()).filter(Boolean)).map(exactOrigin));
  const trustProxyHops=options.trustProxyHops??Number(process.env.TRUST_PROXY_HOPS??0);
  if(!Number.isSafeInteger(trustProxyHops)||trustProxyHops<0)throw new Error('TRUST_PROXY_HOPS must be a nonnegative integer');
  const number=(key:keyof NetworkOptions, env:string, fallback:number)=>integer(options[key] as number|undefined??process.env[env],fallback,env);
  const limits={
    session:number('sessionRateLimit','SESSION_RATE_LIMIT',60),
    room:number('roomRateLimit','ROOM_RATE_LIMIT',120),
    creation:number('creationRateLimit','CREATION_RATE_LIMIT',60),
    upload:number('uploadRateLimit','UPLOAD_RATE_LIMIT',20),
    websocket:number('wsRateLimit','WS_RATE_LIMIT',120),
    messages:number('wsMessageRateLimit','WS_MESSAGE_RATE_LIMIT',600),
  };
  const windowMs=number('rateWindowMs','RATE_WINDOW_MS',60000);
  const buckets=new Map<string,{used:number;expires:number}>();
  let nextSweep=0;
  const forwarded=(req:IncomingMessage,name:string)=>String(req.headers[name]??'').split(',').map(x=>x.trim()).filter(Boolean);
  const clientIp=(req:IncomingMessage)=>{
    const chain=[...forwarded(req,'x-forwarded-for'),req.socket.remoteAddress??'unknown'];
    return chain[Math.max(0,chain.length-1-trustProxyHops)];
  };
  function acceptOrigin(req:IncomingMessage) {
    const origin=req.headers.origin;
    if(!origin)return undefined; // Non-browser clients still need the ordinary bearer token.
    let normalized:string;
    try{normalized=exactOrigin(origin);}catch{throw new NetworkError(403,'请求来源未获允许');}
    const forwardedProto=trustProxyHops?forwarded(req,'x-forwarded-proto').at(-1):undefined;
    const protocol=forwardedProto==='https'?'https':'http';
    if(normalized!==`${protocol}://${req.headers.host}`&&!origins.has(normalized))throw new NetworkError(403,'请求来源未获允许');
    return normalized;
  }
  function cors(req:IncomingMessage,res:ServerResponse) {
    const origin=acceptOrigin(req);
    // Cached generated art varies by Origin too, including its no-Origin representation.
    res.setHeader('Vary','Origin');
    if(origin)res.setHeader('Access-Control-Allow-Origin',origin);
    if(req.method!=='OPTIONS')return false;
    const method=req.headers['access-control-request-method'];
    const headers=String(req.headers['access-control-request-headers']??'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
    if(!origin||!method||!['GET','POST','PATCH','DELETE','OPTIONS'].includes(method)||headers.some(h=>!['authorization','content-type'].includes(h)))throw new NetworkError(403,'跨域请求未获允许');
    res.setHeader('Access-Control-Allow-Methods','GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
    res.setHeader('Access-Control-Max-Age','600');
    res.writeHead(204);res.end();return true;
  }
  function take(kind:keyof typeof limits,identity:string) {
    const now=Date.now();
    if(now>=nextSweep){for(const [key,bucket]of buckets)if(bucket.expires<=now)buckets.delete(key);nextSweep=now+Math.min(windowMs,10000);}
    const key=`${kind}:${identity}`;
    let bucket=buckets.get(key);
    if(!bucket||bucket.expires<=now){
      // Keep unauthenticated admission bookkeeping bounded under address churn.
      if(buckets.size>=10000&&!bucket)throw new NetworkError(429,'服务较忙，请稍后重试',Math.ceil(windowMs/1000));
      bucket={used:0,expires:now+windowMs};buckets.set(key,bucket);
    }
    if(bucket.used>=limits[kind])throw new NetworkError(429,'操作过于频繁，请稍后重试',Math.max(1,Math.ceil((bucket.expires-now)/1000)));
    bucket.used++;
  }
  function admitHttp(req:IncomingMessage,path:string) {
    if(req.method!=='POST')return;
    const kind=path==='/api/session'?'session':path==='/api/rooms'||path==='/api/rooms/join'||/^\/api\/rooms\/[^/]+\/rematch$/.test(path)?'room':path==='/api/uploads'?'upload':path==='/api/offers'||/^\/api\/(offers\/[^/]+\/appearance|generation\/jobs\/[^/]+\/retry)$/.test(path)?'creation':undefined;
    if(kind)take(kind,clientIp(req));
  }
  return {cors,acceptOrigin,clientIp,take,admitHttp,
    heartbeatMs:number('heartbeatMs','WS_HEARTBEAT_MS',25000),
    wsMaxPerSession:number('wsMaxPerSession','WS_MAX_PER_SESSION',8),
    wsMaxPerIp:number('wsMaxPerIp','WS_MAX_PER_IP',60),
  };
}
