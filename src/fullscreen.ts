import {useEffect,useState} from 'react';

type FullscreenDocument=Document&{webkitFullscreenElement?:Element;webkitExitFullscreen?:()=>Promise<void>|void};
type FullscreenElement=HTMLElement&{webkitRequestFullscreen?:()=>Promise<void>|void};
export function isBattleFullscreen(){const doc=document as FullscreenDocument;return !!(doc.fullscreenElement||doc.webkitFullscreenElement);}
/** Invoke directly inside the click handler, before the first await, to retain user activation. */
export function enterBattleFullscreen():Promise<boolean>{
 if(isBattleFullscreen())return Promise.resolve(true);
 const element=document.documentElement as FullscreenElement;
 try{const request=element.requestFullscreen??element.webkitRequestFullscreen;if(!request)return Promise.resolve(false);return Promise.resolve(request.call(element)).then(()=>true,()=>false);}catch{return Promise.resolve(false);}
}
export function exitBattleFullscreen():Promise<void>{const doc=document as FullscreenDocument;try{if(!isBattleFullscreen())return Promise.resolve();const exit=doc.exitFullscreen??doc.webkitExitFullscreen;return Promise.resolve(exit?.call(doc)).catch(()=>{});}catch{return Promise.resolve();}}
export function useBattleFullscreen(){
 const [fullscreen,setFullscreen]=useState(isBattleFullscreen);
 useEffect(()=>{document.documentElement.dataset.battleActive='true';const changed=()=>setFullscreen(isBattleFullscreen());document.addEventListener('fullscreenchange',changed);document.addEventListener('webkitfullscreenchange',changed);return()=>{delete document.documentElement.dataset.battleActive;document.removeEventListener('fullscreenchange',changed);document.removeEventListener('webkitfullscreenchange',changed);};},[]);
 return {fullscreen,toggle:()=>void(fullscreen?exitBattleFullscreen():enterBattleFullscreen())};
}
