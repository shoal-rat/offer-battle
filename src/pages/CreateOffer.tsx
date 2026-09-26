import {useEffect,useState} from 'react';
import {rules,templateById,benefitById} from '../game/catalog';
import {compileOffer} from '../game/offers';
import {CITY_COST_OPTIONS,WORK_NATURE_OPTIONS,WORK_SCHEDULE_OPTIONS,OFFER_COMPILER_VERSION} from '../game/offerTuning';
import type {OfferProfile,OfferDefinition} from '../game/types';
import {OfferCard,Icon,Badge} from '../ui';
import {api} from '../api';
import {exportOffer} from '../share';
import '../styles/offer-forge.css';

const initial:OfferProfile={
  company_display_name:'我的心动公司',ownership:'private',industry:'internet',company_stage:'established',
  role_family:'algorithm',role_title:'算法工程师',city:'',city_cost_level:'auto',work_nature:'standard',work_schedule:'standard',
  monthly_fixed_cny:25000,guaranteed_months:16,annual_fixed_allowance_cny:0,annual_target_bonus_cny:80000,
  annual_equity_cny:0,one_time_signing_cny:0,confirmed_benefits:[],
};
const money=(value:number)=>`${(value/10000).toLocaleString('zh-CN',{maximumFractionDigits:2})} 万`;
const signed=(value:number)=>value>0?`+${value}`:value<0?`−${Math.abs(value)}`:'0';
const salaryFields=[
  ['monthly_fixed_cny','固定月薪','元 / 月'],['guaranteed_months','保证薪数','个月'],
  ['annual_fixed_allowance_cny','年度固定津贴','元'],['annual_target_bonus_cny','年度目标奖金','元'],
  ['annual_equity_cny','年度股权价值','元'],['one_time_signing_cny','一次性签字费','元 · 不计年包'],
] as const;
function readableError(error:unknown){
  let message=error instanceof Error?error.message:'暂时无法生成预览，请检查填写内容。';
  for(const [key,label] of salaryFields)message=message.replaceAll(key,label);
  return message;
}
function shiftText(tilt:number){return tilt?`排面 ${signed(tilt)} / 底气 ${signed(-tilt)}`:'排面 / 底气不变'}

