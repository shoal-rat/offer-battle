import {usePaperFeedback} from '../motion/usePaperFeedback';
import SceneAnchor from '../scene/SceneAnchor';
import {useEffect,useRef,useState} from 'react';
import {rules,templateById,benefitById} from '../game/catalog';
import {compileOffer,exampleOffers} from '../game/offers';
import {CITY_COST_OPTIONS,WORK_NATURE_OPTIONS,WORK_SCHEDULE_OPTIONS,OFFER_COMPILER_VERSION} from '../game/offerTuning';
import {emptyDraft,editDraft,draftFromOffer,exampleDraft,confirmDraftFields,confirmZeroIncome,useStandardConditions,draftProfile,missingDraftFields,recommendedTemplate,parseOfferText,mergeDiff,mergeParsedDraft,draftFromExtracted,inferRoleFamily,FIELD_LABELS,type OfferDraft} from '../game/draft';
import {createPersona,localPersonaArt,type GenerationPreferences} from '../game/draft-persona';
import type {OfferProfile,OfferDefinition} from '../game/types';
import {OfferCard,Icon,Badge,Modal} from '../ui';
import {api,ApiError} from '../api';
import ShareDialog from '../components/ShareDialog';
import '../styles/offer-forge.css';

type SaveIntent='create'|'revise'|'copy';
type SavedBinding={offer:OfferDefinition;revision:number};
type SaveOperation={key:string;revision:number;intent:SaveIntent;targetId?:string};
interface Props {onSaved:(offer:OfferDefinition)=>void;onBuild:()=>void;notify:(message:string)=>void;editingOffer?:OfferDefinition|null;initialIntent?:'revise'|'copy'}
const money=(value:number)=>`${(value/10000).toLocaleString('zh-CN',{maximumFractionDigits:2})} 万`;
const signed=(value:number)=>value>0?`+${value}`:value<0?`−${Math.abs(value)}`:'0';
const salaryFields=[['monthly_fixed_cny','固定月薪','元 / 月'],['guaranteed_months','保证薪数','个月'],['annual_fixed_allowance_cny','年度固定津贴','元'],['annual_target_bonus_cny','年度目标奖金','元'],['annual_equity_cny','年度股权价值','元'],['one_time_signing_cny','一次性签字费','元 · 不计年包']] as const;
function readableError(error:unknown){let message=error instanceof Error?error.message:'操作未完成，请重试。';for(const [key,label]of salaryFields)message=message.replaceAll(key,label);return message;}
function shiftText(tilt:number){return tilt?`排面 ${signed(tilt)} / 底气 ${signed(-tilt)}`:'排面 / 底气不变'}
function restore(key:string,offer?:OfferDefinition|null){try{const value=JSON.parse(localStorage.getItem(key)||'null');if(value?.draft?.revision&&Object.keys(emptyDraft().fields).every(field=>field in value.draft.fields))return value;}catch{}return {draft:offer?draftFromOffer(offer):emptyDraft(),target:offer??null,saved:null,job:null,operation:null,confirmedRevision:null};}

