import {useEffect,useId,useState,type CSSProperties} from 'react';
import {normalizePaperCharacterId,paperCharacterArt,paperCharacterExpressionArt,PAPER_TEMPLATE_PROFESSION,type PaperArtSize,type PaperProfession,type PaperExpression} from '../assets';

import rigMasks from '../../assets/paper-source/rig-masks.json';

export const PAPER_ART_VERSION='2.2.1';
export type {PaperProfession,PaperExpression} from '../assets';
const palettes:Record<PaperProfession,{coat:string;shade:string;hair:string;skin:string}>={
 algorithm:{coat:'#476A9B',shade:'#32496D',hair:'#293447',skin:'#F1C8AD'},
 research:{coat:'#7C9E84',shade:'#426F61',hair:'#624635',skin:'#EDB998'},
 finance:{coat:'#746B99',shade:'#50496F',hair:'#393341',skin:'#DFA785'},
 public:{coat:'#C69A60',shade:'#856847',hair:'#493B36',skin:'#F3C8A5'},
 sales:{coat:'#D17B70',shade:'#9D544D',hair:'#86543D',skin:'#F0C1A5'},
 product:{coat:'#819BB0',shade:'#526D89',hair:'#453543',skin:'#C98C6D'},
 support:{coat:'#A5A5A0',shade:'#717978',hair:'#4C4341',skin:'#EDC4AD'},
};
export function professionForTemplate(id:string):PaperProfession{return PAPER_TEMPLATE_PROFESSION[id.toUpperCase()]||'support'}
/** Original vector character. All layers share a 240×320 canvas and foot pivot (.5,.94). */
export function PaperVector({profession='algorithm',expression='confident',className='',flipped=false,identity=0,withShadow=true}:{profession?:PaperProfession;expression?:PaperExpression;className?:string;flipped?:boolean;identity?:number;withShadow?:boolean}){
 const c=palettes[profession],female=identity%2===1,glasses=profession==='algorithm'||profession==='public';
 return <svg className={`paper-character ${className}`} viewBox="0 0 240 320" aria-hidden="true" data-paper-profession={profession} data-art-version={PAPER_ART_VERSION} style={{'--character-coat':c.coat} as CSSProperties}>
  {withShadow&&<ellipse data-rig-layer="shadow" cx="122" cy="302" rx="68" ry="9" fill="#25313C" opacity=".13"/>}
  <g transform={flipped?'translate(240 0) scale(-1 1)':undefined} stroke="#293440" strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round">
   <g data-rig-layer="body" style={{transformOrigin:'120px 301px'}}>
    <path d="M76 141Q55 144 48 171L41 221 63 233 74 218 70 267 78 294 63 303 66 309 108 309 117 273 132 273 138 307 179 307 180 300 166 290 174 218 188 228 207 215 194 165Q188 145 160 139Z" fill="#FFFDF4" stroke="#FFFDF4" strokeWidth="13"/>
    {female&&<path d="M64 75Q43 129 62 168L93 151 171 156Q195 115 170 73Z" fill={c.hair}/>}
    <path d="M77 232 82 288 108 289 120 247 135 289 162 289 169 229Z" fill={c.shade}/>
    <path d="M84 286 79 298 64 301 66 307 107 307 109 289M136 288 139 307 178 307 178 301 163 288" fill="#FFF9E8"/>
    <path d="M80 145 64 156 50 180 45 219 64 226 78 191 75 238Q123 247 170 237L164 191 180 218 198 211 185 167 159 144Z" fill={c.coat}/>
    <path d="m100 139 9 101h27l8-101" fill="#FFF8E8"/>
    <path d="m99 143-12 25 17 15-7 43M145 143l16 25-16 17 8 37" fill="none"/>
    <path d="M107 146 114 177 128 180 139 146" fill="none" stroke="#DB7F6D" strokeWidth="5"/>
    <rect x="111" y="177" width="22" height="29" rx="3" fill="#FFF9E8"/>
    <path d="M116 184h11m-11 7h8" strokeWidth="2"/>
    <path d="M49 213q-13 6-7 18 8 11 22 1l4-11M180 207q16-7 22 5 4 12-11 18l-11-7" fill={c.skin}/>
    <path d="M112 124v22q9 11 20-1v-22" fill={c.skin}/>
   </g>
   <g data-rig-layer="face" style={{transformOrigin:'120px 134px'}}>
    <path d="M68 65Q57 11 119 15q66 2 57 63l-8 48-31 20-44-11-25-34Z" fill="#FFFDF4" stroke="#FFFDF4" strokeWidth="13"/>
    <path d="M77 68q-16 0-14 18l14 11M168 68q17 1 12 19l-12 9" fill={c.skin}/>
    <path d="M77 49q43-37 88 3l6 41q-5 39-45 43-36 0-48-34Z" fill={c.skin}/>
    <path d={female?'M65 75Q53 14 115 19q65-15 64 62l-20-19-7-23-29 23-20-14-22 29Z':'M67 74 60 51 72 29 92 26 100 12 122 19 142 17 167 33 183 62 170 80 157 49 138 63 122 48 107 64 89 51 81 78Z'} fill={c.hair}/>
    <path d="m91 77 15-3m30 0 14 5" fill="none"/>
    {expression==='blink'?<path d="M92 92q8 6 16 0m25 0q8 6 16 0" fill="none"/>:expression==='hit'?<path d="m92 87 10 7-10 6m51-14-10 8 10 6" fill="none"/>:<g className="paper-eyes"><ellipse cx="100" cy="91" rx="4" ry="7" fill="#293440"/><ellipse cx="141" cy="91" rx="4" ry="7" fill="#293440"/><circle cx="101" cy="89" r="1.4" fill="white" stroke="none"/><circle cx="142" cy="89" r="1.4" fill="white" stroke="none"/></g>}
    {glasses&&<g fill="none" strokeWidth="2.5"><rect x="84" y="82" width="29" height="22" rx="7"/><rect x="128" y="82" width="29" height="22" rx="7"/><path d="M113 90h15m-44-2-7-3m80 2 12-5"/></g>}
    <path d="m119 98-2 7h5" fill="none" stroke="#B7785E" strokeWidth="2"/>
    <path className="paper-mouth" d={expression==='hit'?'m111 119 19-4':expression==='thinking'?'M113 118h17':expression==='calm'?'M112 116q9 5 18 0':expression==='happy'?'M108 112q11 27 25 0Z':'M109 116q15 9 26-7'} fill={expression==='happy'?'#FFFFFF':'none'} strokeWidth="2.5"/>
    <ellipse cx="86" cy="107" rx="6" ry="3" fill="#DB8C7E" opacity=".65" stroke="none"/><ellipse cx="155" cy="105" rx="6" ry="3" fill="#DB8C7E" opacity=".65" stroke="none"/>
    {profession==='support'&&<g fill="#CBD0D6"><circle cx="158" cy="38" r="10"/><circle cx="177" cy="46" r="8"/><path d="M156 51q16-14 24 5l-12 8Z"/></g>}
   </g>
   <g data-rig-layer="prop" style={{transformOrigin:'120px 225px'}}>
    {profession==='algorithm'?<><path d="m65 184 68-9 12 53-70 9Z" fill="#C4D6E1"/><path d="m75 237 71-10 13 5-71 14Z" fill="#7C96B3"/><circle cx="104" cy="205" r="8" fill="#FFF8E8"/><path d="m103 198-3 9 9-1" fill="none" strokeWidth="2"/></>:profession==='research'?<><path d="m87 184 63 7-9 47-62-7Z" fill="#DEE6CF"/><g stroke="#567B66" strokeWidth="2"><path d="m92 195 39 5-3 23-37-4Zm4 3-1 11 12 1 2-10m5 16 12 2" fill="none"/><path d="m75 191 64-30 4 8-65 30Z" fill="#D1DDE1"/></g></>:profession==='public'?<><path d="m61 187 47-5 14 54-49 8Z" fill="#E4D1A7"/><path d="m69 197 34-4m-31 12 26-3" fill="none" strokeWidth="2"/><rect x="156" y="190" width="28" height="44" rx="8" fill="#D8E9E1"/><path d="M157 199h25"/></>:profession==='sales'||profession==='finance'?<><path d="m66 182 66 7-7 53-64-5Z" fill="#FFF9EB"/><path d="m79 195 37 4m-38 7 33 3m-34 7 21 2" fill="none" strokeWidth="2"/><circle cx="112" cy="226" r="9" fill="#F3A392"/></>:profession==='product'?<><path d="m64 184 67-2 5 57-70 2Z" fill="#DCE5F1"/><path d="m76 194 18-2 2 17-18 2Zm26 12 21-1 1 17-21 1Z" fill="#F8D578"/><path d="m79 217 16 1-1 15-16-1Z" fill="#F3A392"/></>:<><path d="m60 189 66-5 10 49-66 9Z" fill="#D2DED7"/><path d="m70 183 68 8-8 49-63-11Z" fill="#FFF9EB"/><path d="m81 198 36 4m-36 7 27 3m-27 7 31 3" strokeWidth="2"/></>}
    <path d="M64 217q9-12 15-3l5 11-12 8-8-5M138 214q8-11 13-3l1 11-12 5" fill={c.skin}/>
   </g>
  </g>
 </svg>
}

