import {artUrl} from './deployment';
import {heroArt,offerArt,supportArt,actionArt} from './assets';
import React from 'react';
import {rules,cardById,templateById,benefitById} from './game/catalog';
import type {OfferDefinition,UnitView} from './game/types';
export function Icon({name,size=20}:{name:string;size?:number}){const paths:Record<string,React.ReactNode>={
 target:<><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/></>,
 sword:<><path d="m4 3 14 14M3 7l4-4M14 16l3-3 4 4-4 4zM4 21l5-5M3 17l4 4"/></>,
 cards:<><rect x="7" y="3" width="13" height="17" rx="2"/><path d="M4 6H3v15h13M11 8h5M11 12h5"/></>,
 spark:<><path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z"/></>,
 clock:<><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></>,
 crown:<><path d="m3 6 5 4 4-7 4 7 5-4-2 13H5zM6 22h12"/></>,
 book:<><path d="M12 5C8 2 3 4 3 4v15s5-2 9 1c4-3 9-1 9-1V4s-5-2-9 1zM12 5v15"/></>,
 volume:<><path d="M11 4 6 8H2v8h4l5 4zM15 8c3 2 3 6 0 8M18 4c6 5 6 11 0 16"/></>,
 settings:<><circle cx="12" cy="12" r="3"/><path d="m10 2-1 3-3 1-3-1-2 4 3 2v3l-2 2 2 4 3-1 3 2 1 2h4l1-3 3-1 3 1 2-4-3-2v-3l2-2-2-4-3 1-3-2-1-2z"/></>,
 arrow:<><path d="M4 12h16m-6-6 6 6-6 6"/></>,
 close:<path d="m6 6 12 12M6 18 18 6"/>,
 plus:<path d="M12 4v16M4 12h16"/>,
 check:<path d="m4 12 5 5L20 6"/>,
 heart:<path d="M12 21 3 12C-3 4 7-1 12 6c5-7 15-2 9 6z"/>,
 shield:<path d="m12 2 9 4v7c0 5-9 9-9 9S3 18 3 13V6z"/>,
 mail:<><rect x="2" y="5" width="20" height="15" rx="2"/><path d="m2 5 10 9L22 5"/></>,
 users:<><circle cx="9" cy="7" r="4"/><path d="M2 21v-3a7 7 0 0 1 14 0v3M16 3a4 4 0 0 1 0 8M19 15c3 1 3 3 3 6"/></>,
 logout:<><path d="M10 4H3v16h7M8 12h14m-5-5 5 5-5 5"/></>,
 replay:<><path d="M3 10a9 9 0 1 1 1 7M3 3v7h7"/></>,
 lock:<><rect x="4" y="10" width="16" height="12" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/></>,
 trophy:<><path d="M7 3h10v7c0 7-10 7-10 0zM7 5H3v4c0 3 4 4 5 4M17 5h4v4c0 3-4 4-5 4M12 16v5M7 22h10"/></>,
 info:<><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></>,
 download:<><path d="M12 2v13m-5-5 5 5 5-5M3 16v6h18v-6"/></>,
 moon:<path d="M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10z"/>
};return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]||paths.spark}</svg>}
export const heroPath=heroArt;
export const offerPath=offerArt;
export function Art({src,className='',alt='',fallback}:{src:string;className?:string;alt?:string;fallback?:string}){const resolved=artUrl(src),backup=fallback?artUrl(fallback):undefined;return <img className={className} src={resolved} crossOrigin="anonymous" alt={alt} draggable={false} onLoad={e=>{e.currentTarget.style.opacity='1'}} onError={e=>{if(backup&&e.currentTarget.src!==new URL(backup,location.origin).href){e.currentTarget.src=backup;return}e.currentTarget.style.opacity='0'}}/>}
export function OfferCard({offer,small=false,selected=false,onClick,disabled=false,unit,cost}:{offer:OfferDefinition;small?:boolean;selected?:boolean;onClick?:()=>void;disabled?:boolean;unit?:UnitView;cost?:number}){
 const t=templateById[offer.templateId], b=offer.benefitId?benefitById[offer.benefitId]:null;
 return <button type="button" className={`offer-card ${small?'small':''} ${selected?'selected':''} ${unit?.canAttack?'can-attack':''} ${disabled?'unavailable':''} tone-${offer.templateId}`} onClick={onClick} aria-label={`${offer.name}，${unit?.attack??offer.baseAttack}排面，${unit?.health??offer.baseHealth}底气`}>
 <div className="card-edge"/><span className={`card-cost ${cost!==undefined&&cost<offer.originalTime?'discounted':''}`} title={`原始耗时 ${offer.originalTime} 小时`}>{cost??offer.originalTime}<small>时</small></span><span className="card-kind">OFFER</span>
 <div className="card-art"><div className="art-sun"/><Art src={offer.artId?.startsWith('/')?offer.artId:offerPath(offer.templateId)} fallback={offerPath(offer.templateId)} alt={t?.name}/><div className="art-vignette"/></div>
 <div className="card-ribbon">{offer.name||t?.name}</div><div className="card-copy"><span className="card-company" title={`${offer.company} · ${offer.role}`}>{offer.company} · {offer.role}</span><strong className="card-salary">{(offer.annualPackage/10000).toFixed(offer.annualPackage%10000?1:0)}<small>万 / 年</small></strong><p>{t?.main_effect}</p>{b&&<span className="benefit-pill">{b.name}</span>}</div>
 {unit?.age&&<span className="age-badge">{unit.age}<small>岁</small></span>}<div className="card-stats"><span className="stat attack" title="排面">{unit?.attack??offer.baseAttack}</span><span className="stats-label">{unit?'在职 · OFFER':t?.name}</span><span className={`stat health ${(unit?.damage??0)>0?'damaged':''}`} title="底气">{unit?.health??offer.baseHealth}</span></div>
 {selected&&<span className="selected-check"><Icon name="check" size={14}/></span>}{unit?.notice&&<span className="notice-stamp">优化通知</span>}
 </button>
}
export function CommonCard({id,small=false,selected=false,onClick,cost,disabled=false}:{id:string;small?:boolean;selected?:boolean;onClick?:()=>void;cost?:number;disabled?:boolean}){const c=cardById[id];if(!c)return null;return <button className={`common-card ${small?'small':''} ${selected?'selected':''} ${disabled?'unavailable':''} type-${c.type}`} onClick={onClick} aria-label={c.name}><span className="card-cost">{cost??c.time_cost}<small>时</small></span><div className="common-art"><Art src={c.type==='support'?supportArt(id):actionArt(id)} alt=""/><span className="action-symbol"><Icon name={c.type==='retort'?'mail':c.type==='support'?'users':'spark'} size={45}/></span></div><div className="card-ribbon">{c.name}</div><p>{c.rules_text}</p><div className="common-bottom">{c.type==='support'?<><span className="stat attack">{c.attack}</span><span>助阵</span><span className="stat health">{c.max_health}</span></>:<span>{c.type==='retort'?'反话 · 留一手':'行动 · 拆台'}</span>}</div></button>}
export function Modal({title,children,onClose,wide=false}:{title:string;children:React.ReactNode;onClose:()=>void;wide?:boolean}){return <div className="modal-backdrop" onClick={onClose}><section className={`modal ${wide?'wide':''}`} role="dialog" aria-modal="true" aria-label={title} onClick={e=>e.stopPropagation()}><header><div><span className="eyebrow">OFFER BATTLE</span><h2>{title}</h2></div><button className="icon-btn" onClick={onClose} aria-label="关闭"><Icon name="close"/></button></header>{children}</section></div>}
export function Badge({children}:{children:React.ReactNode}){return <span className="badge">{children}</span>}
export function schoolName(id:string){return id==='S00'?'直接就业':rules.heroes.find(h=>h.id===id.replace('S','H'))?.name||id}