export default function CreateOffer({onSaved,onBuild,notify}:{onSaved:(offer:OfferDefinition)=>void;onBuild:()=>void;notify:(message:string)=>void}){
  const [form,setForm]=useState(initial),[benefit,setBenefit]=useState(''),[paste,setPaste]=useState('');
  const [confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[saved,setSaved]=useState<OfferDefinition|null>(null);
  const [reference,setReference]=useState(''),[flavor,setFlavor]=useState(0);
  const [capabilities,setCapabilities]=useState({imageProvider:false,textProvider:false}),[job,setJob]=useState<any>(null);
  useEffect(()=>{api('/api/capabilities').then(setCapabilities).catch(()=>{})},[]);
  useEffect(()=>()=>{if(reference)URL.revokeObjectURL(reference)},[reference]);
  useEffect(()=>{
    if(!job||!['queued','running'].includes(job.state))return;
    let cancelled=false;
    const timer=setInterval(()=>{
      api(`/api/generation/jobs/${job.id}`).then(async data=>{
        if(cancelled)return;
        if(data.job.state==='ready'){
          const profile=await api('/api/profile');
          const offer=profile.offers.find((candidate:OfferDefinition)=>candidate.id===saved?.id);
          if(!cancelled&&offer){setSaved(offer);onSaved(offer)}
        }
        if(!cancelled)setJob(data.job);
      }).catch(error=>{if(!cancelled)notify(error.message)});
    },1200);
    return()=>{cancelled=true;clearInterval(timer)};
  },[job?.id,job?.state,saved?.id]);

  function invalidate(){setConfirmed(false);setSaved(null);setJob(null)}
  function update(changes:Partial<OfferProfile>){setForm(current=>({...current,...changes}));invalidate()}
  let preview:OfferDefinition|null=null,previewError='';
  try{
    if(!form.company_display_name.trim())throw Error('请填写公司显示名，再生成你的角色卡。');
    preview=compileOffer({...form,confirmed_benefits:benefit?[benefit]:[]},benefit||null,'preview');
  }catch(error){previewError=readableError(error)}
  const tuning=preview?.tuning,template=preview?templateById[preview.templateId]:null;
  const selectedBenefit=benefit?benefitById[benefit]:null;
  const natureDescription=WORK_NATURE_OPTIONS.find(option=>option.value===form.work_nature)?.description;
  const scheduleDescription=WORK_SCHEDULE_OPTIONS.find(option=>option.value===form.work_schedule)?.description;
  const cityDescription=CITY_COST_OPTIONS.find(option=>option.value===form.city_cost_level)?.description;

  async function save(){
    if(!confirmed||!preview||busy)return;
    setBusy(true);
    try{
      const result=await api('/api/offers',{profile:{...form,confirmed_benefits:benefit?[benefit]:[]},benefitId:benefit||null,creative:{gender:'默认造型',flavor}});
      setSaved(result.offer);onSaved(result.offer);notify('Offer 已收入收藏，可以拿去开打了');
    }catch(error){notify(readableError(error))}finally{setBusy(false)}
  }
  function parse(){
    const next={...form};
    const monthly=paste.match(/(?:月薪|月固定|月工资)[：:\s]*(\d+(?:\.\d+)?)\s*(k|K|万|元)?/);
    if(monthly)next.monthly_fixed_cny=Number(monthly[1])*(monthly[2]?.toLowerCase()==='k'?1000:monthly[2]==='万'?10000:1);
    const months=paste.match(/(\d+)\s*薪/);if(months)next.guaranteed_months=Number(months[1]);
    const company=paste.match(/(?:公司|单位)[：:\s]*([^\n，,]+)/);if(company)next.company_display_name=company[1].trim();
    const role=paste.match(/(?:岗位|职位)[：:\s]*([^\n，,]+)/);if(role)next.role_title=role[1].trim();
    update(next);notify('已提取明确的月薪、薪数、公司与岗位；请逐项确认其余字段');
  }
  function jumpTo(id:string){document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'})}

  return <div className="page creator-page offer-forge">
    <div className="page-heading forge-heading">
      <div><span className="eyebrow">THE OFFER FORGE</span><h1>让你的 Offer，<em>站上牌桌。</em></h1><p>年包定费用，工作条件塑造打法。每一点属性，都有来处。</p></div>
      <div className="forge-heading-note"><Icon name="cards" size={27}/><span>一份真实条件<br/><strong>一张专属底牌</strong></span><Badge>本地创作 · 无需密钥</Badge></div>
    </div>
    <div className="forge-process" aria-label="造卡流程">
      {['年包定档','模板定型','工作条件微调','条款结算'].map((step,index)=><span key={step}><b>0{index+1}</b>{step}{index<3&&<Icon name="arrow" size={13}/>}</span>)}
    </div>

    <section className={`forge-live-stats ${previewError?'has-error':''}`} aria-label="实时属性">
      <div className="forge-live-title"><span className="live-dot"/><div><span>实时入场属性</span><strong>{preview?.name||'等待完善 Offer'}</strong></div></div>
      <div className="forge-stat-values" aria-live="polite" aria-atomic="true">
        <div className="forge-stat forge-stat-cost"><Icon name="clock" size={19}/><span><b data-testid="forge-cost">{preview?.originalTime??'—'}</b><small>费用 · 小时</small></span></div>
        <div className="forge-stat forge-stat-attack"><Icon name="sword" size={19}/><span><b data-testid="forge-attack">{preview?.baseAttack??'—'}</b><small>排面 · 攻击</small></span></div>
        <div className="forge-stat forge-stat-health"><Icon name="heart" size={19}/><span><b data-testid="forge-health">{preview?.baseHealth??'—'}</b><small>底气 · 血量</small></span></div>
      </div>
      <div className="forge-jump-links"><button type="button" onClick={()=>jumpTo('offer-fields')}>编辑信息</button><button type="button" onClick={()=>jumpTo('offer-explanation')}>查看依据 <Icon name="arrow" size={13}/></button></div>
    </section>
    {previewError&&<div className="forge-preview-error" role="alert"><Icon name="info"/><div><strong>预览暂不可用</strong><p>{previewError}</p><small>修正后会自动重新生成；当前不能保存。</small></div></div>}

    <div className="creator-layout forge-workspace">
      <form className="form-panel forge-form" id="offer-fields" noValidate onSubmit={event=>{event.preventDefault();void save()}}>
        <fieldset disabled={busy}>
          <div className="section-heading"><span>01</span><h2>这份工作，叫什么</h2><small>名称精准，才好比 Offer</small></div>
          <details className="paste-panel"><summary>粘贴 Offer 文本 / 添加参考图 <Icon name="plus" size={15}/></summary>
            <textarea aria-label="Offer 原文" value={paste} onChange={event=>setPaste(event.target.value)} placeholder={'公司：方盒科技\n岗位：算法工程师\n月薪：25k，16 薪'}/>
            <button type="button" className="btn subtle" onClick={parse} disabled={!paste}>提取明确字段</button>
            <label className="upload-btn">添加参考图片<input type="file" accept="image/*" onChange={event=>{const file=event.target.files?.[0];if(!file)return;if(file.size>8*1024*1024){notify('参考图请小于 8MB');return}setReference(URL.createObjectURL(file));notify('参考图已展示；请在下方手动确认字段')}}/></label>
            {reference&&<div className="reference-preview"><img src={reference} alt="Offer 参考图片"/><p>参考图仅在本页展示，不自动识别，不进入对局。</p><button type="button" className="text-btn" onClick={()=>setReference('')}>移除原图</button></div>}
          </details>
          <label className="field">卡牌名称<input maxLength={16} value={form.card_display_name||''} onChange={event=>update({card_display_name:event.target.value})} placeholder="例如：大厂算法岗、银行基层、投行做债"/><small>写清楚岗位。留空时按行业与岗位生成，公司名另列在卡面小字中。</small></label>
          <div className="form-grid">
            <label className="field">公司显示名<input maxLength={24} value={form.company_display_name} onChange={event=>update({company_display_name:event.target.value})}/></label>
            <label className="field">岗位名称<input maxLength={24} value={form.role_title} onChange={event=>update({role_title:event.target.value})}/></label>
            <label className="field">所在行业<select aria-label="所在行业" value={form.industry} onChange={event=>update({industry:event.target.value})}>{[['internet','互联网 / 游戏'],['manufacturing','制造 / 硬件'],['finance','金融'],['consulting','咨询'],['public_service','公共服务'],['healthcare','医疗健康'],['education','教育'],['other','其他']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
            <label className="field">职业归类<select aria-label="职业归类" value={form.role_family} onChange={event=>update({role_family:event.target.value})}>{[['algorithm','算法 / 开发'],['administration','综合职能'],['product','产品 / 项目'],['hardware_rd','硬件研发'],['management','管理岗'],['sales','销售'],['testing','测试 / 质量'],['hr','人事 / 招聘'],['general_rd','研发'],['general','其他岗位']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
            <label className="field">公司性质<select aria-label="公司性质" value={form.ownership} onChange={event=>update({ownership:event.target.value})}><option value="private">民营企业</option><option value="state_owned">国有企业</option><option value="foreign_owned">外资企业</option><option value="central_state_owned">中央企业</option></select></label>
            <label className="field">公司阶段<select aria-label="公司阶段" value={form.company_stage} onChange={event=>update({company_stage:event.target.value})}><option value="established">成熟企业</option><option value="startup">初创企业</option></select></label>
          </div>
          <label className="field">玩法类型<select aria-label="玩法类型" value={form.selected_template_id||''} onChange={event=>update({selected_template_id:event.target.value||undefined})}><option value="">根据行业与岗位自动匹配</option>{rules.offer_templates.map(item=><option key={item.id} value={item.id}>{item.name} — {item.main_effect}</option>)}</select><small>类型决定基础身材与固定技能。新岗位也可沿用这些类型，再用实际工作条件生成属性；工作名称保持精准。</small></label>

          <div className="section-heading forge-section-divider"><span>02</span><h2>在哪工作，怎样工作</h2></div>
          <p className="forge-section-intro">城市、行业与工作条件共同塑造排面和底气，节奏也会影响入场费用。</p>
          <div className="form-grid">
            <label className="field">工作城市（可选）<input maxLength={30} value={form.city} onChange={event=>update({city:event.target.value})} placeholder="例如：上海、成都、苏州"/></label>
            <label className="field">城市生活成本<select aria-label="城市生活成本" value={form.city_cost_level||'auto'} onChange={event=>update({city_cost_level:event.target.value as OfferProfile['city_cost_level']})}>{CITY_COST_OPTIONS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          </div>
          <div className="forge-field-note" data-testid="forge-city-summary"><Icon name="info" size={15}/><p>{cityDescription}{tuning&&<strong>当前{tuning.citySource==='auto'?'自动匹配':'手动选择'}：{tuning.cityLevel==='high'?'高生活成本':tuning.cityLevel==='low'?'低生活成本':'生活成本适中'}。</strong>}</p></div>
          <div className="form-grid forge-work-conditions">
            <label className="field">工作性质<select aria-label="工作性质" value={form.work_nature||'standard'} onChange={event=>update({work_nature:event.target.value as OfferProfile['work_nature']})}>{WORK_NATURE_OPTIONS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select><small>{natureDescription}</small></label>
            <label className="field">工作节奏<select aria-label="工作节奏" value={form.work_schedule||'standard'} onChange={event=>update({work_schedule:event.target.value as OfferProfile['work_schedule']})}>{WORK_SCHEDULE_OPTIONS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select><small>{scheduleDescription}</small></label>
          </div>

          <div className="section-heading forge-section-divider"><span>03</span><h2>薪酬与福利</h2><small>人民币 · 税前</small></div>
          <div className="form-grid">{salaryFields.map(([key,label,unit])=><label className="field" key={key}>{label}<div className="input-unit"><input type="number" min={key==='guaranteed_months'||key==='monthly_fixed_cny'?1:0} max={key==='guaranteed_months'?36:100000000} step={key==='guaranteed_months'?1:'any'} value={form[key]} onChange={event=>update({[key]:Number(event.target.value)})}/><span>{unit}</span></div></label>)}</div>
          <div className="forge-package"><span>本次计价年包<small>一次性签字费不计入</small></span><strong>{preview?money(preview.annualPackage):'—'}<small> / 年</small></strong></div>
          <label className="field">启用一项已确认条款<select aria-label="启用一项已确认条款" value={benefit} onChange={event=>{setBenefit(event.target.value);invalidate()}}><option value="">不启用条款</option>{rules.benefits.map(item=><option key={item.id} value={item.id}>{item.name} — {item.text}</option>)}</select></label>
          <p className="helper">条款增加独立效果，同时减少 1 点底气；底气已为 1 时改为减少排面，属性最低为 1。</p>
          <div className="forge-save-panel">
            <label className="confirmation"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/><span>以上信息与所选条款已经由我确认，愿意在对局中公开公司名和卡牌属性。</span></label>
            <button type="submit" className="btn gold full" disabled={!confirmed||!preview||busy||!!saved}><Icon name="spark"/>{busy?'正在编译与保存…':saved?'已收入收藏':'生成我的角色卡'}</button>
            <p className={`forge-save-hint ${saved?'is-saved':''}`}>{saved?'这张卡已保存在你的收藏里，可以带去开打。':'修改任一造卡条件后，需要重新确认并保存。'}</p>
          </div>
        </fieldset>
      </form>

      <aside className="creation-preview">
        <div className="forge-card-panel">
          <div className="preview-label"><span className="live-dot"/>实时卡面预览<span className="forge-draft-tag">{saved?'已收藏':'草稿'}</span></div>
          <div className="forge-card-stage">{preview?<OfferCard offer={saved||preview}/>:<div className="forge-empty-card"><Icon name="cards" size={48}/><strong>你的角色，即将登场</strong><p>完善左侧信息，<br/>卡面与属性会实时出现。</p></div>}</div>
          <div className="flavor-quote">“{['年包先放这儿，剩下的你自己体会。','工资先亮，底牌后出。','你负责开场炸裂，我负责还在场上。'][flavor%3]}”</div>
          <button type="button" className="text-btn" onClick={()=>setFlavor(current=>current+1)}><Icon name="replay" size={14}/>换句狠话</button>
          {saved&&<div className="saved-actions">
            <div className="success-label"><Icon name="check"/>已收入收藏 · 本地职业插画</div>
            <button type="button" className="btn gold full" onClick={onBuild}>带去开打<Icon name="arrow"/></button>
            <button type="button" className="btn subtle full" onClick={()=>exportOffer(saved).catch(()=>notify('分享图生成失败，请重试'))}><Icon name="download"/>保存晒卡图</button>
            <button type="button" className="btn subtle full" disabled={!capabilities.imageProvider||['queued','running'].includes(job?.state)} onClick={async()=>{try{const data=await api(`/api/offers/${saved.id}/appearance`,{stage:'image'});setJob(data.job)}catch(error){notify(readableError(error))}}}><Icon name="spark"/>{['queued','running'].includes(job?.state)?'个性插画正在生成…':capabilities.imageProvider?'生成新外观':'个性插画 · 需配置图像服务'}</button>
            {job?.state==='failed'&&<div className="generation-error"><p>{job.error||'生成失败，现有角色仍可开打。'}</p><button type="button" className="text-btn" onClick={async()=>{try{const data=await api(`/api/generation/jobs/${job.id}/retry`,{});setJob(data.job)}catch(error){notify(readableError(error))}}}>重试这一环节</button></div>}
          </div>}
        </div>
        <section className="compile-receipt forge-receipt" id="offer-explanation" aria-label="生成依据">
          <header><span className="eyebrow">EVERY POINT HAS A REASON</span><h2><Icon name="shield" size={19}/>生成依据<span>v{OFFER_COMPILER_VERSION}</span></h2><p>从真实条件，到最终三项属性。</p></header>
          {preview&&tuning&&template?<>
            <div className="forge-receipt-section"><h3><b>01</b>年包定档<span>{tuning.salaryCost} 小时</span></h3>
              <dl className="forge-money-breakdown"><div><dt>固定年薪</dt><dd>{money(preview.annualFixed)}</dd></div><div><dt>计价年包</dt><dd>{money(preview.annualPackage)}</dd></div></dl>
              <p className="forge-receipt-note">月薪 × 保证薪数 + 固定津贴 + 目标奖金 + 年度股权。一次性签字费不计入。</p>
            </div>
            <div className="forge-receipt-section"><h3><b>02</b>模板定型<span>{template.name}</span></h3><p className="forge-template-skill">{template.main_effect}</p>
              <div className="forge-template-body">按调整后的费用计算基础身材：<strong>排面 {Math.max(1,preview.originalTime+template.attack_delta)} / 底气 {Math.max(1,preview.originalTime+template.health_delta)}</strong></div>
              <p className="forge-receipt-note">{form.selected_template_id?'你手动选择了这个玩法类型。':'根据行业、公司性质与岗位自动匹配。'}</p>
            </div>
            <div className="forge-receipt-section"><h3><b>03</b>工作条件微调</h3><p className="forge-receipt-note">以下为单项倾向；合计后统一限制范围，再应用到属性。</p>
              <ul className="forge-contributions">{tuning.contributions.map(row=><li key={row.key} data-contribution={row.key}><div><strong>{row.label}</strong><span>{row.detail}</span></div><div className="forge-contribution-delta">{row.cost!==0&&<span className="cost-delta">费用 {signed(row.cost)}</span>}<span className={row.tilt>0?'tilt-attack':row.tilt<0?'tilt-health':'tilt-neutral'}>{row.tilt===0?'身材倾向不变':shiftText(row.tilt)}</span></div></li>)}</ul>
              <div className="forge-applied-adjustment"><p><span>实际费用修正</span><strong data-testid="forge-cost-adjustment">{signed(tuning.costAdjustment)} → {preview.originalTime} 小时</strong></p><p><span>倾向合计 / 实际转移</span><strong data-testid="forge-applied-tilt">{signed(tuning.requestedTilt)} / {signed(tuning.appliedTilt)}</strong></p><small>{tuning.appliedTilt>0?`从底气转移 ${tuning.appliedTilt} 点到排面。`:tuning.appliedTilt<0?`从排面转移 ${-tuning.appliedTilt} 点到底气。`:'本次无需在排面与底气之间转移。'}费用限制为 2–7；最多转移 2 点，任一属性不低于 1，总点数不因转移增加。</small></div>
            </div>
            <div className="forge-receipt-section"><h3><b>04</b>条款结算<span>{selectedBenefit?.name||'未启用条款'}</span></h3>
              <p className="forge-receipt-note">{selectedBenefit?selectedBenefit.text:'没有额外条款效果，排面与底气不扣减。'}</p>
              {selectedBenefit&&<p className="forge-benefit-cost" data-testid="forge-benefit-cost">{tuning.benefitPenalty.health?`条款代价：底气 −${tuning.benefitPenalty.health}`:tuning.benefitPenalty.attack?`底气已为 1，条款代价：排面 −${tuning.benefitPenalty.attack}`:'排面与底气均为 1，不再扣减。'}</p>}
              <div className="forge-final-line"><span>最终入场</span><strong>{preview.originalTime} 费用 <i>·</i> {preview.baseAttack} 排面 <i>·</i> {preview.baseHealth} 底气</strong></div>
            </div>
            <footer>同一组条件始终生成相同属性。改名或换图不提供加成。行业与城市档位采用固定游戏规则，你可以为新岗位选择合适的类型与实际条件。</footer>
          </>:<div className="forge-receipt-unavailable"><Icon name="info" size={24}/><p>{previewError||'完成表单后，这里会逐项展示生成依据。'}</p><button type="button" className="text-btn" onClick={()=>jumpTo('offer-fields')}>返回完善信息 <Icon name="arrow" size={14}/></button></div>}
        </section>
      </aside>
    </div>
  </div>;
}