export type PaperCharacterProps=Parameters<typeof PaperVector>[0]&{artId?:string;size?:PaperArtSize;layer?:'all'|'character'|'body'|'face'|'prop'|'shadow';renderMode?:'raster'|'vector'};
/** Actual independent DOM layers from complementary masks of one approved painting.
 * These are runtime cuts, not independently painted source layers or invented hidden surfaces.
 * Face variants use the parent's exact frame; original body/prop pixels never change with expression.
 */
export function PaperCharacter({artId,size=256,layer='all',renderMode='raster',...props}:PaperCharacterProps){
 const uid=useId().replace(/:/g,'_'),profession=props.profession||'algorithm',characterId=normalizePaperCharacterId(artId||profession),src=paperCharacterArt(characterId,size);
 const expression=props.expression||'confident',variant=paperCharacterExpressionArt(characterId,expression,size),cuts=rigMasks.characters[characterId];
 const [failedSource,setFailedSource]=useState<string|null>(null),[failedFace,setFailedFace]=useState<string|null>(null);
 useEffect(()=>{if(characterId!=='algorithm'&&characterId!=='research')return;for(const state of ['blink','happy','hit','thinking'] as const){const image=new Image();image.src=paperCharacterExpressionArt(characterId,state,size)}},[characterId,size]);
 const faceSrc=failedFace===variant?src:variant,withShadow=(layer==='all'||layer==='shadow')&&props.withShadow!==false;
 const show=(part:'body'|'face'|'prop')=>layer==='all'||layer==='character'||layer===part;
 const mid=(part:string)=>`paper-${uid}-${part}`;
 const maskProps={maskUnits:'userSpaceOnUse' as const,x:0,y:0,width:240,height:320,style:{maskType:'luminance' as const}};
 const imageProps={width:240,height:320,preserveAspectRatio:'xMidYMid meet'};
 const pivotStyle=(x:number,y:number):CSSProperties=>({transformOrigin:`${x}px ${y}px`,transformBox:'view-box'});
 if(layer!=='shadow'&&(renderMode==='vector'||failedSource===src))return <PaperVector {...props} withShadow={withShadow}/>;
 // During HMR or a partial asset download, preserve the approved illustration instead of crashing.
 if(!cuts)return <svg className={`paper-character ${props.className||''}`} viewBox="0 0 240 320" aria-hidden="true" data-art-id={characterId} data-art-layering="safe-composite-fallback" data-rig-pivot-x=".5" data-rig-pivot-y=".94">
  {withShadow&&<ellipse data-rig-layer="shadow" cx="120" cy="301" rx="59" ry="8" fill="#25313C" opacity=".13"/>}
  {layer!=='shadow'&&<g data-rig-layer="move" transform={props.flipped?'translate(240 0) scale(-1 1)':undefined}><image {...imageProps} data-rig-layer="body" href={src} onError={()=>setFailedSource(src)}/></g>}
 </svg>;

 return <svg className={`paper-character ${props.className||''}`} viewBox="0 0 240 320" aria-hidden="true" data-paper-profession={profession} data-art-id={characterId} data-art-version={PAPER_ART_VERSION} data-expression={expression} data-art-layering="complementary-runtime-masks" data-rig-pivot-x=".5" data-rig-pivot-y=".94">
  <defs>
   <mask id={mid('body')} {...maskProps}><rect width="240" height="320" fill="white"/><path d={cuts.face} fill="black" shapeRendering="crispEdges"/><path d={cuts.prop} fill="black" shapeRendering="crispEdges"/></mask>
   <mask id={mid('face')} {...maskProps}><path d={cuts.face} fill="white" shapeRendering="crispEdges"/><path d={cuts.prop} fill="black" shapeRendering="crispEdges"/></mask>
   <mask id={mid('prop')} {...maskProps}><path d={cuts.prop} fill="white" shapeRendering="crispEdges"/></mask>
  </defs>
  {withShadow&&<ellipse data-rig-layer="shadow" cx="120" cy="301" rx="59" ry="8" fill="#25313C" opacity=".13"/>}
  {layer!=='shadow'&&<g transform={props.flipped?'translate(240 0) scale(-1 1)':undefined}>
   <g data-rig-layer="move" style={pivotStyle(120,300.8)}>
    {show('body')&&<g data-rig-layer="body" style={pivotStyle(120,300.8)}><image key={src} {...imageProps} href={src} mask={`url(#${mid('body')})`} onError={()=>setFailedSource(src)}/></g>}
    {show('face')&&<g data-rig-layer="face" style={pivotStyle(cuts.facePivot[0],cuts.facePivot[1])}><image key={faceSrc} {...imageProps} href={faceSrc} mask={`url(#${mid('face')})`} onError={()=>setFailedFace(variant)}/></g>}
    {show('prop')&&<g data-rig-layer="prop" style={pivotStyle(cuts.propPivot[0],cuts.propPivot[1])}><image {...imageProps} href={src} mask={`url(#${mid('prop')})`}/></g>}
   </g>
  </g>}
 </svg>
}