export default function CreateOffer({onSaved,onBuild,notify,editingOffer,initialIntent}:Props){
 const feedback=usePaperFeedback();
 const storageKey=`offer-forge-draft-v2:${editingOffer?.id??'new'}:${initialIntent??'create'}`;
 const initial=useRef(restore(storageKey,editingOffer));
 const [draft,setDraft]=useState<OfferDraft>(initial.current.draft),[target,setTarget]=useState<OfferDefinition|null>(initial.current.target);
 const [intent,setIntent]=useState<SaveIntent>(editingOffer?initialIntent??'revise':initial.current.target?'revise':'create');
 const [saved,setSaved]=useState<SavedBinding|null>(initial.current.saved),[confirmedRevision,setConfirmedRevision]=useState<number|null>(initial.current.confirmedRevision);
 const [conflict,setConflict]=useState<OfferDefinition|null>(null);
 const [shareOffer,setShareOffer]=useState<OfferDefinition|null>(null);
 const extractionSource=useRef(0);
 const [paste,setPaste]=useState(''),[mergeCandidate,setMergeCandidate]=useState<OfferDraft|null>(null),[busy,setBusy]=useState(false),[extracting,setExtracting]=useState(false);
 const [reference,setReference]=useState(''),[referenceData,setReferenceData]=useState<{mime:string;base64:string}|null>(null),[job,setJob]=useState<any>(initial.current.job);
 const [capabilities,setCapabilities]=useState<any>({imageProvider:false,textProvider:false,extract:false});
 const operation=useRef<SaveOperation|null>(initial.current.operation),saving=useRef(false),live=useRef({revision:draft.revision,targetId:target?.id});live.current={revision:draft.revision,targetId:target?.id};
 const mounted=useRef(true);
 useEffect(()=>{mounted.current=true;api('/api/capabilities').then(value=>{if(mounted.current)setCapabilities(value)}).catch(()=>{});return()=>{mounted.current=false}},[]);
 useEffect(()=>()=>{if(reference)URL.revokeObjectURL(reference)},[reference]);
 useEffect(()=>{try{localStorage.setItem(storageKey,JSON.stringify({draft,target,saved,job,operation:operation.current,confirmedRevision}))}catch{notify('草稿暂时无法写入设备；请保持此页并重试保存')}},[draft,target,saved,job,confirmedRevision]);
 useEffect(()=>{
  if(!target||!capabilities.imageProvider&&!capabilities.textProvider)return;
  let active=true;api('/api/generation/jobs').then(data=>{if(!active)return;const latest=data.jobs?.filter((item:any)=>item.offerId===target.id).sort((a:any,b:any)=>b.updatedAt-a.updatedAt)[0];if(latest)setJob(latest)}).catch(()=>{});return()=>{active=false};
 },[target?.id,capabilities.imageProvider,capabilities.textProvider]);
 useEffect(()=>{
  if(!job||!['queued','running'].includes(job.state))return;
  let active=true;
  const timer=setInterval(()=>{api(`/api/generation/jobs/${job.id}`).then(async data=>{
   if(!active)return;setJob(data.job);
   if(data.job.state==='ready'){
    const profile=await api('/api/profile'),offer=profile.offers.find((value:OfferDefinition)=>value.id===data.job.offerId);
    if(!active||!offer)return;onSaved(offer);
    if(live.current.targetId===offer.id&&live.current.revision===data.job.draftRevision&&offer.definitionRevision===data.job.definitionRevision){setSaved({offer,revision:live.current.revision});setTarget(offer);feedback('generationReady','.forge-card-stage',`generation:${data.job.id}`);}
   }
  }).catch(error=>{if(active)notify(readableError(error))})},1000);
  return()=>{active=false;clearInterval(timer)};
 },[job?.id,job?.state]);
 function change(next:OfferDraft){live.current.revision=next.revision;setDraft(next);setConfirmedRevision(null);operation.current=null;}
 function update(changes:Partial<OfferProfile>){change(editDraft(draft,changes))}
 function updateRole(value:string){change(editDraft(editDraft(draft,{role_title:value}),{role_family:inferRoleFamily(value)},'parsed',false))}
 function changePreference(changes:Partial<GenerationPreferences>){change({...draft,revision:draft.revision+1,preferences:{...draft.preferences,...changes}})}
 function chooseBenefit(value:string){change({...draft,revision:draft.revision+1,benefitId:value||null,benefitConfirmed:true})}
 function replaceDraft(next:OfferDraft){change(next);setTarget(null);setIntent('create');setSaved(null);setJob(null)}
 function parse(merge=false){const parsed=parseOfferText(paste,draft.revision+1);if(merge)setMergeCandidate(parsed);else{replaceDraft(parsed);notify('已替换为空白基础上的新草稿；未提取的字段仍待确认')}}
 function fieldStatus(key:keyof OfferProfile){const field=draft.fields[key]!;return <small data-field-state={key}>{field.value===null?'未填写 · 未确认':`${field.source==='parsed'?'文本提取':field.source==='imported'?'已导入':field.source==='user'?'手动填写':'未填写'} · ${field.confirmed?'已确认':'待确认'}${field.value===0?' · 明确为零':''}`}</small>}
 const form=Object.fromEntries(Object.entries(draft.fields).map(([key,value])=>[key,value.value??undefined])) as Partial<OfferProfile>;
 const benefit=draft.benefitId??'',confirmed=confirmedRevision===draft.revision,savedCurrent=saved?.revision===draft.revision?saved.offer:null;
 let preview:OfferDefinition|null=null,previewError='';
 try{preview=compileOffer(draftProfile(draft),draft.benefitId,'preview');preview.persona=createPersona(preview,draft.preferences,target?.persona?.seed??draft.characterSeed);preview.artId=localPersonaArt(preview,draft.preferences);if(savedCurrent?.artId)preview.artId=savedCurrent.artId;if(savedCurrent?.persona)preview.persona=savedCurrent.persona;}catch(error){previewError=readableError(error)}
 const tuning=preview?.tuning,template=preview?templateById[preview.templateId]:null,selectedBenefit=benefit?benefitById[benefit]:null;
 const recommendation=recommendedTemplate(draft),missing=missingDraftFields(draft);
 const natureDescription=WORK_NATURE_OPTIONS.find(value=>value.value===form.work_nature)?.description,scheduleDescription=WORK_SCHEDULE_OPTIONS.find(value=>value.value===form.work_schedule)?.description,cityDescription=CITY_COST_OPTIONS.find(value=>value.value===form.city_cost_level)?.description;
 async function save(){
  if(!confirmed||!preview||saving.current)return;saving.current=true;setBusy(true);
  const revision=draft.revision,currentTarget=target,saveIntent=intent;
  if(!operation.current||operation.current.revision!==revision||operation.current.intent!==saveIntent||operation.current.targetId!==currentTarget?.id)operation.current={key:crypto.randomUUID(),revision,intent:saveIntent,targetId:currentTarget?.id};
  // Write the operation before sending, so a reload after a lost response reuses the same key.
  try{localStorage.setItem(storageKey,JSON.stringify({draft,target,saved,job,operation:operation.current,confirmedRevision}))}catch{}
  try{
   const result=await api(saveIntent==='revise'?`/api/offers/${currentTarget!.id}`:'/api/offers',{profile:draftProfile(draft),benefitId:draft.benefitId,draftRevision:revision,idempotencyKey:operation.current.key,intent:saveIntent,preferences:draft.preferences,characterSeed:draft.characterSeed,...(saveIntent==='revise'?{expectedDefinitionRevision:currentTarget?.definitionRevision??1}:{}),...(saveIntent==='copy'?{sourceOfferId:currentTarget?.id}:{})},saveIntent==='revise'?'PATCH':'POST');
   onSaved(result.offer);
   if(mounted.current&&live.current.revision===revision){setTarget(result.offer);setIntent('revise');setSaved({offer:result.offer,revision});feedback('saveReceipt','.success-label',`save:${result.offer.id}:${result.offer.definitionRevision}`);if(result.job)setJob(result.job);notify(`${result.offer.name}已收入收藏 · 定义第${result.offer.definitionRevision??1}版`)}else notify('此前提交的版本已保存；当前修改仍是待确认草稿');
  }catch(error){feedback('errorNote','.forge-save-hint',`error:${Date.now()}`);if(error instanceof ApiError&&error.code==='OFFER_REVISION_CONFLICT'&&currentTarget){try{const profile=await api('/api/profile'),latest=profile.offers.find((offer:OfferDefinition)=>offer.id===currentTarget.id);if(mounted.current&&latest)setConflict(latest)}catch{}}notify(readableError(error))}finally{saving.current=false;if(mounted.current)setBusy(false)}
 }
 async function extract(){
  const revision=draft.revision,sourceVersion=extractionSource.current;setExtracting(true);
  try{const result=await api('/api/extractions',{text:paste,...referenceData,draftRevision:revision});if(!mounted.current)return;if(live.current.revision!==revision||extractionSource.current!==sourceVersion){notify('识别期间草稿已修改，旧识别结果已忽略');return}replaceDraft(draftFromExtracted(result.fields,revision+1));notify('识别结果待逐项确认，未填写的字段保持未知')}catch(error){notify(readableError(error))}finally{if(mounted.current)setExtracting(false)}
 }
 async function generate(stage:'image'|'text'){
  if(!savedCurrent)return;
  try{const data=await api(`/api/offers/${savedCurrent.id}/appearance`,{stage,expectedDefinitionRevision:savedCurrent.definitionRevision??1,draftRevision:draft.revision});if(mounted.current&&live.current.revision===draft.revision)setJob(data.job)}catch(error){notify(readableError(error))}
 }
 function jumpTo(id:string){document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'})}
 return <div className="page creator-page offer-forge" data-draft-revision={draft.revision}>
  <div className="page-heading forge-heading"><SceneAnchor kind="create"/><div><span className="eyebrow">YOUR OFFER, YOUR CHARACTER</span><h1>制作我的 Offer</h1><p>把工作资料确认清楚，再让角色带着自己的口吻上桌。</p></div><Badge>草稿第 {draft.revision} 版 · 规则 {OFFER_COMPILER_VERSION}</Badge></div>
  <div className="forge-process" aria-label="造卡流程">{['确认工作','确认薪酬','角色表达'].map((step,index)=><span key={step}><b>0{index+1}</b>{step}</span>)}</div>
  <section className={`forge-live-stats ${previewError?'has-error':''}`} aria-label="实时属性"><div className="forge-live-title"><span className="live-dot"/><div><span>当前草稿属性</span><strong>{preview?.name||'等待确认 Offer'}</strong></div></div><div className="forge-stat-values" aria-live="polite"><div className="forge-stat forge-stat-cost"><Icon name="clock"/><span><b data-testid="forge-cost">{preview?.originalTime??'—'}</b><small>费用 · 小时</small></span></div><div className="forge-stat forge-stat-attack"><Icon name="sword"/><span><b data-testid="forge-attack">{preview?.baseAttack??'—'}</b><small>排面 · 攻击</small></span></div><div className="forge-stat forge-stat-health"><Icon name="heart"/><span><b data-testid="forge-health">{preview?.baseHealth??'—'}</b><small>底气 · 血量</small></span></div></div><div className="forge-jump-links"><button type="button" onClick={()=>jumpTo('offer-fields')}>编辑信息</button><button type="button" onClick={()=>jumpTo('offer-explanation')}>查看依据 <Icon name="arrow"/></button></div></section>
  {draft.isExample&&<p className="helper" role="status">当前使用示例资料，不代表你的真实 Offer。请修改并确认后再收藏。</p>}
  {previewError&&<div className="forge-preview-error" role="alert"><Icon name="info"/><div><strong>尚未生成最终数值</strong><p>{previewError}</p></div></div>}
  <div className="creator-layout forge-workspace"><form className="form-panel forge-form" id="offer-fields" noValidate onSubmit={event=>{event.preventDefault();void save()}}>
   <fieldset>
    <div className="section-heading"><span>01</span><h2>这份工作，叫什么</h2></div>
    <div className="saved-actions"><button type="button" className="btn subtle" onClick={()=>{const next=exampleDraft({...exampleOffers[0].profile!,city_cost_level:'auto',work_nature:'standard',work_schedule:'standard',selected_template_id:exampleOffers[0].templateId},draft.revision+1);replaceDraft(next)}}>填入示例</button><button type="button" className="text-btn" onClick={()=>replaceDraft(emptyDraft(draft.revision+1))}>清空为新卡</button></div>
    <details className="paste-panel"><summary>粘贴 Offer 文本 / 添加参考图 <Icon name="plus"/></summary><textarea aria-label="Offer 原文" value={paste} onChange={event=>{extractionSource.current++;setPaste(event.target.value)}} placeholder={'公司：方盒科技\n岗位：算法工程师\n月薪：25k，16薪'}/><button type="button" className="btn subtle" disabled={!paste.trim()} onClick={()=>parse()}>提取并替换草稿</button><button type="button" className="text-btn" disabled={!paste.trim()} onClick={()=>parse(true)}>合并当前草稿…</button>
     <label className="field">参考图片（仅供查看）<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>{const file=event.target.files?.[0];if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)){notify('请选择 PNG、JPEG 或 WebP 图片');return}if(file.size>5000000){notify('请选择 5 MB 内的参考图片');return}const sourceVersion=++extractionSource.current;setReference(URL.createObjectURL(file));setReferenceData(null);const reader=new FileReader();reader.onload=()=>{if(extractionSource.current===sourceVersion)setReferenceData({mime:file.type,base64:String(reader.result).split(',')[1]})};reader.readAsDataURL(file)}}/></label>{reference&&<img className="reference-preview" src={reference} alt="本地 Offer 参考图片" style={{maxWidth:'100%',maxHeight:200,objectFit:'contain'}}/>}
     {capabilities.extract||capabilities.generation?.extract?.available?<button type="button" className="btn subtle" disabled={extracting||!paste.trim()&&!referenceData} onClick={()=>void extract()}>{extracting?'正在识别字段…':'自动识别（逐项确认）'}</button>:<p className="helper">参考图片只在你的设备显示，不会自动识别薪酬。粘贴提取在本机完成。</p>}
    </details>
    {draft.reportedAnnualPackage!==null&&<p role="status" className="helper">原文年包：{money(draft.reportedAnnualPackage)}。尚不据此推算月薪或薪数，请分别确认。</p>}
    <div className="form-grid"><label className="field">公司显示名<input aria-label="公司显示名" maxLength={60} value={form.company_display_name??''} onChange={event=>update({company_display_name:event.target.value})}/>{fieldStatus('company_display_name')}</label><label className="field">具体岗位名称<input aria-label="具体岗位名称" maxLength={60} value={form.role_title??''} onChange={event=>updateRole(event.target.value)}/>{fieldStatus('role_title')}</label></div>
    <label className="field">卡牌显示名（可选）<input maxLength={32} placeholder="例如：大厂算法岗、银行基层、投行做债" value={form.card_display_name??''} onChange={event=>update({card_display_name:event.target.value})}/><small>公司、原始岗位与卡名分别保存；改玩法类型不改岗位名称。</small></label>
    <div className="form-grid"><label className="field">所在行业<select aria-label="所在行业" value={form.industry??''} onChange={event=>update({industry:event.target.value})}><option value="" disabled>请选择并确认</option>{[['internet','互联网'],['manufacturing','制造 / 硬件'],['finance','金融'],['consulting','咨询'],['gaming','游戏'],['public_service','公共服务'],['healthcare','医疗健康'],['education','教育'],['other','其他行业']].map(([value,label])=><option value={value} key={value}>{label}</option>)}</select>{fieldStatus('industry')}</label><label className="field">岗位类别<select aria-label="岗位类别" value={form.role_family??''} onChange={event=>update({role_family:event.target.value})}><option value="" disabled>请选择并确认</option>{[['algorithm','算法'],['development','软件开发'],['general_rd','研发 / 工程'],['sales','销售'],['hr','招聘 / 人事'],['testing','测试'],['management','管理'],['product','产品'],['finance','财务'],['administration','行政'],['general','综合业务']].map(([value,label])=><option value={value} key={value}>{label}</option>)}</select>{fieldStatus('role_family')}</label><label className="field">公司性质<select aria-label="公司性质" value={form.ownership??''} onChange={event=>update({ownership:event.target.value})}><option value="" disabled>请选择并确认</option><option value="private">民营企业</option><option value="foreign_owned">外资企业</option><option value="state_owned">国有企业</option><option value="central_state_owned">中央企业</option></select>{fieldStatus('ownership')}</label><label className="field">公司阶段<select aria-label="公司阶段" value={form.company_stage??''} onChange={event=>update({company_stage:event.target.value})}><option value="" disabled>请选择并确认</option><option value="established">成熟企业</option><option value="startup">初创企业</option></select>{fieldStatus('company_stage')}</label></div>
    <button type="button" className="text-btn" onClick={()=>change(useStandardConditions(draft))}>未填写的工作条件采用常规设置</button>
    <label className="field">玩法类型<select aria-label="玩法类型" value={form.selected_template_id??''} onChange={event=>update({selected_template_id:event.target.value||undefined})}><option value="">等待确认推荐类型</option>{rules.offer_templates.map(value=><option key={value.id} value={value.id}>{value.name} — {value.main_effect}</option>)}</select>{fieldStatus('selected_template_id')}</label>
    {!draft.fields.selected_template_id.confirmed&&<div className="helper" role="status">{draft.previousTemplateId&&<p>岗位条件已变化，原类型「{templateById[draft.previousTemplateId]?.name}」需要重新确认。</p>}当前推荐：{templateById[recommendation]?.name}。<button type="button" className="text-btn" onClick={()=>update({selected_template_id:recommendation})}>确认推荐玩法</button></div>}
    <div className="section-heading forge-section-divider"><span>02</span><h2>在哪工作，拿多少薪酬</h2></div>
    <div className="form-grid"><label className="field">工作城市（可选）<input aria-label="工作城市（可选）" value={form.city??''} onChange={event=>update({city:event.target.value})}/>{fieldStatus('city')}</label><label className="field">城市生活成本<select aria-label="城市生活成本" value={form.city_cost_level??''} onChange={event=>update({city_cost_level:event.target.value as OfferProfile['city_cost_level']})}><option value="" disabled>请选择并确认</option>{CITY_COST_OPTIONS.map(value=><option key={value.value} value={value.value}>{value.label}</option>)}</select>{fieldStatus('city_cost_level')}</label></div>
    <div className="forge-city-summary" data-testid="forge-city-summary"><p>{cityDescription}{tuning&&<strong>当前{tuning.citySource==='auto'?'自动匹配':'手动选择'}：{tuning.cityLevel==='high'?'高生活成本':tuning.cityLevel==='low'?'低生活成本':'生活成本适中'}。</strong>}</p></div>
    <div className="form-grid"><label className="field">工作性质<select aria-label="工作性质" value={form.work_nature??''} onChange={event=>update({work_nature:event.target.value as OfferProfile['work_nature']})}><option value="" disabled>请选择并确认</option>{WORK_NATURE_OPTIONS.map(value=><option key={value.value} value={value.value}>{value.label}</option>)}</select><small>{natureDescription}</small>{fieldStatus('work_nature')}</label><label className="field">工作节奏<select aria-label="工作节奏" value={form.work_schedule??''} onChange={event=>update({work_schedule:event.target.value as OfferProfile['work_schedule']})}><option value="" disabled>请选择并确认</option>{WORK_SCHEDULE_OPTIONS.map(value=><option key={value.value} value={value.value}>{value.label}</option>)}</select><small>{scheduleDescription}</small>{fieldStatus('work_schedule')}</label></div>
    <div className="form-grid">{salaryFields.slice(0,2).map(([key,label,unit])=><label className="field" key={key}>{label}<div className="input-unit"><input aria-label={label} type="number" min="1" value={form[key]??''} onChange={event=>update({[key]:event.target.value===''?undefined:Number(event.target.value)})}/><span>{unit}</span></div>{fieldStatus(key)}</label>)}</div>
    <details className="paste-panel"><summary>其他收入（奖金、权益、补贴、签字费）</summary><div className="form-grid">{salaryFields.slice(2).map(([key,label,unit])=><label className="field" key={key}>{label}<div className="input-unit"><input aria-label={label} type="number" min="0" value={form[key]??''} onChange={event=>update({[key]:event.target.value===''?undefined:Number(event.target.value)})}/><span>{unit}</span></div>{fieldStatus(key)}</label>)}</div></details>
    <button type="button" className="btn subtle" onClick={()=>change(confirmZeroIncome(draft))}>确认未填写的附加收入均为零</button><button type="button" className="text-btn" onClick={()=>change(confirmDraftFields(draft))}>确认已填写 / 提取的字段</button>
    <p className="helper">{missing.length?`仍有 ${missing.length} 项待填写或确认。`:'薪酬与工作资料已确认。'}未知金额不会按零计算。</p>
    <div className="forge-package"><span>本次计价年包<small>一次性签字费不计入</small></span><strong>{preview?money(preview.annualPackage):'待确认'}<small> / 年</small></strong></div>
    <div className="section-heading forge-section-divider"><span>03</span><h2>让角色有自己的口吻</h2></div>
    <label className="field">启用一项已确认条款<select aria-label="启用一项已确认条款" value={draft.benefitConfirmed?benefit:'__unset'} onChange={event=>chooseBenefit(event.target.value)}><option value="__unset" disabled>请选择并确认</option><option value="">明确不启用条款</option>{rules.benefits.map(value=><option key={value.id} value={value.id}>{value.name} — {value.text}</option>)}</select></label>
    <div className="form-grid"><label className="field">角色口吻<select aria-label="角色口吻" value={draft.preferences.tone} onChange={event=>changePreference({tone:event.target.value as GenerationPreferences['tone']})}><option value="confident">自信直接</option><option value="calm">沉稳克制</option><option value="witty">轻松吐槽</option></select></label><label className="field">本地立绘<select aria-label="本地立绘" value={draft.preferences.appearance} onChange={event=>changePreference({appearance:event.target.value as GenerationPreferences['appearance']})}><option value="career">随职业的标准立绘</option><option value="formal">商务立绘</option><option value="casual">休闲立绘</option></select></label></div><p className="helper">本地口吻与立绘立即可用，收藏后带入对局。{capabilities.imageProvider?'你也可以在保存后申请个性插画，当前偏好会一起发送。':'当前未接通个性绘图服务，以上为随包立绘选择。'}</p>
    <div className="forge-save-panel">{target&&<label className="field">保存方式<select aria-label="保存方式" value={intent} onChange={event=>{setIntent(event.target.value as SaveIntent);setConfirmedRevision(null);operation.current=null}}><option value="revise">修订这张卡 · 保留卡 ID</option><option value="copy">另存副本 · 新卡 ID</option></select><small>原卡：{target.name} · 定义第 {target.definitionRevision??1} 版。进行中的对局不受修订影响。</small></label>}
     <label className="confirmation"><input type="checkbox" aria-label="确认本版资料和公开卡面" checked={confirmed} onChange={event=>setConfirmedRevision(event.target.checked?draft.revision:null)}/><span>我已核对本版资料与条款，愿意在对局中公开公司名和卡牌属性。</span></label>
     <button type="submit" className="btn gold full" disabled={!confirmed||!preview||busy||!!savedCurrent&&intent!=='copy'}><Icon name="spark"/>{busy?'正在保存本版…':savedCurrent&&intent!=='copy'?'已收入收藏':intent==='revise'?'修订这张卡':intent==='copy'?'另存副本':'收入收藏'}</button>
     <p className="forge-save-hint">{savedCurrent?`${savedCurrent.name} · 定义第 ${savedCurrent.definitionRevision??1} 版已保存`:'每次修改都会取消旧确认。网络失败重试会沿用同一次保存，不重复建卡。'}</p>
    </div>
   </fieldset>
  </form><aside className="creation-preview"><div className="forge-card-panel"><div className="preview-label"><span className="live-dot"/>当前草稿预览<span className="forge-draft-tag">{savedCurrent?'已收藏':`草稿 ${draft.revision}`}</span></div><div className="forge-card-stage">{preview?<OfferCard offer={preview}/>:<div className="forge-empty-card"><Icon name="cards" size={48}/><strong>资料确认后，角色登场</strong><p>未知金额保持未知，<br/>不会填入示例年包。</p></div>}</div>
   <div className="flavor-quote">“{preview?.persona?.quote||'确认资料后，这里会出现你的角色台词。'}”</div><button type="button" className="text-btn" disabled={!preview} onClick={()=>changePreference({variation:draft.preferences.variation+1})}><Icon name="replay"/>换一组角色台词</button>
   {preview?.persona&&<details><summary>预览事件台词</summary><dl>{Object.entries(preview.persona.lines).map(([event,line])=><div key={event}><dt>{{summon:'出场',disrupt:'成功拆台',counterFail:'反制失败',return:'收回',victory:'获胜',defeat:'战败'}[event]}</dt><dd>{line}</dd></div>)}</dl><p className="helper">只有对应事件真实发生时才播放，台词不改变规则。</p></details>}
   {savedCurrent&&<div className="saved-actions"><div className="success-label"><Icon name="check"/>已收入收藏 · 本地职业插画</div><button type="button" className="btn gold full" onClick={onBuild}>带它试一局 <Icon name="arrow"/></button><button type="button" className="btn subtle full" onClick={()=>setShareOffer(savedCurrent)}><Icon name="download"/>保存晒卡图</button>{capabilities.imageProvider&&<button type="button" className="btn subtle full" disabled={['queued','running'].includes(job?.state)} onClick={()=>void generate('image')}>生成个性插画</button>}{capabilities.textProvider&&<button type="button" className="btn subtle full" disabled={['queued','running'].includes(job?.state)} onClick={()=>void generate('text')}>创作新的角色文案</button>}</div>}
   {job&&<div role="status" className="generation-error"><p>创作任务 · 定义第 {job.definitionRevision??1} 版 / 草稿 {job.draftRevision??1}：{job.state==='ready'?'保存完成':job.state==='stale'?'旧版本结果已废弃':job.state==='failed'?'生成失败':job.phase||'等待开始'}</p>{job.draftRevision!==draft.revision&&<p>此任务属于旧草稿，不会覆盖当前数值预览。</p>}{job.error&&<p>{job.error}</p>}{job.state==='failed'&&job.definitionRevision===target?.definitionRevision&&<button type="button" className="text-btn" onClick={async()=>{try{const result=await api(`/api/generation/jobs/${job.id}/retry`,{});setJob(result.job)}catch(error){notify(readableError(error))}}}>重试这个版本的任务</button>}</div>}
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
        </section>  </aside></div>
  {shareOffer&&<ShareDialog source={{offer:shareOffer}} onClose={()=>setShareOffer(null)} notify={notify}/> }
  {conflict&&<Modal title="这张卡有更新的版本" onClose={()=>setConflict(null)}><p>已保存「{conflict.name}」定义第 {conflict.definitionRevision??1} 版。你的草稿仍保留，没有覆盖别的页面的修改。</p><button type="button" className="btn gold" onClick={()=>{change(draftFromOffer(conflict,draft.revision+1));setTarget(conflict);setIntent('revise');setSaved(null);setConflict(null)}}>载入已保存的最新版本</button><button type="button" className="btn subtle" onClick={()=>{setTarget(conflict);setIntent('copy');change({...draft,revision:draft.revision+1});setConflict(null)}}>把我的修改另存副本</button></Modal>}
  {mergeCandidate&&<Modal title="确认合并字段差异" onClose={()=>setMergeCandidate(null)}><p>只有下列已提取字段会覆盖当前值。其他字段保留；条款与玩法类型将重新确认。</p><div style={{maxHeight:'50vh',overflow:'auto'}}>{mergeDiff(draft,mergeCandidate).map(row=><p key={row.key}><strong>{row.label}</strong>：{String(row.before??'未填写')} → {String(row.after)}</p>)}</div><button type="button" className="btn gold" onClick={()=>{change(mergeParsedDraft(draft,mergeCandidate));setMergeCandidate(null)}}>确认合并这些字段</button><button type="button" className="btn subtle" onClick={()=>setMergeCandidate(null)}>取消合并</button></Modal>}
 </div>;
}
