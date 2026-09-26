import {test,expect,type Page} from '@playwright/test';
import type {OfferDefinition} from '../../src/game/types';

async function openForge(page:Page){
  const requests:string[]=[],errors:string[]=[];
  page.on('request',request=>{if(new URL(request.url()).pathname.includes('/api/'))requests.push(request.url())});
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',route=>route.abort());
  await page.goto('./');
  await page.getByRole('button',{name:'录入我的 Offer',exact:true}).click();
  await expect(page.getByRole('region',{name:'实时属性'})).toBeVisible();
  return {requests,errors};
}
async function stats(page:Page,cost:number,attack:number,health:number){
  await expect(page.getByTestId('forge-cost')).toHaveText(String(cost));
  await expect(page.getByTestId('forge-attack')).toHaveText(String(attack));
  await expect(page.getByTestId('forge-health')).toHaveText(String(health));
}
async function save(page:Page){
  await page.getByRole('checkbox').check();
  await page.getByRole('button',{name:'生成我的角色卡',exact:true}).click();
  await expect(page.getByText('已收入收藏 · 本地职业插画',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'已收入收藏',exact:true})).toBeDisabled();
}
async function offers(page:Page):Promise<OfferDefinition[]>{
  return page.evaluate(()=>JSON.parse(localStorage.getItem('offer-local-profile-v1')!).offers);
}

test('offer forge: real local compiler explains salary, city, industry and work conditions, then persists exact attributes',async({page},testInfo)=>{
  const network=await openForge(page);
  await page.getByPlaceholder('例如：大厂算法岗、银行基层、投行做债').fill('制造业研发');
  await page.getByLabel('玩法类型').selectOption('T00');
  await page.getByLabel('所在行业',{exact:true}).selectOption('other');
  await stats(page,5,5,6); // T00 starts with +1 health.
  await page.getByLabel('工作城市（可选）',{exact:true}).fill('北京市');
  await stats(page,5,6,5);
  await expect(page.getByTestId('forge-city-summary')).toContainText('自动匹配：高生活成本');
  await page.getByLabel('工作城市（可选）',{exact:true}).fill('成都');
  await stats(page,5,5,6);
  await page.getByLabel('城市生活成本',{exact:true}).selectOption('low');
  await stats(page,5,4,7);
  await expect(page.getByTestId('forge-city-summary')).toContainText('手动选择：低生活成本');
  await page.getByLabel('工作性质',{exact:true}).selectOption('permanent');
  await stats(page,5,3,8);
  await page.getByLabel('工作节奏',{exact:true}).selectOption('intensive');
  await stats(page,6,5,8);
  await page.getByLabel('所在行业',{exact:true}).selectOption('internet');
  await stats(page,6,6,7);
  await expect(page.locator('[data-contribution="city"]')).toContainText('排面 −1 / 底气 +1');
  await expect(page.locator('[data-contribution="schedule"]')).toContainText('费用 +1');
  await expect(page.getByTestId('forge-cost-adjustment')).toHaveText('+1 → 6 小时');
  await page.getByLabel('固定月薪').fill('20000');
  await page.getByLabel('保证薪数').fill('12');
  await page.getByLabel('年度目标奖金').fill('0');
  await stats(page,4,4,5);
  await page.getByLabel('启用一项已确认条款').selectOption('B01');
  await stats(page,4,4,4);
  await expect(page.getByTestId('forge-benefit-cost')).toHaveText('条款代价：底气 −1');
  await save(page);
  const first=(await offers(page)).at(-1)!;
  expect(first).toMatchObject({name:'制造业研发',originalTime:4,baseAttack:4,baseHealth:4,annualPackage:240000,profile:{city:'成都',city_cost_level:'low',work_nature:'permanent',work_schedule:'intensive'},tuning:{version:'2.1.0'}});
  // Each new rule input must invalidate the old saved card and its confirmation.
  for(const [field,value] of [['城市生活成本','medium'],['工作性质','standard'],['工作节奏','standard']] as const){
    await page.getByLabel(field,{exact:true}).selectOption(value);
    await expect(page.getByRole('checkbox')).not.toBeChecked();
    await expect(page.getByText('已收入收藏 · 本地职业插画',{exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'生成我的角色卡',exact:true})).toBeDisabled();
    await save(page);
  }
  const last=(await offers(page)).at(-1)!;
  expect(last.profile).toMatchObject({city_cost_level:'medium',work_nature:'standard',work_schedule:'standard'});
  expect(last).toMatchObject({originalTime:3,baseAttack:4,baseHealth:2});
  await page.getByLabel('公司显示名',{exact:true}).fill('另一家公司');
  await stats(page,3,4,2);
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:testInfo.outputPath('offer-forge-desktop.png'),fullPage:true});
  expect(network.requests).toEqual([]);expect(network.errors).toEqual([]);
});

