import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
const original='/Users/zwk/.codex/generated_images/01a0dedf-40ce-7e60-af26-c05db7345785/exec-10408569-5b63-4fdb-9067-eb37e78617cd.png';
const source='assets/paper-source/prop/paper-plane-v1.png';
const runtime='public/art/paper-plane.webp';
const evidence='assets/paper-source/evidence/paper-plane';
const prompt="Use case: stylized-concept\nAsset type: one transparent game projectile sprite for an original papercraft card game.\nPrimary request: A single original folded paper airplane, made from thick creamy ivory paper with visible subtle torn/cut paper fibers along the edges and clear folded wings and center keel. Small friendly handmade storybook paper-cut illustration, restrained warm-gold thin ink outline, broad clean color planes, no metallic look. The folded underside / slot between the wings must be visually clear so a runtime card can later be placed underneath it, but draw ONLY the airplane itself.\nComposition/framing: square canvas, whole airplane isolated and centered with generous clear transparent margin; nose points straight UP toward 12 o'clock, tail toward bottom, wide two swept triangular wings. Slight elevated three-quarter view sufficient to show folds and shallow thickness while keeping the directional arrow-like silhouette very clear. The plane occupies about 80% of the square, no clipping. Its geometric center is the intended rotation pivot.\nMaterials/textures: cream-white fibrous paper, pale warm gray crease shading, soft butter-gold edge strokes, restrained paper grain, matte dry finish. Crisp silhouette readable at 180 pixels.\nScene/backdrop: genuinely transparent alpha background; fully empty outside silhouette, not a checkerboard.\nConstraints: exactly one paper airplane. No card, no character, no hands, no clip, no text, no numbers, no symbols, no lettering, no red lines, no crosshair, no targeting reticle, no flight path, no speed lines, no sparks, no glow, no ground or backdrop, no cast shadow. Preserve all edge transparency. This is a final game asset, not a mockup.";
for(const p of [path.dirname(source),path.dirname(runtime),evidence])fs.mkdirSync(path.join(root,p),{recursive:true});
if(!fs.existsSync(path.join(root,source)))fs.copyFileSync(original,path.join(root,source));
const run=args=>execFileSync('magick',args,{cwd:root,maxBuffer:32*1024*1024});
run([source,'-resize','440x440','-background','none','-gravity','center','-extent','512x512','-strip','-quality','90','-define','webp:method=6','-define','webp:alpha-quality=100',runtime]);
for(const size of [72,180])run([runtime,'-resize',size+'x'+size,evidence+'/'+size+'.png']);
const inspect=p=>{
 const [w,h,channels]=run(['identify','-format','%w|%h|%[channels]',p]).toString().split('|');
 const width=+w,height=+h,rgba=run([p,'-depth','8','rgba:-']);
 let zero=0,opaque=0,semi=0,edgeNonzero=0,minX=width,minY=height,maxX=-1,maxY=-1;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const a=rgba[(y*width+x)*4+3];if(a===0)zero++;else if(a===255)opaque++;else semi++;
  if(a>0){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);if(x===0||y===0||x===width-1||y===height-1)edgeNonzero++;}
 }
 return {path:p,width,height,channels,bytes:fs.statSync(path.join(root,p)).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex'),alpha:{fullyTransparentPixels:zero,fullyOpaquePixels:opaque,semiTransparentPixels:semi,edgeNonzeroPixels:edgeNonzero,nontransparentBounds:{left:minX,top:minY,right:maxX,bottom:maxY}}};
};
const manifest={assetId:'paper-plane',version:'1.0.0',status:'runtime-ready-static',category:'projectile',generatedAt:new Date().toISOString(),source:inspect(source),runtime:inspect(runtime),runtimeUrl:'/art/paper-plane.webp',generation:{tool:'built-in-imagegen',originalOutput:original,prompt},direction:{nose:'up',degreesClockwiseFromUp:0},pivot:[.5,.5],alphaVerified:true,recipe:{operation:'format conversion, proportional resize and transparent padding only',contentSizeLimit:[440,440],canvas:[512,512],webpQuality:90,webpAlphaQuality:100},evidence:[72,180].map(s=>inspect(evidence+'/'+s+'.png')),constraints:{containsCard:false,containsText:false,containsReticle:false,containsAttackPath:false,shadowBaked:false},usage:'Nose is up; rotate from up around canvas center. Runtime card attachment, targeting lines and shadows are composed by consuming code.',validation:{alpha:'passed',transparentOuterBorder:'passed',thumbnail180:'pending visual inspection',integration:'not performed by asset producer'}};
if(manifest.runtime.alpha.edgeNonzeroPixels!==0||manifest.runtime.alpha.fullyTransparentPixels===0||manifest.runtime.alpha.fullyOpaquePixels===0)throw new Error('Invalid transparent runtime plane');
fs.writeFileSync(path.join(root,'assets/paper-source/paper-plane.manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({source:manifest.source,runtime:manifest.runtime,evidence:manifest.evidence},null,2));
