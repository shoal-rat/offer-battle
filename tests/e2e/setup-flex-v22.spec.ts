import {test,expect} from '@playwright/test';
import {getStarterDecks} from '../../src/game/starterDecks';
import {createMatch,getView,defaultLoadout} from '../../src/game/index';

const preset=getStarterDecks(false).find(deck=>deck.primaryId==='H03'&&deck.secondaryId==='S03')!;
test('applying a preset keeps its three response cards through real full setup',async({page})=>{
 await page.goto('/');await page.locator('.hotspot-play').click();const picker=page.getByRole('region',{name:'预设卡组'});
 await page.getByLabel('选择预设卡组').selectOption(preset.id);await picker.getByRole('button',{name:'应用这套预设'}).click();
 await page.getByLabel('开局准备',{exact:true}).selectOption('full');await page.getByRole('button',{name:'就用这套，开始对局'}).click();
 const setup=page.getByRole('dialog',{name:'看清对手，再留三张底牌。'});await expect(setup).toBeVisible();
 expect(await setup.locator('.flex-selection .common-card.selected').evaluateAll(cards=>cards.map(card=>card.getAttribute('data-card-id')).sort())).toEqual([...preset.loadout.flexDeck].sort());
 const sent=page.waitForRequest(request=>request.method()==='POST'&&request.url().endsWith('/command')&&request.postDataJSON()?.type==='SELECT_FLEX');
 await setup.getByRole('button',{name:'确认应对牌 3/3',exact:true}).click();const submitted=(await sent).postDataJSON();expect(submitted.payload?.flexIds??submitted.flexIds).toEqual(preset.loadout.flexDeck);
 await expect(page.getByRole('dialog',{name:'起手不错，还能再挑。'})).toBeVisible();
});

for(const legacy of [false,true])test(`setup uses ${legacy?'current preset when an older server omits selection':'authoritative room selection before a different current preset'}`,async({page})=>{
 const current={...structuredClone(preset.loadout),playerId:'p1'},authoritative={...structuredClone(current),flexDeck:['F02','F03','F05']};
 const state=createMatch([authoritative,defaultLoadout('p2','Opponent')],840,{matchId:'flex-selection-compat'}),view=getView(state,'p1');
 if(legacy)for(const player of view.players)delete player.flexSelection;
 const snapshot={room:{id:'flex-selection-room',code:'FLEX22',mode:'friend',status:'playing',deadline:null,players:[{id:'p1',name:'You',ready:true},{id:'p2',name:'Opponent',ready:true}]},view,playerId:'p1'};
 await page.addInitScript(loadout=>{localStorage.setItem('offer-session','flex-test');localStorage.setItem('offer-active-room','flex-selection-room');localStorage.setItem('offer-loadout',JSON.stringify(loadout));localStorage.setItem('offer-sound','0')},current);
 await page.route('**/api/session',route=>route.fulfill({json:{token:'flex-test',profile:{id:'p1',nickname:'You',offers:[]}}}));
 await page.route('**/api/rooms/flex-selection-room',route=>route.fulfill({json:snapshot}));await page.routeWebSocket('**/ws?*',socket=>socket.send(JSON.stringify({type:'state',...snapshot})));
 await page.goto('/');const setup=page.getByRole('dialog',{name:'看清对手，再留三张底牌。'});await expect(setup).toBeVisible();
 expect(await setup.locator('.flex-selection .common-card.selected').evaluateAll(cards=>cards.map(card=>card.getAttribute('data-card-id')).sort())).toEqual([...(legacy?current.flexDeck:authoritative.flexDeck)].sort());
});
