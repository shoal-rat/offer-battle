import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
if(existsSync(resolve(root,'.env')))loadEnvFile(resolve(root,'.env'));
const major=Number(process.versions.node.split('.')[0]);
if(major<24){console.error(`需要 Node.js 24 或更新版本；当前为 ${process.version}。`);process.exit(1);}
const npm=process.platform==='win32'?'npm.cmd':'npm';
function run(args){const result=spawnSync(npm,args,{stdio:'inherit',shell:process.platform==='win32'});if(result.status!==0){console.error(`npm ${args.join(' ')} 执行失败。`);process.exit(result.status??1);}}
const lock=resolve(root,'package-lock.json');
if(!existsSync(lock)){console.error('缺少 package-lock.json，不能执行可重现安装。');process.exit(1);}
const digest=createHash('sha256').update(readFileSync(lock)).digest('hex');
const marker=resolve(root,'node_modules','.offer-battle-lock');
if(!existsSync(marker)||readFileSync(marker,'utf8')!==digest){run(['ci']);writeFileSync(marker,digest);}
mkdirSync(resolve(root,'data'),{recursive:true});
const scripts=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8')).scripts??{};
for(const script of ['assets:local','content:seed'])if(scripts[script])run(['run',script]);
// Player-facing launchers must not reload a live match when development files change.
const production=!process.argv.includes('--dev');
if(production&&!existsSync(resolve(root,'dist','index.html')))run(['run','build']);
const child=spawn(npm,['run',production?'start':'dev'],{cwd:root,stdio:'inherit',shell:process.platform==='win32',env:process.env});
let ready=false;
const url=`http://127.0.0.1:${process.env.PORT??5173}`;
const started=Date.now();
const probe=setInterval(async()=>{try{const response=await fetch(`${url}/healthz`,{signal:AbortSignal.timeout(1000)});if(response.ok){ready=true;clearInterval(probe);console.log(`\n游戏已就绪：${url}\n`);if(process.env.NO_OPEN!=='1'){const command=process.platform==='darwin'?'open':process.platform==='win32'?'cmd':'xdg-open';const args=process.platform==='win32'?['/c','start','',url]:[url];const opener=spawn(command,args,{stdio:'ignore'});opener.on('error',()=>{});}}}catch{}if(Date.now()-started>60000&&!ready){clearInterval(probe);console.error('60 秒内未通过健康检查，请查看上面的具体启动错误。');child.kill();process.exitCode=1;}},500);
child.on('error',error=>{clearInterval(probe);console.error('启动失败：',error.message);process.exitCode=1;});
child.on('exit',code=>{clearInterval(probe);process.exitCode=code??1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(probe);child.kill(signal);});
