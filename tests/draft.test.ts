import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyDraft,editDraft,parseOfferText,mergeDiff,mergeParsedDraft,draftProfile,confirmDraftFields,confirmZeroIncome,useStandardConditions,recommendedTemplate,exampleDraft,draftFromExtracted} from '../src/game/draft';
import {exampleOffers,compileOffer,defaultLoadout,createMatch,applyCommand,getView} from '../src/game/index';
import {saveOffer,deleteOffer,restoreOffer,OfferSaveError,type OfferLibrary} from '../src/game/draft-save';
import {currentLoadout,historicalLoadout} from '../src/game/offer-compat';
import {createPersona,PersonaSpeechBudget} from '../src/game/draft-persona';
const profile=exampleOffers[0].profile!;
const input=(changes:any={})=>({profile,benefitId:null,draftRevision:1,idempotencyKey:'save-operation-001',characterSeed:'0123abcd',preferences:{tone:'witty',appearance:'formal',variation:1},...changes});
function complete(parsed=emptyDraft()) {let draft=confirmDraftFields(useStandardConditions(confirmZeroIncome(parsed)));draft=editDraft(draft,{selected_template_id:recommendedTemplate(draft)});return {...draft,benefitConfirmed:true};}

test('Q01/Q07: a private draft has no invented salary and clearing a number is unknown rather than zero',()=>{
 const draft=emptyDraft();for(const key of ['monthly_fixed_cny','guaranteed_months','annual_target_bonus_cny'] as const)assert.deepEqual(draft.fields[key],{value:null,source:'unset',confirmed:false});assert.throws(()=>draftProfile(draft),/待确认/);
 const filled=editDraft(draft,{annual_target_bonus_cny:0});assert.equal(filled.fields.annual_target_bonus_cny.confirmed,true);const cleared=editDraft(filled,{annual_target_bonus_cny:undefined});assert.deepEqual(cleared.fields.annual_target_bonus_cny,{value:null,source:'unset',confirmed:false});assert.ok(cleared.revision>filled.revision);
});
test('Q02/Q03: replacement parsing never inherits a prior salary, bonus, template or benefit; annual totals do not imply monthly salary',()=>{
 const old=exampleDraft(profile,1);old.benefitId='B01';
 const parsed=parseOfferText('公司：新公司\n岗位：销售顾问\n月薪：20k，13薪',old.revision+1);
 assert.equal(parsed.fields.monthly_fixed_cny.value,20000);assert.equal(parsed.fields.guaranteed_months.value,13);assert.equal(parsed.fields.role_family.value,'sales');assert.equal(parsed.fields.annual_target_bonus_cny.value,null);assert.equal(parsed.fields.ownership.value,null);assert.equal(parsed.fields.selected_template_id.value,null);assert.equal(parsed.benefitId,null);assert.equal(parsed.fields.role_title.confirmed,false);
 const annual=parseOfferText('公司：另一家\n岗位：分析师\n年包：60万',3);assert.equal(annual.reportedAnnualPackage,600000);assert.equal(annual.fields.monthly_fixed_cny.value,null);assert.equal(annual.fields.guaranteed_months.value,null);assert.throws(()=>draftProfile(complete(annual)),/固定月薪/);
 assert.equal(parseOfferText('岗位：测试工程师',4).fields.role_family.value,'testing');
 const zero=parseOfferText('公司：有零奖金\n岗位：销售\n月薪：15000，12薪\n没有奖金',4);assert.equal(zero.fields.annual_target_bonus_cny.value,0);assert.equal(zero.fields.annual_target_bonus_cny.confirmed,false);
});
test('Q04/Q06: explicit merge exposes differences and changing role invalidates the old template confirmation',()=>{
 const old=exampleDraft({...profile,selected_template_id:'T01'},1),parsed=parseOfferText('岗位：销售顾问\n月薪：18k',2);
 assert.ok(mergeDiff(old,parsed).some(row=>row.key==='role_title'));assert.equal(old.fields.role_title.value,profile.role_title);
 const merged=mergeParsedDraft(old,parsed);assert.equal(merged.fields.annual_target_bonus_cny.value,profile.annual_target_bonus_cny);assert.equal(merged.fields.selected_template_id.confirmed,false);assert.equal(recommendedTemplate(merged),'T06');assert.equal(merged.benefitConfirmed,false);
 const changed=editDraft(old,{role_title:'销售顾问',role_family:'sales'});assert.equal(changed.previousTemplateId,'T01');assert.equal(changed.fields.selected_template_id.confirmed,false);
});
test('confirmed fields compile only after deliberate zero-income, conditions, template and benefit choices',()=>{
 const parsed=parseOfferText('公司：示例\n岗位：销售顾问\n月薪：20k，13薪',1),draft=complete(parsed),p=draftProfile(draft),offer=compileOffer(p);
 assert.equal(offer.annualPackage,260000);assert.equal(p.role_title,'销售顾问');assert.equal(offer.templateId,'T06');assert.equal(draft.isExample,false);
 const extracted=draftFromExtracted({monthly_fixed_cny:9999,guaranteed_months:12,unknown:'discarded'},4);assert.equal(extracted.fields.monthly_fixed_cny.confirmed,false);assert.equal(extracted.fields.annual_target_bonus_cny.value,null);assert.equal((extracted.fields as any).unknown,undefined);
});
test('Q08/Q09: idempotency returns one entity; revisions keep IDs; copies allocate IDs; stale updates conflict',()=>{
 const library:OfferLibrary={offers:[]};let n=0;const options={newId:()=>`personal-${++n}`};
 const first=saveOffer(library,input(),options),duplicate=saveOffer(library,input(),options);assert.equal(n,1);assert.equal(library.offers.length,1);assert.deepEqual(duplicate.offer,first.offer);assert.equal(duplicate.duplicate,true);
 assert.throws(()=>saveOffer(library,input({draftRevision:2}),options),(error:unknown)=>error instanceof OfferSaveError&&error.code==='IDEMPOTENCY_CONFLICT');
 const revised=saveOffer(library,input({profile:{...profile,monthly_fixed_cny:17000},idempotencyKey:'save-operation-002',draftRevision:2,expectedDefinitionRevision:1}),{...options,targetId:first.offer.id});assert.equal(revised.offer.id,first.offer.id);assert.equal(revised.offer.definitionRevision,2);assert.equal(library.offers.length,1);
 assert.throws(()=>saveOffer(library,input({idempotencyKey:'save-operation-003',expectedDefinitionRevision:1}),{...options,targetId:first.offer.id}),(error:unknown)=>error instanceof OfferSaveError&&error.status===409);
 const copied=saveOffer(library,input({idempotencyKey:'save-operation-004',intent:'copy',sourceOfferId:first.offer.id}),options);assert.notEqual(copied.offer.id,first.offer.id);assert.equal(library.offers.length,2);assert.equal(copied.offer.definitionRevision,1);
 for(const key of ['__proto__','constructor'])assert.throws(()=>saveOffer(library,input({idempotencyKey:key}),options));
});
test('Q10: revised collection, generated persona and recycle bin do not mutate running matches or historical definitions',()=>{
 const library:OfferLibrary={offers:[],loadout:defaultLoadout('p1','玩家',5)},offer=saveOffer(library,input(),{newId:()=> 'personal-1'}).offer;
 library.loadout!.offers[0]=offer;const loadout=currentLoadout(library.loadout!),initial=createMatch([loadout,defaultLoadout('p2','对手',6)],14,{skipSetup:true}),frozen=structuredClone(initial);
 const historical=historicalLoadout(loadout);assert.deepEqual(historical,loadout);assert.equal(historical.offers[0].persona?.seed,'0123abcd');
 saveOffer(library,input({profile:{...profile,monthly_fixed_cny:10000},idempotencyKey:'save-operation-002',draftRevision:2,expectedDefinitionRevision:1}),{newId:()=> 'unused',targetId:offer.id});assert.equal(library.loadout!.offers[0].definitionRevision,2);assert.deepEqual(initial,frozen);
 const removed=deleteOffer(library,offer.id,100);assert.equal(removed.affectedLoadout,true);assert.equal(library.loadout,undefined);assert.equal(deleteOffer(library,offer.id,101).duplicate,true);assert.deepEqual(initial,frozen);
 const restored=restoreOffer(library,offer.id,102);assert.equal(restored.offer.definitionRevision,2);assert.equal(restoreOffer(library,offer.id,103).duplicate,true);
 deleteOffer(library,offer.id,104);assert.throws(()=>restoreOffer(library,offer.id,104+31*86400000),/30 天/);
 const finished=applyCommand(initial,'p1',{type:'CONCEDE'}).state;assert.equal(getView(finished,'p1').players[0].offerZone[0].definition.definitionRevision,1);
});
test('GEN02: identity and preferences persist, local persona varies by role and voice, speech is capped and deduplicated',()=>{
 const offer=saveOffer({offers:[]},input(),{newId:()=> 'speaker'}).offer;assert.equal(offer.artId,'/assets/offer-T02.webp');assert.equal(offer.persona?.preferences.tone,'witty');assert.match(offer.persona!.lines.summon,/算法/);
 const other=createPersona({...offer,templateId:'T06',role:'销售顾问'},{tone:'calm',appearance:'casual',variation:0},offer.persona!.seed);assert.notEqual(other.lines.summon,offer.persona!.lines.summon);
 const budget=new PersonaSpeechBudget();assert.ok(budget.line(offer,'summon','event1',1));assert.equal(budget.line(offer,'summon','event1',1),null);assert.ok(budget.line(offer,'disrupt','event2',1));assert.equal(budget.line(offer,'return','event3',1),null);assert.ok(budget.line(offer,'return','event4',2));assert.equal(budget.line(offer,'victory','event5',2,false),null);
});
