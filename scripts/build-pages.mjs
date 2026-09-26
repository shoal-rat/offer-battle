import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';

const apiBase=process.env.VITE_API_BASE_URL?.trim();
if(!apiBase)throw new Error('Set VITE_API_BASE_URL to the deployed HTTPS game service before building Pages.');
const parsed=new URL(apiBase);
if(parsed.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(parsed.hostname))throw new Error('The public game service must use HTTPS.');
if(parsed.username||parsed.password||parsed.search||parsed.hash)throw new Error('The API URL must not contain credentials or query parameters.');
const env={...process.env,VITE_BASE_PATH:'/offer-battle/',VITE_STATIC_MODE:'true',VITE_API_BASE_URL:apiBase.replace(/\/+$/,'')};
for(const args of [['run','typecheck'],['exec','vite','build','--','--outDir','dist-pages']]){
 const result=spawnSync(process.platform==='win32'?'npm.cmd':'npm',args,{stdio:'inherit',env});
 if(result.status!==0)process.exit(result.status??1);
}
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
writeFileSync(new URL('../dist-pages/release.json',import.meta.url),JSON.stringify({name:pkg.name,version:pkg.version,base:'/offer-battle/',api:env.VITE_API_BASE_URL,guestMode:'local-bot',source:'https://github.com/shoal-rat/offer-battle'},null,2)+'\n');
console.log('Pages bundle ready: dist-pages/');
