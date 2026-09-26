import '../styles/starter-decks.css';
import {useState} from 'react';
import {getStarterDecks} from '../game/starterDecks';
import type {Loadout} from '../game/types';
import {Icon,schoolName} from '../ui';
const pairing=(d:{primaryId:string;secondaryId:string})=>`${d.primaryId==='H10'?'吉大':schoolName(d.primaryId)} + ${schoolName(d.secondaryId)}`;
function sameDeck(a:Loadout,b:Loadout){return a.primaryId===b.primaryId&&a.secondaryId===b.secondaryId&&a.offers.map(o=>o.id).join('|')===b.offers.map(o=>o.id).join('|')&&a.baseDeck.join('|')===b.baseDeck.join('|')&&a.flexDeck.join('|')===b.flexDeck.join('|')}
export default function StarterDeckPicker({current,unlocked,onApply,compact=false}:{current:Loadout;unlocked:boolean;onApply:(loadout:Loadout,title:string)=>void;compact?:boolean}){
 const decks=getStarterDecks(unlocked),[chosen,setChosen]=useState(()=>decks.find(d=>sameDeck(current,d.loadout))?.id??decks[0].id);
 const selected=decks.find(d=>d.id===chosen)??decks[0],active=sameDeck(current,selected.loadout);
 return <section className={`starter-decks ${compact?'compact':''}`} aria-label="预设卡组">
  <div className="starter-heading"><div><h2>从一套预设开始</h2><p>三份 Offer、12 张基础牌、3 张应对牌。学会一条思路，再换成你的牌。</p></div><span>{decks.length} 套可选</span></div>
  {compact?<label className="field">选择预设卡组<select value={selected.id} onChange={e=>setChosen(e.target.value)}>{decks.map(d=><option key={d.id} value={d.id}>{pairing(d)} · {d.title}</option>)}</select></label>:<div className="starter-choices">{decks.map(d=><button key={d.id} className={selected.id===d.id?'active':''} aria-pressed={selected.id===d.id} onClick={()=>setChosen(d.id)}><strong>{pairing(d)}</strong><span>{d.title}</span></button>)}</div>}
  <div className="starter-preview"><div><strong>{pairing(selected)} · {selected.title}</strong><p>{selected.description}</p><div className="starter-offers">{selected.loadout.offers.map(o=><span key={o.id}>{o.name}<small>{o.originalTime} 时 · {o.baseAttack}/{o.baseHealth}</small></span>)}</div><p className="starter-strength">思路：{selected.strengths.join('；')}</p><p className="starter-weakness">短板：{selected.weakness}</p></div><button type="button" className="btn subtle" disabled={active} onClick={()=>onApply({...selected.loadout,playerId:current.playerId,name:current.name},selected.title)}>{active?<><Icon name="check"/>正在使用</>:<>应用这套预设<Icon name="arrow"/></>}</button></div>
  <small className="starter-note">应用会替换当前配队；原卡仍留在收藏。预设不增加额外属性。</small>
 </section>
}
