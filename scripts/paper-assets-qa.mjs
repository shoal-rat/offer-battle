import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {chromium} from '@playwright/test';
const root=path.resolve(import.meta.dirname,'..');
const manifestPath=path.join(root,'public/art2.2-manifest.json');
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
const evidenceDir=path.join(root,'assets/paper-source/evidence');fs.mkdirSync(evidenceDir,{recursive:true});
const failures=[],checks=[];
for(const asset of manifest.assets){
 for(const [size,entry] of [...Object.entries(asset.runtime),...Object.entries(asset.portraits||{}).map(([s,e])=>['portrait-'+s,e])]){
  const file=path.join(root,'public',entry.path),raw=fs.readFileSync(file),hash=crypto.createHash('sha256').update(raw).digest('hex');
  if(hash!==entry.sha256)failures.push(asset.assetId+': hash '+size);
  const check={id:asset.assetId,size,bytes:raw.length,hashMatches:hash===entry.sha256};
  if(file.endsWith('.webp')){
   const actual=execFileSync('magick',['identify','-format','%w|%h|%[fx:minima.a]|%[fx:maxima.a]',file],{encoding:'utf8'}).split('|').map(Number);
   if(actual[0]!==entry.width||actual[1]!==entry.height)failures.push(asset.assetId+': dimensions '+size);
   check.dimensionsMatch=actual[0]===entry.width&&actual[1]===entry.height;
   if(asset.transparentBackground){check.realAlpha=actual[2]===0&&actual[3]>.9;if(!check.realAlpha)failures.push(asset.assetId+': alpha '+size);}
   if(asset.category==='character'&&!size.startsWith('portrait')){
    const bounds=execFileSync('magick',[file,'-alpha','extract','-threshold','10%','-format','%@','info:'],{encoding:'utf8'}).trim().match(/(\d+)x(\d+)\+(\d+)\+(\d+)/);
    check.footY=(+bounds[2]+ +bounds[4])/entry.height;
    if(Math.abs(check.footY-.94)>.016)failures.push(asset.assetId+': foot pivot '+size);
   }
  }
  checks.push(check);
 }
}
const img=(e,w,h)=>'<img src="'+pathToFileURL(path.join(root,'public',e.path)).href+'" style="width:'+w+'px;height:'+h+'px" alt="">';
const chars=manifest.assets.filter(a=>a.category==='character');
const card=(a,size)=>'<figure>'+img(a.runtime[size<=128?128:768],size*.75,size)+'<figcaption>'+a.assetId+' / '+size+'px</figcaption></figure>';
const animalIds=['intern-beagle','interview-owl','campus-rat','mentor-capybara','veteran-tortoise','headhunter-fox'];
const animalNames={'intern-beagle':'N01 实习搭子 · 比格犬','interview-owl':'N02 面经收集员 · 猫头鹰','campus-rat':'N03 校招生鼠鼠 · 胖大老鼠','mentor-capybara':'N04 内推学长 · 水豚','veteran-tortoise':'N05 老员工 · 陆龟','headhunter-fox':'N06 猎头姐姐 · 红狐狸'};
const sections=[
 {name:'characters-thumbnails',html:[72,128].map(size=>'<h2>Full character · '+size+' CSS px</h2><div class="row">'+chars.map(a=>card(a,size)).join('')+'</div>').join('')+'<h2>Identity-preserving portrait crops · 128 CSS px</h2><div class="row dark">'+chars.map(a=>'<figure>'+img(a.portraits[128],128,128)+'<figcaption>'+a.assetId+'</figcaption></figure>').join('')+'</div>'},
 {name:'animals-support-512',html:'<div class="large">'+animalIds.map(id=>{const a=chars.find(c=>c.assetId===id);return '<figure>'+img(a.runtime[768],384,512)+'<figcaption>'+animalNames[id]+'</figcaption></figure>'}).join('')+'</div>'},
 {name:'professions-512',html:'<div class="large">'+chars.filter(a=>!a.assetId.startsWith('H')&&!animalIds.includes(a.assetId)).map(a=>card(a,512)).join('')+'</div>'},
 {name:'education-512',html:'<div class="large">'+chars.filter(a=>a.assetId.startsWith('H')).map(a=>card(a,512)).join('')+'</div>'},
 {name:'props-actions-overlays',html:'<div class="row">'+manifest.assets.filter(a=>a.category==='prop'||a.category==='action').map(a=>{const e=a.runtime[768];const scale=Math.min(310/e.width,210/e.height);return '<figure>'+img(e,e.width*scale,e.height*scale)+'<figcaption>'+a.assetId+'</figcaption></figure>'}).join('')+'</div><h2>Independent education accessories and seals</h2><div class="row">'+manifest.assets.filter(a=>a.category==='overlay').map(a=>'<figure>'+img(a.runtime.accessory,100,100)+img(a.runtime.seal,100,100)+'<figcaption>'+a.ruleIds[0]+'</figcaption></figure>').join('')+'</div><h2>Independent title plate and ground shadow</h2><div class="row">'+manifest.assets.filter(a=>a.category==='ui').map(a=>'<figure>'+img(a.runtime.vector,a.assetId==='title-sign'?600:240,a.assetId==='title-sign'?120:320)+'<figcaption>'+a.assetId+'</figcaption></figure>').join('')+'</div>'}
];
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const screenshots=[];
for(const s of sections){
 const html='<!doctype html><meta charset="utf-8"><title>Paper asset review</title><style>body{margin:0;padding:28px;background:#F7F2E8;color:#25313C;font-family:system-ui,sans-serif}h1{font-size:22px}h2{font-size:16px;margin:24px 0 12px}.row{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end}.large{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}figure{margin:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding:12px;min-width:64px}img{object-fit:contain;display:block}figcaption{font-size:13px;margin-top:8px;line-height:20px}.dark{background:#25313C;color:#FFFCF5;padding:18px;border-radius:12px}</style><h1>Paper Office 2.2 · '+s.name+'</h1><p>Browser-rendered asset QA; these contact sheets do not claim game-page or motion acceptance.</p>'+s.html;
 const file=path.join(evidenceDir,s.name+'.html');fs.writeFileSync(file,html);
 await page.goto(pathToFileURL(file).href);
 const decoded=await page.evaluate(async()=>{const images=[...document.images];await Promise.all(images.map(i=>i.decode().catch(()=>null)));return images.map(i=>({ok:i.complete&&i.naturalWidth>0,src:i.src}));});
 if(decoded.some(i=>!i.ok))failures.push(s.name+': broken browser image');
 const shot=path.join(evidenceDir,s.name+'.png');await page.screenshot({path:shot,fullPage:true});screenshots.push(path.relative(root,shot));
}
await browser.close();
const report={kind:'asset-production-qa',generatedAt:new Date().toISOString(),counts:{assets:manifest.assets.length,runtimeFiles:checks.length,characters:chars.length},browser:'Chromium',deviceScaleFactor:1,failures,checks,screenshots,manualReview:'pending',limitations:manifest.limitations};
fs.writeFileSync(path.join(evidenceDir,'qa-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({assets:manifest.assets.length,runtimeFiles:checks.length,failures,screenshots}));
if(failures.length)process.exitCode=1;

