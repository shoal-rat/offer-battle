import {useState} from 'react';
import {registerAccount,loginAccount,accountApi,type Account} from '../api';
import {Icon,Modal} from '../ui';
import '../styles/account.css';

type Mode='login'|'register'|'recover';
interface Props {reason?:string;onClose:()=>void;onAuthenticated:(account:Account)=>void}
export default function AccountPanel({reason,onClose,onAuthenticated}:Props){
 const [mode,setMode]=useState<Mode>('login'),[username,setUsername]=useState(''),[password,setPassword]=useState(''),[nickname,setNickname]=useState(''),[recoveryInput,setRecoveryInput]=useState(''),[visible,setVisible]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[created,setCreated]=useState<{account:Account;key:string}|null>(null),[copied,setCopied]=useState(false),[confirmed,setConfirmed]=useState(false);
 function switchMode(next:Mode){if(busy)return;setMode(next);setPassword('');setError('');setVisible(false)}
 async function submit(e:React.FormEvent){
  e.preventDefault();if(busy)return;setBusy(true);setError('');
  try{
   const result=mode==='register'?await registerAccount({username:username.trim(),password,nickname:nickname.trim()||username.trim()}):mode==='recover'?await accountApi<{account:Account;recoveryKey?:string}>('/api/auth/recover',{username:username.trim(),recoveryKey:recoveryInput.trim(),newPassword:password}):await loginAccount({username:username.trim(),password});
   if(result.recoveryKey)setCreated({account:result.account,key:result.recoveryKey});else onAuthenticated(result.account);
  }catch(e){setError((e as Error).message||'暂时未能连接，请稍后重试')}finally{setBusy(false)}
 }
 const title=created?'把这份恢复码，收好。':mode==='register'?'给你的牌桌，留一个名字。':mode==='recover'?'把自己的牌桌找回来。':'欢迎回来，底牌还在。';
 return <div className="account-layer"><Modal title={title} onClose={()=>{if(!busy){if(created){if(confirmed)onAuthenticated(created.account);else setError('请先妥善保存恢复码，再确认继续。')}else onClose()}}}>
 {created?<div className="recovery-receipt"><span className="account-kicker">ACCOUNT READY · {created.account.username}</span><p>账号已就绪。忘记密码时，用用户名和这份恢复码设置新密码，无需邮箱。</p><p className="account-security-note">{mode==='recover'?'旧恢复码与旧登录会话已失效，请保存这份新恢复码。':''}恢复码只在这里展示一次，拥有它的人可以恢复你的账号。请放进密码管理器或个人安全记录，不要发给朋友。</p><code className="recovery-key" aria-label="账号恢复码">{created.key}</code><button className="btn subtle full" onClick={()=>void navigator.clipboard.writeText(created.key).then(()=>setCopied(true)).catch(()=>setError('剪贴板暂不可用，请手动选择并保存上方恢复码。'))}>{copied?'已复制恢复码':'复制恢复码'}<Icon name="check" size={16}/></button><label className="confirmation"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>我已妥善保存恢复码</span></label>{error&&<p className="account-error" role="alert">{error}</p>}<button className="btn gold full" disabled={!confirmed} onClick={()=>onAuthenticated(created.account)}>保存好了，继续<Icon name="arrow"/></button></div>:<>
 <p className="account-intro">{reason||'游客可直接玩人机与教程；登录后和朋友开打，把完整对局长期留下来。'}</p>
 <div className="account-tabs" aria-label="账号操作"><button className={mode==='login'?'active':''} disabled={busy} onClick={()=>switchMode('login')}>登录</button><button className={mode==='register'?'active':''} disabled={busy} onClick={()=>switchMode('register')}>注册账号</button><button className={mode==='recover'?'active':''} disabled={busy} onClick={()=>switchMode('recover')}>恢复账号</button></div>
 <form onSubmit={e=>void submit(e)}>
 <label className="field">用户名<input name="username" required autoComplete="username" minLength={3} maxLength={32} pattern="[A-Za-z0-9_-]+" autoCapitalize="none" spellCheck={false} value={username} onChange={e=>setUsername(e.target.value)} disabled={busy} placeholder="3–32 位英文、数字、下划线或短横线"/></label>
 {mode==='register'&&<label className="field">牌桌昵称 <small>可选</small><input name="nickname" autoComplete="nickname" maxLength={16} value={nickname} onChange={e=>setNickname(e.target.value)} disabled={busy} placeholder="朋友在牌桌上看到的名字"/></label>}
 {mode==='recover'&&<label className="field">恢复码<input name="recoveryKey" required autoComplete="off" autoCapitalize="none" spellCheck={false} value={recoveryInput} onChange={e=>setRecoveryInput(e.target.value)} disabled={busy} placeholder="注册时保存的恢复码"/></label>}
 <label className="field">{mode==='recover'?'新密码':'密码'}<div className="account-password"><input name="password" aria-label={mode==='recover'?'新密码':'密码'} required type={visible?'text':'password'} autoComplete={mode==='login'?'current-password':'new-password'} minLength={12} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} disabled={busy} placeholder="至少 12 位，请勿与其他网站重复"/><button type="button" aria-label={visible?'隐藏密码':'显示密码'} aria-pressed={visible} onClick={()=>setVisible(!visible)}>{visible?'隐藏':'显示'}</button></div></label>
 {mode==='register'&&<p className="account-security-note">不需要邮箱。注册后请保存一次性展示的恢复码，用于忘记密码时找回账号。游客对局不会因打开此面板而结束。</p>}
 {mode==='recover'&&<p className="account-security-note">验证恢复码后更新密码。请使用你自己的恢复码，不要在公共聊天中发送。</p>}
 {error&&<p className="account-error" role="alert">{error}</p>}
 <button className="btn gold full" disabled={busy} type="submit">{busy?'正在连接牌桌…':mode==='register'?'创建账号':mode==='recover'?'验证并更新密码':'登录并继续'}<Icon name="arrow"/></button>
 </form><p className="account-local-note"><Icon name="shield" size={14}/>本局会留在原处，完成后继续。</p>
 </>}
 </Modal></div>
}
