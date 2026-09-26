import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const out=path.join(root,'public/assets/paper/education');
const source=path.join(root,'assets/paper-source/education');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(source,{recursive:true});
const palette=['#E7B66F','#9DB8DA','#AAC9B0','#ED9D8D','#AECBD1','#E5CFA7','#B7C9B1','#B3CDE0','#BBAED6','#D8B99F','#D6B76A'];
const symbols=[
'<rect x="78" y="86" width="100" height="72" rx="8"/><path d="M107 86v-12h42v12M79 111h99M118 106h19v15h-19Z"/>',
'<path d="M75 91 128 71 181 91l-53 21ZM91 103v36q37 26 74 0v-36M181 91v49"/><circle cx="181" cy="146" r="5"/>',
'<path d="M82 77h38q10 0 10 12v74q-16-16-48-11ZM174 77h-34q-10 0-10 12v74q16-16 44-11Z"/>',
'<path d="M82 95h92v60H82ZM92 76h72v19M110 108l13 17 30-34"/>',
'<path d="m77 89 51 43 51-43M77 89h102v67H77Z"/>',
'<path d="M89 77h79v89H89ZM106 101h44M106 118h35M111 137l9 10 22-24"/>',
'<path d="m92 80 30 30-19 18-30-30 8-14 19 18 12-12-19-18ZM122 113l55 54-17 16-54-57"/>',
'<circle cx="128" cy="120" r="48"/><ellipse cx="128" cy="120" rx="23" ry="48"/><path d="M81 120h94M89 96h78M89 144h78"/>',
'<circle cx="105" cy="96" r="15"/><circle cx="151" cy="96" r="15"/><path d="M79 158v-14q0-26 26-26 26 0 26 26v14M127 158v-14q0-26 25-26 25 0 25 26v14"/>',
'<path d="M82 84h94v76H82ZM99 140l24-23 18 14 18-36M96 169h66"/>',
'<path d="m76 110 52-36 52 36ZM90 115v39m25-39v39m25-39v39m25-39v39M81 164h94"/>'
];
const assets=[];
for(let i=0;i<11;i++){
 const id='S'+String(i).padStart(2,'0'),dir=path.join(out,id);fs.mkdirSync(dir,{recursive:true});
 const accessory='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256"><path d="m70 167-14 66 33-14 19 22 19-71m58-3 14 66-33-14-19 22-18-71" fill="'+palette[i]+'" stroke="#25313C" stroke-width="5" stroke-linejoin="round"/><path d="m53 48 153 9-7 133-153-9Z" fill="#FFFCF5" stroke="#25313C" stroke-width="5" stroke-linejoin="round"/><path d="m54 48 18-9 151 10-17 8m0 0 17-8-6 135-18 6" fill="#E8DCCC" stroke="#25313C" stroke-width="3" stroke-linejoin="round"/><g fill="'+palette[i]+'" stroke="#25313C" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">'+symbols[i]+'</g></svg>';
 const seal='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256"><path d="m30 52 185-8 13 164-189 9Z" fill="#FFFCF5" stroke="#25313C" stroke-width="5" stroke-linejoin="round"/><path d="m44 64 157-7 10 134-159 9Z" fill="'+palette[i]+'" stroke="#25313C" stroke-width="3" stroke-dasharray="6 5"/><g fill="#FFFCF5" stroke="#25313C" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">'+symbols[i]+'</g></svg>';
 const files={};
 for(const [kind,svg] of Object.entries({accessory,seal})){const dest=path.join(dir,kind+'.svg'),src=path.join(source,id+'-'+kind+'-v1.svg');fs.writeFileSync(dest,svg);fs.writeFileSync(src,svg);files[kind]={path:'/assets/paper/education/'+id+'/'+kind+'.svg',sourcePath:'assets/paper-source/education/'+id+'-'+kind+'-v1.svg',width:256,height:256,bytes:Buffer.byteLength(svg),sha256:crypto.createHash('sha256').update(svg).digest('hex')};}
 assets.push({assetId:'secondary-'+id,category:'overlay',ruleIds:[id],version:'2.2.0',status:'runtime-ready-vector',decision:'redraw',source:{path:files.accessory.sourcePath,width:256,height:256,bytes:files.accessory.bytes,sha256:files.accessory.sha256},runtime:files,transparentBackground:true,alphaVerified:true,anchor:[.82,.58],pivot:[.5,.5],safeBounds:[.05,.05,.95,.95],zOrder:55,layer:'education-accessory',generation:{tool:'original-svg',prompt:'Flat paper education accessory and seal; extend existing geometric education symbols using the 2.2 cream/sage/coral palette, no metallic gradients or text.'},validation:{browserIntegration:'pending',thumbnailReview:'pending'}});
}
const extras={
 'shadow':'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 320"><ellipse cx="120" cy="301" rx="61" ry="8" fill="#25313C" opacity=".14"/></svg>',
 'title-sign':'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 180"><path d="M194 0v37m512-37v37" stroke="#25313C" stroke-width="7"/><path d="m23 41 835-8 18 124-841 5Z" fill="#DBCCB3" stroke="#25313C" stroke-width="5" stroke-linejoin="round"/><path d="M19 29 81 28 85 31 152 27 157 29 226 26 231 29 304 25 309 27 398 24 403 26 495 23 501 26 588 22 594 25 682 22 687 24 778 21 783 24 854 21 857 57 854 62 860 96 857 101 872 145 813 146 809 143 732 146 727 144 646 147 641 145 559 148 554 146 479 148 474 146 389 148 384 146 301 149 296 147 219 150 214 148 132 150 127 148 31 150 27 120 30 115 22 79 25 74Z" fill="#FFFCF5" stroke="#25313C" stroke-width="5" stroke-linejoin="round"/><path d="m73 32 92-1-2 34-92 1m584-6 89-1-3 34-89 1" fill="#F8D578" opacity=".7"/></svg>'
};
for(const [id,svg] of Object.entries(extras)){const dest=path.join(root,'public/assets/paper/props',id);fs.mkdirSync(dest,{recursive:true});fs.writeFileSync(path.join(dest,id+'.svg'),svg);const src=path.join(root,'assets/paper-source/education',id+'-v1.svg');fs.writeFileSync(src,svg);assets.push({assetId:id,category:'ui',ruleIds:[],version:'2.2.0',status:'runtime-ready-vector',decision:'redraw',source:{path:path.relative(root,src),width:id==='title-sign'?900:240,height:id==='title-sign'?180:320,bytes:Buffer.byteLength(svg),sha256:crypto.createHash('sha256').update(svg).digest('hex')},runtime:{vector:{path:'/assets/paper/props/'+id+'/'+id+'.svg',width:id==='title-sign'?900:240,height:id==='title-sign'?180:320,bytes:Buffer.byteLength(svg),sha256:crypto.createHash('sha256').update(svg).digest('hex')}},transparentBackground:true,alphaVerified:true,anchor:id==='shadow'?[.5,.94]:[.5,.1],pivot:id==='shadow'?[.5,.94]:[.5,.1],layer:id,zOrder:id==='shadow'?30:60,generation:{tool:'original-svg',prompt:'Independent minimal paper '+id+' layer, blank and without UI text.'}});}
fs.writeFileSync(path.join(root,'assets/paper-source/vector-manifest.json'),JSON.stringify(assets,null,2));
console.log(JSON.stringify({vectorAssets:assets.length,files:24}));