test('offer forge: invalid input shows an actionable preview error and blocks saving until corrected',async({page})=>{
  const network=await openForge(page);
  await page.getByLabel('固定月薪').fill('0');
  await expect(page.getByRole('alert')).toContainText('月薪与保证月数必须大于0');
  await expect(page.getByTestId('forge-cost')).toHaveText('—');
  await page.getByRole('checkbox').check();
  await expect(page.getByRole('button',{name:'生成我的角色卡',exact:true})).toBeDisabled();
  await expect(page.locator('.forge-empty-card')).toBeVisible();
  await page.getByLabel('固定月薪').fill('25000');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await page.getByLabel('保证薪数').fill('37');
  await expect(page.getByRole('alert')).toContainText('保证薪数必须在 1—36 个月之间');
  await page.getByLabel('保证薪数').fill('16');
  await save(page);
  // Importing text must invalidate an existing saved card too.
  await page.getByText('粘贴 Offer 文本 / 添加参考图',{exact:false}).click();
  await page.getByLabel('Offer 原文',{exact:true}).fill('公司：星海科技\n岗位：算法工程师\n月薪：30k，14 薪');
  await page.getByRole('button',{name:'提取明确字段',exact:true}).click();
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await expect(page.getByText('已收入收藏 · 本地职业插画',{exact:true})).toHaveCount(0);
  await expect(page.getByLabel('固定月薪')).toHaveValue('30000');
  await expect(page.getByLabel('保证薪数')).toHaveValue('14');
  expect(network.requests).toEqual([]);expect(network.errors).toEqual([]);
});

test('offer forge 390px: all contribution rows stay readable and live attributes remain visible while editing',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});
  const network=await openForge(page);
  await page.getByLabel('工作城市（可选）',{exact:true}).fill('上海');
  await page.getByLabel('工作性质',{exact:true}).selectOption('contract');
  await page.getByLabel('工作节奏',{exact:true}).selectOption('intensive');
  await page.getByRole('button',{name:'查看依据',exact:false}).click();
  const receipt=page.getByRole('region',{name:'生成依据',exact:true});
  await expect(receipt).toBeVisible();
  await expect(receipt.locator('[data-contribution]')).toHaveCount(6);
  await receipt.locator('[data-contribution="schedule"]').scrollIntoViewIfNeeded();
  await expect(page.getByRole('region',{name:'实时属性'})).toBeInViewport();
  for(const selector of ['.forge-live-stats','.forge-receipt','[data-contribution="city"]','[data-contribution="nature"]','[data-contribution="schedule"]','.forge-final-line']){
    const bounds=await page.locator(selector).boundingBox();
    expect(bounds).not.toBeNull();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(390);
  }
  await page.locator('[data-contribution="city"]').evaluate(element=>window.scrollTo(0,window.scrollY+element.getBoundingClientRect().top-155));
  await page.screenshot({path:testInfo.outputPath('offer-forge-mobile-rules.png')});
  await page.getByRole('button',{name:'编辑信息',exact:true}).click();
  await page.getByLabel('工作节奏',{exact:true}).selectOption('flexible');
  await page.getByLabel('工作节奏',{exact:true}).scrollIntoViewIfNeeded();
  await expect(page.getByRole('region',{name:'实时属性'})).toBeInViewport();
  await page.screenshot({path:testInfo.outputPath('offer-forge-mobile-editing.png')});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
  expect(network.requests).toEqual([]);expect(network.errors).toEqual([]);
});
