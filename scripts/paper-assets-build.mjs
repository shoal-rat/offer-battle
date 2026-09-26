import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import './paper-assets-vectors.mjs';
const root=path.resolve(import.meta.dirname,'..');
const spec=JSON.parse(fs.readFileSync(path.join(root,'scripts/paper-assets-input.json'),'utf8'));
const sourceDir=path.join(root,'assets/paper-source');
const runtimeDir=path.join(root,'public/assets/paper');
fs.mkdirSync(sourceDir,{recursive:true}); fs.mkdirSync(runtimeDir,{recursive:true});
const run=(args)=>execFileSync('magick',args,{encoding:'utf8'}).trim();
const hash=(p)=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const rel=(p)=>path.relative(root,p).split(path.sep).join('/');
const info=(p)=>{const [width,height,channels,alphaMin,alphaMax,alphaMean]=run(['identify','-format','%w|%h|%[channels]|%[fx:minima.a]|%[fx:maxima.a]|%[fx:mean.a]',p]).split('|');return {width:+width,height:+height,channels,alphaMin:+alphaMin,alphaMax:+alphaMax,alphaMean:+alphaMean,bytes:fs.statSync(p).size,sha256:hash(p)}};
const previousPath=path.join(root,'public/art2.2-manifest.json');
const previous=new Map((fs.existsSync(previousPath)?JSON.parse(fs.readFileSync(previousPath,'utf8')).assets:[]).map(a=>[a.assetId,a]));
const force=process.env.PAPER_ASSETS_FORCE==='1';
const assets=[];
for(const a of spec.assets){
 const source=path.join(sourceDir,a.category,a.id+'-v1.png');
 fs.mkdirSync(path.dirname(source),{recursive:true});
 if(!fs.existsSync(source)){if(!fs.existsSync(a.source))throw new Error('Missing source '+a.source);fs.copyFileSync(a.source,source);}
 const src=info(source), prior=previous.get(a.id), sameSource=!force&&prior?.source.sha256===src.sha256, alpha=a.category!=='action'&&a.category!=='background';
 if(alpha&&src.alphaMin!==0)throw new Error('Real alpha absent: '+a.id);
 const group=a.category==='character'?'characters':a.category==='action'?'actions':a.category==='background'?'backgrounds':'props';
 const dest=path.join(runtimeDir,group,a.id);fs.mkdirSync(dest,{recursive:true});
 const runtime={};
 let bounds=null;
 if(alpha){const geometry=run([source,'-alpha','extract','-threshold','10%','-format','%@','info:']);const m=geometry.match(/(\d+)x(\d+)\+(\d+)\+(\d+)/);if(!m)throw new Error('Invalid bounds '+a.id+':'+geometry);bounds={width:+m[1],height:+m[2],left:+m[3],top:+m[4]};}
 const sizes=a.category==='character'?[128,256,768]:a.category==='action'?[128,256,768]:[256,768,1536];
 for(const size of sizes){
  const ratio=a.category==='character'?.75:(a.canvasRatio||src.width/src.height);
  const height=a.category==='prop'?Math.round(size/Math.max(ratio,1)):size;
  const file=path.join(dest,size+'.webp');
  if(sameSource&&prior.runtime[size]&&fs.existsSync(file)&&hash(file)===prior.runtime[size].sha256){runtime[size]=prior.runtime[size];continue;}
  if(alpha){
   const width=Math.round(height*ratio);
   const scale=Math.min(width*.90/bounds.width,height*.90/bounds.height);
   const scaledW=Math.round(bounds.width*scale),scaledH=Math.round(bounds.height*scale);
   const x=Math.round((width-scaledW)/2), y=Math.round(height*.94-scaledH);
   run([source,'-crop',bounds.width+'x'+bounds.height+'+'+bounds.left+'+'+bounds.top,'+repage','-resize',scaledW+'x'+scaledH+'!', '-background','none','-gravity','NorthWest','-extent',width+'x'+height+'-'+x+'-'+y,'-strip','-quality','86','-define','webp:method=6',file]);
  }else run([source,'-resize','x'+height,'-strip','-quality','85','-define','webp:method=6',file]);
  const metadata=info(file);
  if(alpha&&metadata.alphaMin!==0)throw new Error('Alpha lost: '+file);
  runtime[size]={path:'/'+rel(file).replace(/^public\//,''),...metadata};
 }
 const portraits={};
 if(a.category==='character'){
  const side=Math.min(src.width,Math.round(Math.max(bounds.width,bounds.height*.52))),left=Math.max(0,Math.min(src.width-side,Math.round(bounds.left+bounds.width/2-side/2))),top=Math.max(0,bounds.top);
  for(const size of [128,256]){const file=path.join(dest,'portrait-'+size+'.webp');if(sameSource&&prior.portraits?.[size]&&fs.existsSync(file)&&hash(file)===prior.portraits[size].sha256){portraits[size]=prior.portraits[size];continue;}run([source,'-crop',side+'x'+side+'+'+left+'+'+top,'+repage','-resize',size+'x'+size,'-strip','-quality','88','-define','webp:method=6',file]);portraits[size]={path:'/'+rel(file).replace(/^public\//,''),...info(file)};}
 }
 assets.push({assetId:a.id,category:a.category,ruleIds:a.ruleIds||[],version:spec.version,status:'runtime-ready-static',decision:a.category==='character'&&a.id==='algorithm'?'adapt':'redraw',source:{path:rel(source),...src},runtime,portraits,transparentBackground:alpha,alphaVerified:alpha,anchor:a.anchor||[.5,.94],pivot:a.pivot||[.5,.94],safeBounds:a.safeBounds||[.05,.04,.95,.94],zOrder:a.zOrder??(a.category==='character'?40:20),layer:a.layer||a.category,generation:{tool:'built-in-imagegen',prompt:a.prompt,promptProvenance:a.promptProvenance||'exact-tool-input',characterSheet:a.characterSheet||null,seed:null},rig:{body:'full-composite',face:null,frontProp:null,rearProp:null,shadow:'/assets/paper/props/shadow/shadow.svg',layerSeparation:'not-produced'},normalization:{alphaTrimThreshold:.10,pivotNormalization:true,sourceBounds:bounds},validation:{realAlpha:alpha?'passed':'not-required',thumbnailSizes:[72,128,512],thumbnailReview:'pending',browserIntegration:'pending'}});
}
const rules=JSON.parse(fs.readFileSync(path.join(root,'src/game/content/rules_catalog.json'),'utf8'));
const education=JSON.parse(fs.readFileSync(path.join(root,'src/game/content/education_catalog.json'),'utf8'));
assets.push(...JSON.parse(fs.readFileSync(path.join(sourceDir,'vector-manifest.json'),'utf8')));
const reviewPath=path.join(sourceDir,'review.json');
if(fs.existsSync(reviewPath)){const review=JSON.parse(fs.readFileSync(reviewPath,'utf8'));for(const a of assets)if(review.assets[a.assetId]?.sourceSha256===a.source.sha256)a.validation={...a.validation,thumbnailReview:review.assets[a.assetId].status,evidence:review.evidence};}
const ruleMap={};
for(const a of assets)for(const id of a.ruleIds)ruleMap[id]={assetId:a.assetId,status:a.status};
const fallbacks={T00:'support',T01:'algorithm',T02:'public',T03:'public',T04:'research',T05:'product',T06:'sales',T07:'research',T08:'public',T09:'finance',T10:'algorithm'};
const supportFallbacks={N01:'intern-beagle',N02:'interview-owl',N03:'campus-rat',N04:'mentor-capybara',N05:'veteran-tortoise',N06:'headhunter-fox',K01:'intern-beagle',K02:'mentor-capybara',K03:'intern-beagle'};
const restActions=new Set(['N08','N17','F05']);
const reviewActions=new Set(['N09','N11','N12','N13','N16','N24','F02','F03']);
for(const item of [...rules.offer_templates,...rules.base_cards,...rules.flex_cards,...education.primary,...education.secondary,...['K01','K02','K03'].map(id=>({id,type:'support'}))])if(!ruleMap[item.id]){
 const theme=item.type==='retort'?'F04':item.type==='action'?(restActions.has(item.id)?'N08':reviewActions.has(item.id)?'N09':'N07'):supportFallbacks[item.id]||fallbacks[item.id]||'support';
 const actual=assets.find(a=>a.assetId===theme);
 ruleMap[item.id]={assetId:theme,status:'same-theme-raster-fallback',fallback:{runtimePath:actual.runtime[256].path,component:actual.category==='character'?'PaperCharacter':'Art'},distinctIllustrationPlanned:true};
}
for(const [id,sharedWith] of Object.entries({K01:'N01',K02:'N04',K03:'N01'})){ruleMap[id]={...ruleMap[id],status:'shared-animal-token-identity',sharedWith,distinctIllustrationPlanned:false};}
const manifest={schemaVersion:1,artVersion:spec.version,createdAt:new Date().toISOString(),productionState:'runtime-vertical-slice-with-explicit-fallbacks',assets,ruleMap,limitations:['Raster face/body/prop separation and expression variants not produced. Full character composites share the same fixed foot pivot.','Four action illustrations are distinct. Remaining action rules explicitly use nearest-theme runtime assets; derived tokens share named animal support identities. N01-N06 each have distinct animal artwork.','Static asset contact sheets do not prove game-page integration or animation acceptance.'],budgets:{character768MaxBytes:200000,character256MaxBytes:50000,character128MaxBytes:20000}};
fs.writeFileSync(path.join(root,'public/art2.2-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(path.join(runtimeDir,'assetmap.json'),JSON.stringify({version:manifest.artVersion,assets:Object.fromEntries(assets.map(a=>[a.assetId,{category:a.category,runtime:a.runtime,portraits:a.portraits||{},pivot:a.pivot,layer:a.layer}])),ruleMap},null,2)+'\n');
const runtimeFiles=assets.flatMap(a=>[...Object.values(a.runtime),...Object.values(a.portraits||{})]);
console.log(JSON.stringify({assets:assets.length,files:runtimeFiles.length,runtimeBytes:runtimeFiles.reduce((n,a)=>n+a.bytes,0),mappedRuleIds:Object.keys(ruleMap).length}));

// Re-apply production runtime masks and approved face edits after base asset rebuild.
await import('./paper-assets-expressions.mjs');
