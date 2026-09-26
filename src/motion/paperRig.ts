export type RigLayer='move'|'body'|'face'|'prop'|'shadow';
export interface PaperRig {root:HTMLElement;move:Element;body:Element;face:Element|null;prop:Element|null;shadow:Element|null;pivot:{x:number;y:number}}
let cloneSequence=0;
/** SVG masks and filters must survive a flight without sharing IDs with live artwork. */
export function remapCloneIds(root:Element){
 const prefix=`paper-flight-${++cloneSequence}-`,ids=new Map<string,string>();
 const nodes=[root,...root.querySelectorAll('*')];
 for(const node of nodes){const id=node.getAttribute('id');if(id){const next=prefix+ids.size;ids.set(id,next);node.setAttribute('id',next)}}
 for(const node of nodes)for(const attribute of [...node.attributes]){
  if(attribute.name==='id')continue;
  let value=attribute.value.replace(/url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/g,(match,quote,id)=>ids.has(id)?`url(#${ids.get(id)})`:match);
  if(['href','xlink:href'].includes(attribute.name)&&value.startsWith('#')&&ids.has(value.slice(1)))value='#'+ids.get(value.slice(1));
  if(['aria-labelledby','aria-describedby'].includes(attribute.name))value=value.split(/\s+/).map(id=>ids.get(id)??id).join(' ');
  if(value!==attribute.value)node.setAttribute(attribute.name,value);
 }
 return root;
}
/** The interactive slot and stat text stay still; only artwork receives body transforms. */
export function paperRig(root:HTMLElement):PaperRig {
 const layer=(name:RigLayer)=>root.querySelector(`[data-rig-layer="${name}"]`);
 const body=layer('body')??root.querySelector('.unit-portrait,.hero-avatar>img')??root;
 const x=Number(root.dataset.rigPivotX??.5),y=Number(root.dataset.rigPivotY??.94);
 if(body instanceof HTMLElement||body instanceof SVGElement){body.style.transformOrigin=`${x*100}% ${y*100}%`;body.style.transformBox='fill-box'}
 return {root,move:layer('move')??body,body,face:layer('face'),prop:layer('prop'),shadow:layer('shadow'),pivot:{x,y}};
}
/** A cloned flight keeps labels outside the animated paper body. */
export function clonePaperRig(root:HTMLElement){
 const clone=root.cloneNode(true) as HTMLElement;
 remapCloneIds(clone);clone.removeAttribute('data-battle-id');clone.setAttribute('aria-hidden','true');clone.style.pointerEvents='none';
 clone.querySelectorAll('[data-battle-id],button,input,select,[tabindex]').forEach(node=>{node.removeAttribute('data-battle-id');if(node instanceof HTMLElement)node.tabIndex=-1});
 return clone;
}
