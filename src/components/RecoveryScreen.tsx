import {Icon} from '../ui';
import '../styles/recovery.css';

export default function RecoveryScreen({failed,onRetry,onExit,onLogin}:{failed:boolean;onRetry:()=>void;onExit:()=>void;onLogin?:()=>void}){
 return <main className="recovery-screen" aria-label="恢复对局">
  <section className="recovery-card">
   <div className={`recovery-emblem ${failed?'paused':''}`} aria-hidden="true"><Icon name={failed?'mail':'cards'} size={38}/></div>
   <span className="eyebrow">OFFER BATTLE · 牌桌还在</span>
   <h1>{failed?(onLogin?'重新登录，回到原来的牌桌。':'连接暂时中断。'):'正在回到你的牌桌。'}</h1>
   <p role="status" aria-live="polite">{failed?(onLogin?'已保留房间信息。请登录原账号恢复席位，对局计时仍会继续。':'已保留这场对局。连接恢复后，可以继续刚才的战斗。'):'正在恢复你的席位和最新牌局，请稍候。'}</p>
   <div className="recovery-actions">
    {failed&&onLogin&&<button className="btn gold" onClick={onLogin}><Icon name="shield" size={17}/>登录恢复对局</button>}
    {failed&&!onLogin&&<button className="btn gold" onClick={onRetry}><Icon name="replay" size={17}/>重试连接</button>}
    <button className="btn subtle" onClick={onExit}>返回会客厅<Icon name="arrow" size={17}/></button>
   </div>
  </section>
 </main>;
}
