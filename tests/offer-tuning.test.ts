import test from 'node:test';
import assert from 'node:assert/strict';
import {compileOffer,compileOfferForVersion,exampleOffersForVersion} from '../src/game/offers';
import {templateById} from '../src/game/catalog';
import type {OfferProfile} from '../src/game/types';

const profile:OfferProfile={company_display_name:'造卡测试企业',industry:'other',ownership:'private',company_stage:'established',role_family:'general',role_title:'业务岗',city:'',monthly_fixed_cny:25000,guaranteed_months:12,annual_fixed_allowance_cny:0,annual_target_bonus_cny:0,annual_equity_cny:0,one_time_signing_cny:0,confirmed_benefits:[],selected_template_id:'T00'};
const stats=(p:OfferProfile)=>{const o=compileOffer(p);return [o.originalTime,o.baseAttack,o.baseHealth]};

test('同年包同类型：城市、行业、公司与工作性质分别改变属性取舍',()=>{
  assert.deepEqual(stats(profile),[4,4,5]);
  assert.deepEqual(stats({...profile,city:'上海市'}),[4,5,4]);
  assert.deepEqual(stats({...profile,city:'自定义城市',city_cost_level:'low'}),[4,3,6]);
  assert.deepEqual(stats({...profile,industry:'manufacturing'}),[4,3,6]);
  assert.deepEqual(stats({...profile,industry:'finance'}),[4,5,4]);
  assert.deepEqual(stats({...profile,ownership:'central_state_owned'}),[4,3,6]);
  assert.deepEqual(stats({...profile,company_stage:'startup'}),[4,5,4]);
  assert.deepEqual(stats({...profile,work_nature:'permanent'}),[4,3,6]);
  assert.deepEqual(stats({...profile,work_nature:'contract'}),[4,5,4]);
  assert.deepEqual(stats({...profile,work_nature:'dispatch'}),[4,5,4]);
});
test('工作节奏和实习调整费用，基础属性随实际费用同步变化',()=>{
  assert.deepEqual(stats({...profile,work_schedule:'intensive'}),[5,6,5]);
  assert.deepEqual(stats({...profile,work_schedule:'field'}),[5,4,7]);
  assert.deepEqual(stats({...profile,work_schedule:'flexible'}),[3,2,5]);
  assert.deepEqual(stats({...profile,work_nature:'internship'}),[3,3,4]);
  assert.deepEqual(stats({...profile,work_nature:'internship',work_schedule:'intensive'}),[4,5,4]);
  const low=compileOffer({...profile,monthly_fixed_cny:5000,work_schedule:'flexible',work_nature:'internship'});
  assert.equal(low.originalTime,2);assert.equal(low.tuning!.costAdjustment,0);
  const high=compileOffer({...profile,monthly_fixed_cny:100000,work_schedule:'intensive'});
  assert.equal(high.originalTime,7);assert.equal(high.tuning!.costAdjustment,0);
});
test('城市自动规则有边界，手选优先，自由文字不任意猜测强度',()=>{
  for(const city of ['北京','上海','深圳市',' 广州 ','杭州','香港'])assert.equal(compileOffer({...profile,city}).tuning!.cityLevel,'high');
  for(const city of ['', '未收录新城市','纽约','北京某某公司'])assert.equal(compileOffer({...profile,city}).tuning!.cityLevel,'medium');
  const manual=compileOffer({...profile,city:'上海',city_cost_level:'low'});
  assert.equal(manual.tuning!.citySource,'manual');assert.equal(manual.tuning!.cityLevel,'low');
  assert.ok(!JSON.stringify(manual.tuning).includes('上海'));
  assert.deepEqual(stats({...profile,industry:'a-new-industry',role_family:'a-new-role'}),stats(profile));
});
test('所有类型、费用和倾向守恒，福利代价与一血下限不会创造额外属性',()=>{
  for(const selected_template_id of Object.keys(templateById))for(const monthly_fixed_cny of [5000,15000,25000,40000,60000,100000])for(const direction of [-1,0,1])for(const benefit of [false,true]){
    const p:OfferProfile={...profile,selected_template_id,monthly_fixed_cny,confirmed_benefits:['B01'],city_cost_level:direction<0?'low':direction>0?'high':'medium',industry:direction<0?'manufacturing':direction>0?'internet':'other',ownership:direction<0?'state_owned':'private',company_stage:direction>0?'startup':'established',work_nature:direction<0?'permanent':direction>0?'contract':'standard'};
    const o=compileOffer(p,benefit?'B01':null),t=templateById[selected_template_id],baseline=Math.max(1,o.originalTime+t.attack_delta)+Math.max(1,o.originalTime+t.health_delta);
    assert.equal(o.baseAttack+o.baseHealth,baseline-(benefit?1:0));
    assert.ok(Number.isInteger(o.baseAttack)&&o.baseAttack>=1);assert.ok(Number.isInteger(o.baseHealth)&&o.baseHealth>=1);
    assert.ok(Math.abs(o.tuning!.appliedTilt)<=2);
    assert.equal(o.tuning!.beforeBenefit.attack-o.tuning!.benefitPenalty.attack,o.baseAttack);
    assert.equal(o.tuning!.beforeBenefit.health-o.tuning!.benefitPenalty.health,o.baseHealth);
  }
});
test('未确认或恶意字段被拒绝，客户端伪造属性与版本不会影响编译',()=>{
  for(const key of ['city_cost_level','work_nature','work_schedule'])for(const value of ['unsupported','__proto__','',null,7])assert.throws(()=>compileOffer({...profile,[key]:value} as OfferProfile));
  const forged={...profile,baseAttack:999,baseHealth:999,originalTime:0,rulesVersion:'2.0.0',tuning:{appliedTilt:999}};
  assert.deepEqual(stats(forged),stats(profile));assert.equal(compileOffer(forged).rulesVersion,'2.1.0');
  assert.throws(()=>compileOfferForVersion(profile,null,undefined,'unknown' as any));
  for(const guaranteed_months of [0.5,37])assert.throws(()=>compileOffer({...profile,guaranteed_months}),/1—36/);
  assert.throws(()=>compileOffer({...profile,annual_equity_cny:1e11}),/有效范围/);
});
test('改名、股权描述和签字费不绕过费用，真实年包跨档后增加属性预算',()=>{
  const a=compileOffer(profile),b=compileOffer({...profile,company_display_name:'新企业',card_display_name:'精确岗位',one_time_signing_cny:1e8});
  assert.deepEqual([a.originalTime,a.baseAttack,a.baseHealth],[b.originalTime,b.baseAttack,b.baseHealth]);
  assert.equal(a.definitionHash,compileOffer({...profile,company_display_name:'新企业',card_display_name:'精确岗位'}).definitionHash);
  const bonus=compileOffer({...profile,annual_target_bonus_cny:100000});assert.equal(bonus.originalTime,5);
  const equity=compileOffer({...profile,annual_equity_cny:100000});assert.deepEqual([bonus.originalTime,bonus.baseAttack,bonus.baseHealth],[equity.originalTime,equity.baseAttack,equity.baseHealth]);
});
test('原版编译器完整保留旧身材与字段结构，新规则独立标识',()=>{
  assert.deepEqual(exampleOffersForVersion('2.0.0').slice(0,6).map(o=>[o.originalTime,o.baseAttack,o.baseHealth]),[[5,7,4],[3,2,4],[4,3,3],[4,3,5],[6,6,5],[5,6,3]]);
  const old=compileOfferForVersion({...profile,city:'上海',industry:'internet'},null,'legacy','2.0.0');
  assert.equal(old.rulesVersion,'2.0.0');assert.ok(!Object.hasOwn(old,'tuning'));assert.deepEqual([old.originalTime,old.baseAttack,old.baseHealth],[4,4,5]);
  assert.equal(compileOffer(profile).rulesVersion,'2.1.0');
});
