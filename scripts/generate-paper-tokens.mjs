// Generates src/styles/paper-tokens.css: procedural paper materials and torn-edge silhouettes.
// Deterministic (seeded) so the committed CSS is reproducible: `node scripts/generate-paper-tokens.mjs`.
import {writeFileSync} from 'node:fs';

let seed=20260928;
const rand=()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646};
const f=n=>Number(n.toFixed(2));
const svg=body=>`url("data:image/svg+xml,${encodeURIComponent(body).replace(/'/g,'%27').replace(/"/g,'%22')}")`;

/** Torn edge: every side wanders by up to `depth` px, sampled `steps` times.
 * `sides` picks which edges are torn; untouched edges stay straight. */
function torn({depth=4,steps=18,sides='trbl',bite=.18}){
 const pts=[],j=()=>{let v=rand()*depth;if(rand()<bite)v=depth*(.9+rand()*.6);return f(v)};
 const along=i=>f(i/steps*100);
 for(let i=0;i<=steps;i++)pts.push(`${along(i)}% ${sides.includes('t')?j():0}px`);
 for(let i=1;i<steps;i++)pts.push(`calc(100% - ${sides.includes('r')?j():0}px) ${along(i)}%`);
 for(let i=steps;i>=0;i--)pts.push(`${along(i)}% calc(100% - ${sides.includes('b')?j():0}px)`);
 for(let i=steps-1;i>0;i--)pts.push(`${sides.includes('l')?j():0}px ${along(i)}%`);
 return `polygon(${pts.join(',')})`;
}
/** Scissor cut: a few long, slightly crooked straight segments — cut, not torn. */
function snipped(depth=3){
 const c=()=>f(rand()*depth);
 return `polygon(${c()}px ${c()}px,38% ${c()}px,calc(100% - ${c()}px) ${c()}px,calc(100% - ${c()}px) 46%,calc(100% - ${c()}px) calc(100% - ${c()}px),61% calc(100% - ${c()}px),${c()}px calc(100% - ${c()}px),${c()}px 52%)`;
}
const fiber=svg(`<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='a'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' seed='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .42 0 0 0 0 .33 0 0 0 0 .22 1.1 0 0 0 -.62'/></filter><filter id='b'><feTurbulence type='fractalNoise' baseFrequency='.012 .42' numOctaves='2' seed='9' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .55 0 0 0 0 .45 0 0 0 0 .32 1.4 0 0 0 -.86'/></filter><rect width='240' height='240' filter='url(#a)'/><rect width='240' height='240' filter='url(#b)' opacity='.8'/></svg>`);
const flecks=svg(`<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='c'><feTurbulence type='fractalNoise' baseFrequency='.55' numOctaves='2' seed='21' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 .96 2.4 0 0 0 -1.7'/></filter><rect width='300' height='300' filter='url(#c)'/></svg>`);
const kraft=svg(`<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320'><filter id='k'><feTurbulence type='fractalNoise' baseFrequency='.62' numOctaves='4' seed='5' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .3 0 0 0 0 .19 0 0 0 0 .09 1.2 0 0 0 -.5'/></filter><filter id='s'><feTurbulence type='fractalNoise' baseFrequency='.008 .3' numOctaves='2' seed='11' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .98 0 0 0 0 .86 0 0 0 0 .66 1.3 0 0 0 -.8'/></filter><rect width='320' height='320' fill='#C39A6B'/><rect width='320' height='320' filter='url(#k)'/><rect width='320' height='320' filter='url(#s)' opacity='.7'/></svg>`);
const corrugated=svg(`<svg xmlns='http://www.w3.org/2000/svg' width='14' height='10'><path d='M0 5Q3.5 0 7 5T14 5' fill='none' stroke='#000' stroke-opacity='.16' stroke-width='1.3'/></svg>`);
const heart=(fill,edge)=>svg(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 38'><path d='M20 36C8 27 2 20 2 12 2 6 6.5 2 12 2c3.6 0 6.3 1.8 8 4.6C21.7 3.8 24.4 2 28 2c5.5 0 10 4 10 10 0 8-6 15-18 24Z' fill='${edge}' transform='translate(0 1.6)'/><path d='M20 34C8.5 25.5 3 19 3 11.8 3 6.6 7 3 12 3c3.5 0 6.2 1.9 8 4.8C21.8 4.9 24.5 3 28 3c5 0 9 3.6 9 8.8C37 19 31.5 25.5 20 34Z' fill='${fill}' stroke='#FFFDF6' stroke-width='2.2' stroke-linejoin='round'/><path d='M9.5 9.5c1.4-2 4-2.4 5.6-1.2' fill='none' stroke='#fff' stroke-opacity='.55' stroke-width='2.2' stroke-linecap='round'/></svg>`);
const burst=(fill,edge)=>{
 const pts=[];for(let i=0;i<20;i++){const a=i/20*Math.PI*2-Math.PI/2,r=i%2?13.6:19.4;pts.push(`${f(20+Math.cos(a)*r)},${f(20+Math.sin(a)*r)}`)}
 return svg(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 42'><polygon points='${pts.join(' ')}' fill='${edge}' transform='translate(0 1.8)'/><polygon points='${pts.join(' ')}' fill='${fill}' stroke='#FFFDF6' stroke-width='2' stroke-linejoin='round'/><circle cx='14' cy='13' r='2.4' fill='#fff' fill-opacity='.5'/></svg>`);
};
const clock=svg(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 42'><circle cx='20' cy='22' r='18' fill='#B4892F'/><circle cx='20' cy='20' r='18' fill='#F4C24D' stroke='#FFFDF6' stroke-width='2.2'/><circle cx='20' cy='20' r='13.2' fill='none' stroke='#fff' stroke-opacity='.45' stroke-width='1.4' stroke-dasharray='2 4.9'/></svg>`);
const shield=svg(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 120' preserveAspectRatio='none'><path d='M50 4 94 18V60C94 88 72 106 50 116 28 106 6 88 6 60V18Z' fill='#6F7F92' transform='translate(0 4)'/><path d='M50 4 94 18V60C94 88 72 106 50 116 28 106 6 88 6 60V18Z' fill='#A9BCD0' stroke='#FFFDF6' stroke-width='4' stroke-linejoin='round'/><path d='M50 14 84 25V60C84 82 67 96 50 104' fill='none' stroke='#fff' stroke-opacity='.4' stroke-width='3'/></svg>`);
/** A 72×72 torn sheet for `border-image` (slice 24, round). The middle 24px of every side starts and
 * ends at the same depth so repeated tiles join without a seam; corners carry their own nicks. */
function sheetEdge(fill,rim,thick){
 // With `thick`, the sheet sits 5px higher and a board-coloured copy shows below it: paper thickness, no filter.
 const S=72,H=thick?66:72,d=()=>f(2+rand()*5.5);
 const side=(vertical,invert,limit)=>{const out=[];for(let t=6;t<=(vertical?limit-6:66);t+=3){const edge=t===24||t===(vertical?limit-24:48)?4:d();const v=invert?(vertical?S:limit)-edge:edge;out.push(vertical?[v,t]:[t,v])}return out};
 const pts=[...side(false,false,H),...side(true,true,H),...side(false,true,H).reverse(),...side(true,false,H).reverse()];
 const path='M'+pts.map(([x,y])=>`${f(x)} ${f(y)}`).join('L')+'Z';
 const under=thick?`<path d='${path}' fill='${thick}' transform='translate(0 5.5)'/>`:'';
 return svg(`<svg xmlns='http://www.w3.org/2000/svg' width='${S}' height='${S}' viewBox='0 0 ${S} ${S}'>${under}<path d='${path}' fill='${rim}'/><path d='${path}' fill='${fill}' transform='translate(36 ${H/2}) scale(.955) translate(-36 -${H/2})'/></svg>`);
}
/** Pencil doodles for numbers: a paper patch, light hatching, and a doubled wobbly outline. */
function doodle(path,ink,hatch,seedNo){
 const f1=`<filter id='w' x='-15%' y='-15%' width='130%' height='130%'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' seed='${seedNo}'/><feDisplacementMap in='SourceGraphic' scale='1.8'/></filter>`;
 const pat=`<pattern id='h' width='3.4' height='3.4' patternUnits='userSpaceOnUse' patternTransform='rotate(-38)'><rect width='1.2' height='3.4' fill='${hatch}'/></pattern>`;
 return svg(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 44 44'><defs>${f1}${pat}</defs><path d='${path}' fill='#FFFDF7'/><path d='${path}' fill='url(#h)' opacity='.28' filter='url(#w)'/><g fill='none' stroke='${ink}' stroke-linecap='round' stroke-linejoin='round' filter='url(#w)'><path d='${path}' stroke-width='2.3' opacity='.92'/><path d='${path}' stroke-width='1.1' opacity='.55' transform='translate(.8 -.6) rotate(2 22 22)'/></g></svg>`);
}
const heartPath='M22 39C9.5 30 3.5 23.2 3.5 14.6 3.5 8.6 8 4.4 13.4 4.4c3.8 0 6.8 2 8.6 5 1.8-3 4.8-5 8.6-5 5.4 0 9.9 4.2 9.9 10.2C40.5 23.2 34.5 30 22 39Z';
const burstPath=(()=>{const pts=[];for(let i=0;i<20;i++){const a=i/20*Math.PI*2-Math.PI/2,r=(i%2?13.2:19.6)*(.94+rand()*.08);pts.push(`${f(22+Math.cos(a)*r)} ${f(22+Math.sin(a)*r)}`)}return 'M'+pts.join('L')+'Z'})();
const clockPath='M22 3.6a18.4 18.4 0 1 0 .01 0ZM22 3.4v3.4M39.4 13.6l-2.6 1.6';
const lines=[];
lines.push('/* Generated by scripts/generate-paper-tokens.mjs — procedural paper materials and torn silhouettes. */');
lines.push(':root{');
lines.push(` --tex-fiber:${fiber};`);
lines.push(` --tex-flecks:${flecks};`);
lines.push(` --tex-kraft:${kraft};`);
lines.push(` --tex-corrugated:${corrugated};`);
lines.push(` --badge-heart:${heart('#E4574A','#8F2E27')};`);
lines.push(` --badge-heart-mind:${heart('#EC6B5B','#9A3128')};`);
lines.push(` --badge-burst:${burst('#F4C24D','#A8792A')};`);
lines.push(` --badge-clock:${clock};`);
lines.push(` --badge-shield:${shield};`);
for(let i=1;i<=4;i++)lines.push(` --torn-${i}:${torn({depth:4.2,steps:16})};`);
lines.push(` --torn-soft:${torn({depth:2.6,steps:22,bite:.08})};`);
lines.push(` --torn-deep:${torn({depth:9,steps:34,bite:.2})};`);
lines.push(` --torn-top:${torn({depth:6,steps:30,sides:'t'})};`);
lines.push(` --torn-bottom:${torn({depth:6,steps:30,sides:'b'})};`);
lines.push(` --torn-strip:${torn({depth:7,steps:40,sides:'tb'})};`);
lines.push(` --torn-right:${torn({depth:5,steps:10,sides:'r'})};`);
for(let i=1;i<=3;i++)lines.push(` --snip-${i}:${snipped(3.4)};`);
lines.push(` --sheet-cream:${sheetEdge('#FBF3E1','#FFFDF7')};`);
lines.push(` --sheet-white:${sheetEdge('#FFFDF7','#FFFFFF')};`);
lines.push(` --sheet-manila:${sheetEdge('#EFD39B','#FBEBC6')};`);
lines.push(` --sheet-rose:${sheetEdge('#F5D5CB','#FFF1EC')};`);
lines.push(` --sheet-mint:${sheetEdge('#D3EBDA','#F1FBF4')};`);
lines.push(` --sheet-sky:${sheetEdge('#D9E5F7','#F3F8FF')};`);
lines.push(` --sheet-yellow:${sheetEdge('#FBE7A1','#FFF7D6')};`);
lines.push(` --doodle-heart:${doodle(heartPath,'#C8372D','#D9463B',7)};`);
lines.push(` --doodle-burst:${doodle(burstPath,'#34322E','#6F6A62',13)};`);
lines.push(` --doodle-clock:${doodle(clockPath,'#34322E','#6F6A62',17)};`);
lines.push(` --sheet-cream-thick:${sheetEdge('#FBF3E1','#FFFDF7','#8C6A45')};`);
lines.push(` --sheet-manila-thick:${sheetEdge('#EFD39B','#FBEBC6','#A8864E')};`);
lines.push('}');
writeFileSync(new URL('../src/styles/paper-tokens.css',import.meta.url),lines.join('\n')+'\n');
console.log('paper-tokens.css written');
