import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createMatch,
  applyCommand,
  defaultLoadout,
  compileOffer,
  exampleOffers,
  getView,
  unitStats,
  rankBand,
  stableHash,
  validateLoadout,
  handCost,
  offerCost,
  CARDS,
  cardById,
  education,
  chooseBotCommand,
} from "../src/game/index";
import type {
  MatchState,
  Command,
  Unit,
  OfferDefinition,
  HandCard,
  OfferProfile,
} from "../src/game/index";
const profile: OfferProfile = {
  company_display_name: "测试企业",
  ownership: "private",
  industry: "other",
  company_stage: "established",
  role_family: "general",
  role_title: "职员",
  city: "测试城",
  monthly_fixed_cny: 10000,
  guaranteed_months: 12,
  annual_fixed_allowance_cny: 0,
  annual_target_bonus_cny: 0,
  annual_equity_cny: 0,
  one_time_signing_cny: 0,
  confirmed_benefits: [],
};
function fresh(primary = "H10", secondary = "S00") {
  const a = defaultLoadout("a", "甲"),
    b = defaultLoadout("b", "乙");
  a.primaryId = primary;
  a.secondaryId = secondary;
  const s = createMatch([a, b], 1, { skipSetup: true });
  s.round = 6;
  s.players.forEach((p) => (p.timeRemaining = 8));
  return s;
}
function run(s: MatchState, c: Command, id = s.activePlayerId) {
  const r = applyCommand(s, id, c);
  assert.equal(r.error, undefined, JSON.stringify(c) + ": " + r.error);
  return r.state;
}
function inject(s: MatchState, id: string, owner = s.activePlayerId): string {
  const p = s.players.find((p) => p.id === owner)!;
  const cid = "test-" + id + "-" + s.nextId++;
  p.hand.push({
    id: cid,
    definitionId: id,
    kind: "card",
    taxes: [],
    knownTo: [],
  });
  return cid;
}
function offer(
  s: MatchState,
  templateId = "T00",
  cost = 2,
  benefitId: string | null = null,
  owner = s.activePlayerId,
): string {
  const p = s.players.find((p) => p.id === owner)!;
  const id = "test-offer-" + s.nextId++;
  const templateDelta: Record<string, [number, number]> = {
    T00: [0, 1],
    T01: [2, -1],
    T02: [-1, 2],
    T03: [-1, 0],
    T04: [-1, 1],
    T05: [-1, 0],
    T06: [1, -1],
    T07: [-1, 0],
    T08: [-1, 0],
    T09: [-1, 0],
    T10: [0, 0],
  };
  const [ad, hd] = templateDelta[templateId];
  let a = Math.max(1, cost + ad),
    h = Math.max(1, cost + hd);
  if (benefitId) {
    if (h > 1) h--;
    else a = Math.max(1, a - 1);
  }
  const definition: OfferDefinition = {
    ...exampleOffers[0],
    id,
    name: templateId,
    templateId,
    benefitId,
    originalTime: cost,
    baseAttack: a,
    baseHealth: h,
    tags: templateId === "T01" ? ["frontline"] : [],
  };
  p.offerZone.push({
    id,
    definition,
    ageStage: 0,
    everDeployed: false,
    status: "available",
  });
  return id;
}
function placed(
  s: MatchState,
  templateId = "T00",
  cost = 2,
  benefitId: string | null = null,
  owner = s.activePlayerId,
): [MatchState, Unit] {
  const id = offer(s, templateId, cost, benefitId, owner);
  const active = s.activePlayerId;
  s.activePlayerId = owner;
  s.players.find((p) => p.id === owner)!.timeRemaining = 8;
  s = run(
    s,
    { type: "DEPLOY_OFFER", offerId: id, benefitChoice: "health" },
    owner,
  );
  s.activePlayerId = active;
  s.players.forEach((p) => (p.timeRemaining = 8));
  return [s, s.players.find((p) => p.id === owner)!.board.at(-1)!];
}
function reject(s: MatchState, c: Command, id = s.activePlayerId) {
  const r = applyCommand(s, id, c);
  assert.ok(r.error);
  assert.strictEqual(r.state, s);
  assert.deepEqual(r.events, []);
}
for (const [salary, cost] of [
  [149999, 2],
  [150000, 3],
  [249999, 3],
  [250000, 4],
  [399999, 4],
  [400000, 5],
  [599999, 5],
  [600000, 6],
  [899999, 6],
  [900000, 7],
  [2000000, 7],
])
  test("薪资档位 " + salary, () => {
    const o = compileOffer({
      ...profile,
      monthly_fixed_cny: salary,
      guaranteed_months: 1,
    });
    assert.equal(o.originalTime, cost);
  });
test("薪酬构成与签字费分离，重画规则恒定", () => {
  const p = {
    ...profile,
    monthly_fixed_cny: 30000,
    guaranteed_months: 12,
    annual_target_bonus_cny: 80000,
    annual_equity_cny: 120000,
    one_time_signing_cny: 50000,
  };
  const o = compileOffer(p);
  assert.equal(o.annualPackage, 560000);
  assert.equal(o.signingBonus, 50000);
  assert.equal(o.definitionHash, compileOffer(p).definitionHash);
  assert.throws(() =>
    compileOffer({ ...p, annual_equity_cny: null } as unknown as OfferProfile),
  );
});
test("模板优先级和条款付费", () => {
  const p = {
    ...profile,
    industry: "internet",
    role_family: "algorithm",
    confirmed_benefits: ["B01"],
  };
  assert.equal(compileOffer(p).templateId, "T01");
  assert.deepEqual(
    [compileOffer(p, "B01").baseAttack, compileOffer(p, "B01").baseHealth],
    [3, 1],
  );
  assert.equal(compileOffer({ ...p, role_family: "hr" }).templateId, "T08");
  assert.throws(() => compileOffer(profile, "B01"));
});
test("全部六个示例数值匹配原规格", () => {
  assert.deepEqual(
    exampleOffers
      .slice(0, 6)
      .map((o) => [o.originalTime, o.baseAttack, o.baseHealth]),
    [
      [5, 7, 4],
      [3, 2, 4],
      [4, 3, 3],
      [4, 3, 5],
      [6, 6, 5],
      [5, 6, 3],
    ],
  );
});
test("所有学历搭配合法，排名边界与拒绝非法名次", () => {
  for (const a of education.primary)
    for (const b of education.secondary) {
      const l = defaultLoadout("a", "甲");
      l.primaryId = a.id;
      l.secondaryId = b.id;
      validateLoadout(l);
    }
  assert.deepEqual([1, 50, 51, 100, 101, 999].map(rankBand), [
    "H07",
    "H07",
    "H08",
    "H08",
    "H09",
    "H09",
  ]);
  for (const n of [0, -1, 1.1]) assert.throws(() => rankBand(n));
  assert.equal(rankBand(null), null);
});
test("配队拒绝重复身份、三张同名基础牌、重复应对牌", () => {
  for (const mutation of [
    (l: any) => (l.offers[1] = l.offers[0]),
    (l: any) => (l.baseDeck[2] = "N01"),
    (l: any) => (l.flexDeck[1] = l.flexDeck[0]),
  ]) {
    const l = defaultLoadout("a", "甲");
    mutation(l);
    assert.throws(() => validateLoadout(l));
  }
});
test("赛前选牌与换牌：替换先于洗回，第一回合抽牌", () => {
  let s = createMatch(
    [defaultLoadout("a", "甲"), defaultLoadout("b", "乙")],
    1,
  );
  for (const id of ["a", "b"])
    s = run(s, { type: "SELECT_FLEX", flexIds: ["F01", "F04", "F05"] }, id);
  assert.equal(s.phase, "mulligan");
  assert.equal(s.players[0].hand.length, 3);
  assert.equal(s.players[1].hand.length, 4);
  const old = s.players[0].hand.slice(0, 2).map((c) => c.id);
  s = run(s, { type: "MULLIGAN", cardIds: old }, "a");
  assert.ok(!s.players[0].hand.some((c) => old.includes(c.id)));
  s = run(s, { type: "MULLIGAN", cardIds: [] }, "b");
  assert.equal(s.phase, "playing");
  assert.equal(s.players[0].hand.length, 4);
  assert.equal(s.players[0].timeRemaining, 1);
});
test("原子拒绝不修改资源，重发只执行一次", () => {
  let s = fresh();
  reject(s, { type: "DEPLOY_OFFER", offerId: "missing" });
  const id = inject(s, "N08");
  s.players[0].mind = 20;
  s = run(s, { type: "PLAY_CARD", cardId: id, commandId: "same" });
  const r = applyCommand(s, "a", {
    type: "PLAY_CARD",
    cardId: id,
    commandId: "same",
  });
  assert.strictEqual(r.state, s);
  assert.equal(s.players[0].mind, 23);
});
test("普通上桌疲惫，弹性安排可怼角色不可怼主角", () => {
  let s = fresh();
  let u: Unit, e: Unit;
  [s, u] = placed(s, "T00");
  [s, e] = placed(s, "T00", 3, null, "b");
  reject(s, { type: "ATTACK", cardId: u.id, targetId: e.id });
  [s, u] = placed(s, "T00", 3, "B02");
  reject(s, { type: "ATTACK", cardId: u.id, targetId: "b" });
  s = run(s, { type: "ATTACK", cardId: u.id, targetId: e.id });
  assert.ok(
    s.events.some(
      (event) => event.type === "attack" && event.targetId === e.id,
    ),
  );
});
test("挡话约束仅主动开怼，拆台牌可绕过", () => {
  let s = fresh();
  let u: Unit, t: Unit, e: Unit;
  [s, u] = placed(s, "T00", 4);
  u.deployedTurn = 0;
  [s, t] = placed(s, "T02", 3, null, "b");
  [s, e] = placed(s, "T00", 3, null, "b");
  reject(s, { type: "ATTACK", cardId: u.id, targetId: "b" });
  reject(s, { type: "ATTACK", cardId: u.id, targetId: e.id });
  const id = inject(s, "N07");
  s = run(s, { type: "PLAY_CARD", cardId: id, targetId: e.id });
  assert.equal(s.players[1].board.find((x) => x.id === e.id)!.damage, 2);
});
test("同时死亡与Offer反馈产生平局", () => {
  let s = fresh();
  let a: Unit, b: Unit;
  [s, a] = placed(s, "T00", 3);
  [s, b] = placed(s, "T00", 3, null, "b");
  s.players[0].board[0].deployedTurn = 0;
  s.players.forEach((p) => {
    p.mind = 2;
    p.board[0].damage = 1;
  });
  s = run(s, { type: "ATTACK", cardId: a.id, targetId: b.id });
  assert.equal(s.result?.winnerId, null);
  assert.equal(s.phase, "finished");
});
test("一线主动自损与退场同时处理，反击不自损", () => {
  let s = fresh();
  let a: Unit, b: Unit;
  [s, a] = placed(s, "T01", 3);
  [s, b] = placed(s, "T00", 5, null, "b");
  s.players[0].board[0].deployedTurn = 0;
  const before = s.players[0].mind;
  s = run(s, { type: "ATTACK", cardId: a.id, targetId: b.id });
  assert.equal(s.players[0].mind, before - 3);
  assert.equal(s.players[1].mind, 30);
});
test("先问工时降到零仍消耗开怼，销售不抽牌", () => {
  let s = fresh();
  let a: Unit;
  [s, a] = placed(s, "T06", 2);
  a.deployedTurn = 0;
  s.players[1].retort = {
    id: "retort",
    definitionId: "F06",
    kind: "card",
    taxes: [],
    knownTo: [],
  };
  const hand = s.players[0].hand.length;
  s = run(s, { type: "ATTACK", cardId: a.id, targetId: "b" });
  assert.equal(s.players[1].mind, 30);
  assert.equal(s.players[0].hand.length, hand);
  assert.equal(s.players[0].board[0].attacked, true);
});
test("致命冲脸先判胜，不再触发截图", () => {
  let s = fresh();
  let a: Unit;
  [s, a] = placed(s, "T00", 3);
  a.deployedTurn = 0;
  s.players[0].mind = 1;
  s.players[1].mind = 2;
  s.players[1].retort = {
    id: "retort",
    definitionId: "N23",
    kind: "card",
    taxes: [],
    knownTo: [],
  };
  s = run(s, { type: "ATTACK", cardId: a.id, targetId: "b" });
  assert.equal(s.result?.winnerId, "a");
  assert.equal(s.players[0].mind, 1);
});
test("回手保留年龄、清强化与伤害，重上桌新实例", () => {
  let s = fresh();
  let a: Unit;
  [s, a] = placed(s, "T01", 3);
  a.ageStage = 3;
  a.damage = 1;
  a.modifiers.push({ attack: 4, health: 4, source: "H10" });
  const old = a.id,
    oid = a.offerId!;
  const card = inject(s, "N13");
  s = run(s, { type: "PLAY_CARD", cardId: card, targetId: a.id });
  assert.equal(s.players[0].mind, 30);
  assert.equal(
    s.players[0].hand.find((c) => c.kind === "offer")!.offer!.ageStage,
    3,
  );
  s.players[0].timeRemaining = 8;
  s = run(s, { type: "DEPLOY_OFFER", offerId: oid });
  const newer = s.players[0].board[0];
  assert.notEqual(newer.id, old);
  assert.equal(newer.ageStage, 3);
  assert.equal(newer.damage, 0);
  assert.equal(newer.modifiers.length, 0);
});
test("满手回手公开弃置，不扣退场心态", () => {
  let s = fresh();
  let u: Unit;
  [s, u] = placed(s, "T00", 3, null, "b");
  while (s.players[1].hand.length < 8) inject(s, "N01", "b");
  const id = inject(s, "N12");
  s = run(s, { type: "PLAY_CARD", cardId: id, targetId: u.id });
  assert.equal(s.players[1].hand.length, 8);
  assert.equal(s.players[1].mind, 30);
  assert.equal(
    s.players[1].offerZone.find((o) => o.id === u.offerId)!.status,
    "discard",
  );
});
test("年龄自然推进：22、27、31、35，手牌不推进", () => {
  let s = fresh();
  let u: Unit;
  [s, u] = placed(s, "T04", 3);
  assert.equal(getView(s, "a").players[0].board[0].age, 22);
  for (const expected of [27, 31, 35]) {
    s = run(s, { type: "END_TURN" });
    s = run(s, { type: "END_TURN" });
    assert.equal(getView(s, "a").players[0].board[0].age, expected);
  }
});
test("硬件阶段保持已受伤害，期权与创业成长分离", () => {
  let s = fresh();
  let u: Unit;
  [s, u] = placed(s, "T04", 4);
  u.ageStage = 3;
  u.damage = 2;
  assert.deepEqual(unitStats(s, u), { attack: 5, maxHealth: 7, health: 5 });
  [s, u] = placed(s, "T10", 6, "B04", "b");
  u.ageStage = 3;
  const before = unitStats(s, u).attack;
  const id = inject(s, "F02");
  s = run(s, { type: "PLAY_CARD", cardId: id, targetId: u.id });
  const after = s.players[1].board[0];
  assert.equal(unitStats(s, after).attack, before - 3);
  assert.equal(after.damage, 2);
});
for (const [c, d] of [
  [2, 1],
  [3, 1],
  [4, 2],
  [5, 2],
  [6, 3],
  [7, 3],
])
  test("谈薪优惠 " + c + "→" + d, () => {
    let s = fresh();
    const sid = offer(s, "T00", c),
      tid = offer(s, "T00", 7);
    s = run(s, { type: "NEGOTIATE", sacrificeId: sid, offerId: tid });
    assert.equal(s.players[0].timeRemaining, 8 - (7 - d));
    assert.equal(
      s.players[0].offerZone.find((o) => o.id === sid)!.status,
      "negotiated",
    );
    assert.ok(s.players[0].negotiationUsed);
  });
test("谈薪不足资源原子拒绝，内推叠加最低1并消耗", () => {
  let s = fresh();
  const sid = offer(s, "T00", 6),
    tid = offer(s, "T00", 5);
  s.players[0].timeRemaining = 0;
  reject(s, { type: "NEGOTIATE", sacrificeId: sid, offerId: tid });
  s.players[0].timeRemaining = 8;
  s.players[0].education.referralDiscount = 2;
  s = run(s, { type: "NEGOTIATE", sacrificeId: sid, offerId: tid });
  assert.equal(s.players[0].timeRemaining, 7);
  assert.equal(s.players[0].education.referralDiscount, 0);
});
test("三十五岁通知锁上桌实例，完整响应回合后触发", () => {
  let s = fresh();
  let u: Unit;
  [s, u] = placed(s, "T01", 3, null, "b");
  u.ageStage = 2;
  let id = inject(s, "F01");
  reject(s, { type: "PLAY_CARD", cardId: id, targetId: u.id });
  u.ageStage = 3;
  s = run(s, { type: "PLAY_CARD", cardId: id, targetId: u.id });
  s = run(s, { type: "END_TURN" });
  assert.equal(s.players[1].board.length, 1);
  s = run(s, { type: "END_TURN" });
  assert.equal(s.players[1].board.length, 0);
  assert.equal(s.players[1].mind, 28);
});
test("转管理使优化失效并关闭一线自损", () => {
  let s = fresh();
  let u: Unit;
  [s, u] = placed(s, "T01", 4, null, "b");
  u.ageStage = 3;
  const id = inject(s, "F01");
  s = run(s, { type: "PLAY_CARD", cardId: id, targetId: u.id });
  s = run(s, { type: "END_TURN" });
  const management = inject(s, "F03");
  s = run(s, { type: "PLAY_CARD", cardId: management, targetId: u.id });
  assert.ok(!s.players[1].board[0].tags.includes("frontline"));
  s = run(s, { type: "END_TURN" });
  assert.equal(s.players[1].board.length, 1);
  assert.equal(s.players[1].board[0].notice, undefined);
});
test("合同取消整张定向牌，但群体与学历技能不触发", () => {
  let s = fresh("H10", "S09");
  let u: Unit;
  [s, u] = placed(s, "T00", 5, null, "b");
  s.players[1].retort = {
    id: "r",
    definitionId: "F04",
    kind: "card",
    taxes: [],
    knownTo: [],
  };
  const id = inject(s, "N14");
  const n = s.players[0].hand.length;
  s = run(s, { type: "PLAY_CARD", cardId: id, targetId: u.id });
  assert.equal(s.players[0].hand.length, n - 1);
  assert.equal(s.players[1].board[0].modifiers.length, 0);
  s.players[1].retort = {
    id: "r2",
    definitionId: "F04",
    kind: "card",
    taxes: [],
    knownTo: [],
  };
  s = run(s, { type: "USE_SECONDARY", targetId: u.id });
  assert.ok(s.players[1].retort);
  assert.equal(s.players[1].board[0].damage, 4);
});
test("保障只减对手拆台伤害，群体消耗一次，直接退场不保护", () => {
  let s = fresh();
  let u: Unit;
  [s, u] = placed(s, "T00", 5, "B07", "b");
  let id = inject(s, "N10");
  s = run(s, { type: "PLAY_CARD", cardId: id, targetId: u.id });
  assert.equal(s.players[1].board[0].damage, 1);
  id = inject(s, "N07");
  s = run(s, { type: "PLAY_CARD", cardId: id, targetId: u.id });
  assert.equal(s.players[1].board[0].damage, 3);
  id = inject(s, "N20");
  s = run(s, { type: "PLAY_CARD", cardId: id, targetId: u.id });
  assert.equal(s.players[1].board.length, 0);
});
test("话题覆盖与下轮恢复，生活只额外恢复一次", () => {
  let s = fresh();
  let u: Unit;
  [s, u] = placed(s, "T00", 3, "B01");
  [s, u] = placed(s, "T00", 3, "B01");
  s.players[0].mind = 20;
  const id = inject(s, "F05");
  s = run(s, { type: "PLAY_CARD", cardId: id, topic: "life" });
  s = run(s, { type: "END_TURN" });
  assert.equal(s.players[0].mind, 23);
  assert.equal(s.topic, "life");
  s = run(s, { type: "END_TURN" });
  assert.equal(s.topic, "future");
});
test("反话槽唯一，N24要求两个空位", () => {
  let s = fresh();
  const id = inject(s, "F04"),
    id2 = inject(s, "N23");
  s = run(s, { type: "PLAY_CARD", cardId: id });
  reject(s, { type: "PLAY_CARD", cardId: id2 });
  for (let i = 0; i < 3; i++) [s] = placed(s);
  const n = inject(s, "N24");
  reject(s, { type: "PLAY_CARD", cardId: n });
});
test("双学历共用机会，第4轮前不允许进修", () => {
  let s = fresh("H04", "S00");
  s.round = 3;
  reject(s, { type: "USE_SECONDARY" });
  s.round = 4;
  s = run(s, { type: "USE_SECONDARY" });
  assert.ok(s.players[0].education.secondaryUsed);
  reject(s, { type: "USE_PRIMARY" });
  s = run(s, { type: "END_TURN" });
  s = run(s, { type: "END_TURN" });
  reject(s, { type: "USE_SECONDARY" });
});
test("清北在选择前扣费，隐藏信息不泄露，新抽牌继续隐藏", () => {
  let s = fresh("H01", "S01");
  s = run(s, { type: "USE_PRIMARY" });
  assert.equal(s.players[0].timeRemaining, 6);
  assert.ok(s.players[0].education.usedThisOwnTurn);
  assert.ok(getView(s, "a").pendingChoice);
  assert.equal(getView(s, "b").pendingChoice, null);
  reject(s, { type: "END_TURN" });
  const option = s.pendingChoice!.options[0];
  s = run(s, { type: "RESOLVE_CHOICE", optionId: option.id });
  s = run(s, { type: "END_TURN" });
  const view = getView(s, "a");
  assert.equal(view.players[1].hand.length, 0);
  assert.equal(view.players[1].knownHand.length, 4);
  assert.equal(view.players[1].handCount, 5);
  const c = s.players[1].hand.find((c) => c.id === option.id)!;
  assert.equal(
    handCost(s.players[1], c),
    cardById[c.definitionId].time_cost + 1,
  );
});
test("C9空牌库不焦虑，已有便条拒绝，进修升级不叠加", () => {
  let s = fresh("H02", "S02");
  s.players[0].deck = [];
  s = run(s, { type: "USE_PRIMARY" });
  assert.equal(s.players[0].fatigue, 0);
  assert.equal(s.players[0].education.referralDiscount, 1);
  s.players[0].education.usedThisOwnTurn = false;
  reject(s, { type: "USE_PRIMARY" });
  s = run(s, { type: "USE_SECONDARY" });
  assert.equal(s.players[0].education.referralDiscount, 2);
});
test("C9筛选保留未选顺序到底，咨询拿牌后洗回", () => {
  let s = fresh("H02");
  const before = s.players[0].deck.map((c) => c.id);
  s = run(s, { type: "USE_PRIMARY" });
  s = run(s, { type: "RESOLVE_CHOICE", optionId: before[1] });
  assert.deepEqual(
    s.players[0].deck.map((c) => c.id),
    [before[1], ...before.slice(3), before[0], before[2]],
  );
});
test("吉大完整四次学历行动合计9小时，加成不重置年龄、不额外攻击", () => {
  let s = fresh("H10", "S10");
  let u: Unit;
  [s, u] = placed(s, "T04", 4);
  u.ageStage = 2;
  u.damage = 2;
  u.attacked = true;
  let cost = 0;
  for (let i = 0; i < 2; i++) {
    s.players[0].timeRemaining = 8;
    s.players[0].education.usedThisOwnTurn = false;
    s = run(s, { type: "USE_PRIMARY" });
    cost += 2;
  }
  s.players[0].education.usedThisOwnTurn = false;
  reject(s, { type: "USE_PRIMARY" });
  s = run(s, { type: "USE_PRIMARY", targetId: u.id });
  cost += 2;
  assert.equal(s.players[0].education.jluSignins, 0);
  assert.ok(s.players[0].education.jluUltimateUsed);
  s.players[0].education.usedThisOwnTurn = false;
  s = run(s, { type: "USE_SECONDARY", targetId: u.id });
  cost += 3;
  const end = s.players[0].board[0];
  assert.equal(
    end.modifiers.reduce((n, m) => n + m.attack, 0),
    6,
  );
  assert.equal(
    end.modifiers.reduce((n, m) => n + m.health, 0),
    6,
  );
  assert.equal(cost, 9);
  assert.equal(end.damage, 2);
  assert.equal(end.ageStage, 2);
  assert.equal(end.attacked, true);
  s.players[0].education.usedThisOwnTurn = false;
  s.players[0].timeRemaining = 8;
  s.players[0].mind = 20;
  s = run(s, { type: "USE_PRIMARY" });
  assert.equal(s.players[0].mind, 22);
});
test("海外调度便条绑定身份、保年龄，使用后移除", () => {
  let s = fresh("H07");
  let u: Unit;
  [s, u] = placed(s, "T04", 4);
  u.ageStage = 3;
  const oid = u.offerId!;
  s = run(s, { type: "USE_PRIMARY", targetId: u.id });
  assert.equal(s.players[0].education.returnTicket?.offerId, oid);
  assert.equal(
    offerCost(s.players[0], s.players[0].offerZone.find((o) => o.id === oid)!),
    3,
  );
  s = run(s, { type: "DEPLOY_OFFER", offerId: oid });
  assert.equal(s.players[0].education.returnTicket, null);
  assert.equal(s.players[0].board[0].ageStage, 3);
});
test("S08最多两个不同目标；伤害保持", () => {
  let s = fresh("H10", "S08");
  let a: Unit, b: Unit;
  [s, a] = placed(s);
  [s, b] = placed(s);
  s.players[0].board[0].damage = 1;
  reject(s, { type: "USE_SECONDARY", targetIds: [a.id, a.id] });
  s = run(s, { type: "USE_SECONDARY", targetIds: [a.id, b.id] });
  assert.equal(s.players[0].board[0].damage, 1);
  assert.ok(
    s.players[0].board.every((u) =>
      u.modifiers.some((m) => m.source === "S08"),
    ),
  );
});
test("换赛道需非空牌库，Offer不可被交换", () => {
  let s = fresh("H09");
  const id = inject(s, "N08");
  s.players[0].deck = [];
  reject(s, { type: "USE_PRIMARY", cardId: id });
  s.players[0].deck.push({
    id: "deck-test",
    definitionId: "N01",
    kind: "card",
    taxes: [],
    knownTo: [],
  });
  s = run(s, { type: "USE_PRIMARY", cardId: id });
  assert.equal(s.players[0].hand.at(-1)!.definitionId, "N01");
  assert.equal(s.players[0].deck.at(-1)!.id, id);
});
test("一次抽两张按序焦虑；第一次致命即停止", () => {
  let s = fresh();
  s.players[0].deck = [];
  s.players[0].mind = 2;
  const id = inject(s, "N09");
  s = run(s, { type: "PLAY_CARD", cardId: id });
  assert.equal(s.players[0].fatigue, 2);
  assert.equal(s.players[0].mind, -1);
  s = fresh();
  s.players[0].deck = [];
  s.players[0].mind = 1;
  const id2 = inject(s, "N09");
  s = run(s, { type: "PLAY_CARD", cardId: id2 });
  assert.equal(s.players[0].fatigue, 1);
});
test("S00恢复先于焦虑，S03强化先于致命自损", () => {
  let s = fresh("H10", "S00");
  s.players[0].deck = [];
  s.players[0].mind = 1;
  s = run(s, { type: "USE_SECONDARY" });
  assert.equal(s.players[0].mind, 2);
  s = fresh("H10", "S03");
  let u: Unit;
  [s, u] = placed(s);
  s.players[0].mind = 1;
  s = run(s, { type: "USE_SECONDARY", targetId: u.id });
  assert.ok(s.result);
  assert.equal(s.players[0].board[0].modifiers[0].attack, 2);
});
test("全部21种学历技能通过真实合法命令发动", () => {
  for (const def of [...education.primary, ...education.secondary]) {
    let s = fresh(
      def.id.startsWith("H") ? def.id : "H10",
      def.id.startsWith("S") ? def.id : "S00",
    );
    let own: Unit;
    [s, own] = placed(s);
    [s] = placed(s, "T00", 5, null, "b");
    const support = inject(s, "N01");
    s = run(s, { type: "PLAY_CARD", cardId: support });
    s.players[0].timeRemaining = 8;
    const type = def.id.startsWith("H") ? "USE_PRIMARY" : "USE_SECONDARY";
    const actions = getView(s, "a").legalActions.filter((c) => c.type === type);
    assert.ok(actions.length, def.id + " has legal action");
    s = run(s, actions[0]);
    assert.ok(s.players[0].education.usedThisOwnTurn, def.id);
  }
});
test("全部30张通用牌通过真实合法命令使用", () => {
  for (const def of CARDS) {
    let s = fresh();
    let own: Unit, enemy: Unit;
    [s, own] = placed(s, "T01", 3);
    [s, enemy] = placed(s, "T01", 4, "B04", "b");
    enemy.ageStage = 3;
    enemy.damage = 1;
    const id = inject(s, def.id);
    const actions = getView(s, "a").legalActions.filter(
      (c) => c.type === "PLAY_CARD" && c.cardId === id,
    );
    assert.ok(actions.length, def.id + " has legal action");
    s = run(s, actions[0]);
    assert.ok(
      !s.players[0].hand.some((c) => c.id === id),
      def.id + " consumed",
    );
  }
});
test("所有11模板和7条款上桌执行，无未知处理器", () => {
  for (let i = 0; i <= 10; i++) {
    let s = fresh();
    [s] = placed(s, "T" + String(i).padStart(2, "0"), 4);
    assert.equal(s.players[0].board.length, 1);
    while (s.pendingChoice)
      s = run(s, {
        type: "RESOLVE_CHOICE",
        optionId: s.pendingChoice.options[0].id,
      });
  }
  for (let i = 1; i <= 7; i++) {
    let s = fresh();
    [s] = placed(s, "T00", 4, "B0" + i);
    assert.equal(s.players[0].board.length, 1);
  }
});
test("冻结两次只覆盖同一个下回合，结束后恢复", () => {
  let s = fresh();
  let enemy: Unit;
  [s, enemy] = placed(s, "T00", 5, null, "b");
  for (let i = 0; i < 2; i++) {
    const id = inject(s, "N11");
    s = run(s, { type: "PLAY_CARD", cardId: id, targetId: enemy.id });
  }
  s = run(s, { type: "END_TURN" });
  assert.ok(!getView(s, "b").players[1].board[0].canAttack);
  s = run(s, { type: "END_TURN" });
  s = run(s, { type: "END_TURN" });
  assert.ok(getView(s, "b").players[1].board[0].canAttack);
});
test("第12轮后手完成恢复才比较心态", () => {
  let s = fresh();
  s.round = 12;
  s.activePlayerId = "b";
  let u: Unit;
  [s, u] = placed(s, "T00", 3, "B01", "b");
  s.players[0].mind = 9;
  s.players[1].mind = 9;
  s = run(s, { type: "END_TURN" });
  assert.equal(s.result?.winnerId, "b");
  assert.equal(s.players[1].mind, 10);
});
test("超时默认选择、连续两次无行动判负；主动结束不算挂机", () => {
  let s = fresh();
  s = run(s, { type: "TIMEOUT" });
  s = run(s, { type: "END_TURN" });
  s = run(s, { type: "TIMEOUT" });
  assert.equal(s.result?.winnerId, "b");
  s = fresh();
  for (let i = 0; i < 4; i++) s = run(s, { type: "END_TURN" });
  assert.equal(s.result, null);
});
test("视图不含牌库、随机种子、对方反话和未获知手牌身份", () => {
  const s = fresh();
  s.players[1].retort = {
    id: "secret-retort-id",
    definitionId: "F06",
    kind: "card",
    taxes: [],
    knownTo: [],
  };
  const v = getView(s, "a"),
    text = JSON.stringify(v);
  assert.ok(!("rngState" in v));
  assert.ok(!("deck" in v.players[1]));
  assert.deepEqual(v.players[1].retort, { covered: true });
  assert.ok(!text.includes("secret-retort-id"));
  for (const card of s.players[1].hand)
    assert.ok(!text.includes(JSON.stringify(card.id)));
  for (const card of s.players[0].deck)
    assert.ok(!text.includes(JSON.stringify(card.id)));
});
test("相同种子、指令重放哈希一致，机器人只接收玩家视图", () => {
  let a = createMatch(
    [defaultLoadout("a", "甲"), defaultLoadout("b", "乙", 1)],
    771,
    { skipSetup: true },
  );
  let b = structuredClone(a);
  for (let i = 0; i < 120 && !a.result; i++) {
    const c = chooseBotCommand(getView(a, a.activePlayerId), "aggressive");
    b = run(b, c);
    a = run(a, c);
    assert.equal(stableHash(a), stableHash(b));
  }
  assert.ok(a.result);
});

test("临时角色保留规格原始耗时，S06上桌只能怼角色", () => {
  let s = fresh("H06", "S06");
  s = run(s, { type: "USE_PRIMARY" });
  assert.equal(s.players[0].board[0].originalTime, 1);
  s.players[0].education.usedThisOwnTurn = false;
  s = run(s, { type: "USE_SECONDARY" });
  const unit = s.players[0].board[1];
  assert.equal(unit.originalTime, 2);
  assert.equal(unit.baseAttack, 2);
  assert.equal(unit.baseHealth, 3);
  reject(s, { type: "ATTACK", cardId: unit.id, targetId: "b" });
});

test("咨询先拿牌再结算安家补助；超时选择后的致命焦虑立即结束", () => {
  let s = fresh();
  s.players[0].deck = s.players[0].deck.slice(0, 1);
  s.players[0].mind = 1;
  const oid = offer(s, "T09", 3, "B05");
  s = run(s, { type: "DEPLOY_OFFER", offerId: oid });
  assert.equal(s.pendingChoice?.kind, "consult");
  assert.equal(s.players[0].deck.length, 1);
  s = run(s, { type: "TIMEOUT" });
  assert.equal(s.phase, "finished");
  assert.equal(s.players[0].fatigue, 1);
  assert.equal(s.events.at(-1)?.type, "result");
});

test("回手Offer的轮岗两种选择、谈薪上桌目标都出现在合法动作中", () => {
  let s = fresh();
  let u: Unit;
  [s, u] = placed(s, "T05", 3, "B06");
  const oid = u.offerId!;
  const card = inject(s, "N13");
  s = run(s, { type: "PLAY_CARD", cardId: card, targetId: u.id });
  s.players[0].timeRemaining = 8;
  const hand = s.players[0].hand.find((h) => h.offer?.id === oid)!;
  const choices = getView(s, "a")
    .legalActions.filter((c) => c.type === "PLAY_CARD" && c.cardId === hand.id)
    .map((c) => c.benefitChoice);
  assert.ok(choices.includes("attack") && choices.includes("health"));
});

test("合法动作仅携带真实条款选择，无目标学历不制造虚假目标", () => {
  let s = fresh("H04");
  let unit: Unit;
  [s, unit] = placed(s);
  const id = inject(s, "N07");
  [s] = placed(s, "T00", 3, null, "b");
  const view = getView(s, "a");
  const hero = view.legalActions.filter((c) => c.type === "USE_PRIMARY");
  assert.deepEqual(hero, [{ type: "USE_PRIMARY" }]);
  assert.ok(
    view.legalActions
      .filter((c) => c.type === "PLAY_CARD" && c.cardId === id)
      .every((c) => c.benefitChoice === undefined),
  );
});

test("公开视图剔除所有原始Offer输入与支持角色后台卡牌追踪", () => {
  let s = fresh();
  (s.players[1].offerZone[0].definition.profile as any).privateApplicantEmail =
    "secret-applicant@example.test";
  const support = inject(s, "N01");
  s = run(s, { type: "PLAY_CARD", cardId: support });
  const view = getView(s, "a");
  assert.equal(view.players[0].board[0].card, undefined);
  assert.ok(
    view.players
      .flatMap((p) => p.offerZone)
      .every((o) => o.definition.profile === undefined),
  );
  assert.ok(!JSON.stringify(view).includes("secret-applicant"));
  assert.ok(s.players[0].board[0].card, "原状态保留追踪信息");
});

test("岗位卡名与公司字段独立，显式命名不会改变规则哈希", () => {
  const base = {
    ...profile,
    industry: "internet",
    role_family: "algorithm",
    role_title: "算法工程师",
  };
  const generated = compileOffer(base);
  assert.equal(generated.name, "互联网算法工程师");
  assert.ok(!generated.name.includes("大厂"));
  const custom = compileOffer({
    ...base,
    card_display_name: "\u0000大厂算法岗\n",
  });
  assert.equal(custom.name, "大厂算法岗");
  assert.equal(custom.profile?.card_display_name, "大厂算法岗");
  assert.equal(custom.company, base.company_display_name);
  assert.equal(custom.definitionHash, generated.definitionHash);
  const long = compileOffer({
    ...base,
    card_display_name: "这是一个包含很多文字需要截断但不应改变规则的岗位名称",
  });
  assert.equal(Array.from(long.name).length, 16);
  assert.equal(long.definitionHash, generated.definitionHash);
});

test("九张公共体验卡使用具体岗位；新增三张是明确虚构薪酬", () => {
  assert.deepEqual(
    exampleOffers.map((o) => o.name),
    [
      "大厂算法岗",
      "国企综合岗",
      "外企产品经理",
      "制造业研发",
      "初创研发合伙人",
      "金融机构销售",
      "银行基层",
      "投行做债",
      "央企总部",
    ],
  );
  assert.deepEqual(
    exampleOffers
      .slice(6)
      .map((o) => [
        o.id,
        o.templateId,
        o.originalTime,
        o.baseAttack,
        o.baseHealth,
      ]),
    [
      ["E07", "T02", 3, 2, 4],
      ["E08", "T00", 5, 5, 6],
      ["E09", "T02", 4, 3, 5],
    ],
  );
  assert.ok(exampleOffers.slice(6).every((o) => o.company.includes("虚构")));
});

test("没有友方角色时恢复技能可空放，但拒绝伪造敌方目标", () => {
  let s = fresh("H05");
  let enemy: Unit;
  [s, enemy] = placed(s, "T00", 3, null, "b");
  reject(s, { type: "USE_PRIMARY", targetId: enemy.id });
  s = run(s, { type: "USE_PRIMARY" });
  assert.ok(s.players[0].education.usedThisOwnTurn);
});

test("新职业默认回落普通同事，手选玩法类型仍使用固定公式", () => {
  const unseen = {
    ...profile,
    company_display_name: "用户自定义的新企业",
    role_family: "quantum_orchestration",
    role_title: "空间算力策展师",
    monthly_fixed_cny: 25000,
    guaranteed_months: 12,
  };
  const automatic = compileOffer(unseen);
  assert.equal(automatic.templateId, "T00");
  assert.equal(automatic.company, unseen.company_display_name);
  assert.equal(automatic.role, unseen.role_title);
  const chosen = compileOffer({ ...unseen, selected_template_id: "T04" });
  assert.equal(chosen.templateId, "T04");
  assert.deepEqual(
    [chosen.originalTime, chosen.baseAttack, chosen.baseHealth],
    [4, 3, 5],
  );
  assert.equal(chosen.profile?.selected_template_id, "T04");
  for (const invalid of ["T11", "custom", "__proto__", "constructor", ""])
    assert.throws(() =>
      compileOffer({ ...unseen, selected_template_id: invalid }),
    );
});

test("固定模板下改卡名、公司显示和美术不会改战斗数值或规则哈希", () => {
  const confirmed = {
    ...profile,
    selected_template_id: "T04",
    monthly_fixed_cny: 25000,
    guaranteed_months: 12,
  };
  const a = compileOffer(confirmed);
  const b = compileOffer({
    ...confirmed,
    company_display_name: "另一版公司抬头",
    card_display_name: "制造业研发",
    art_variant: "new-face",
    baseAttack: 999,
  } as typeof confirmed);
  assert.equal(a.definitionHash, b.definitionHash);
  assert.deepEqual(
    [a.originalTime, a.baseAttack, a.baseHealth],
    [b.originalTime, b.baseAttack, b.baseHealth],
  );
  assert.equal(b.baseAttack, 3);
  assert.equal(b.name, "制造业研发");
});

test("签字费保留在收藏定义，Offer区、回手牌、已知牌与窥视快照均不公开", () => {
  let s = fresh("H01");
  let unit: Unit;
  [s, unit] = placed(s, "T00", 3, null, "b");
  const definition = s.players[1].offerZone.find(
    (o) => o.id === unit.offerId,
  )!.definition;
  definition.signingBonus = 50000;
  if (definition.profile) definition.profile.one_time_signing_cny = 50000;
  const bounce = inject(s, "N12");
  s = run(s, { type: "PLAY_CARD", cardId: bounce, targetId: unit.id });
  s = run(s, { type: "USE_PRIMARY" });
  const offer = s.players[1].hand.find((c) => c.kind === "offer")!;
  assert.equal(offer.offer!.definition.signingBonus, 50000);
  assert.equal(
    s.players[1].offerZone.find((o) => o.id === unit.offerId)!.definition
      .signingBonus,
    50000,
  );
  const ownView = getView(s, "b");
  assert.ok(
    !(
      "signingBonus" in
      ownView.players[1].hand.find((c) => c.kind === "offer")!.offer!.definition
    ),
  );
  const observer = getView(s, "a");
  assert.ok(
    observer.players
      .flatMap((p) => p.offerZone)
      .every((o) => !("signingBonus" in o.definition)),
  );
  assert.ok(
    !(
      "signingBonus" in
      observer.players[1].knownHand.find((c) => c.kind === "offer")!.offer!
        .definition
    ),
  );
  const option = observer.pendingChoice!.options.find(
    (o) => o.card?.kind === "offer",
  )!;
  assert.ok(!("signingBonus" in option.card!.offer!.definition));
  assert.ok(!JSON.stringify(observer).includes("one_time_signing_cny"));
  assert.ok(
    s.players[1].offerZone.find((o) => o.id === unit.offerId)!.definition
      .definitionHash,
  );
  assert.ok(
    observer.players
      .flatMap((p) => p.offerZone)
      .every((o) => !("definitionHash" in o.definition)),
  );
  assert.ok(!("definitionHash" in option.card!.offer!.definition));
});

test("攻击演出包含真实攻击者、同时反击与死亡前位置快照", () => {
  let s = fresh();
  let attacker: Unit, defender: Unit;
  [s, attacker] = placed(s, "T00", 3);
  [s, defender] = placed(s, "T00", 3, null, "b");
  s.players[0].board[0].deployedTurn = 0;
  s.players.forEach((p) => (p.board[0].damage = 1));
  const before = s.eventSequence;
  s = run(s, { type: "ATTACK", cardId: attacker.id, targetId: defender.id });
  const cues = getView(s, "a").visualCues.filter((c) => c.sequence > before);
  const hit = cues.find((c) => c.kind === "attack")!;
  assert.equal(hit.sourceId, attacker.id);
  assert.equal(hit.targetId, defender.id);
  assert.equal(hit.playerId, "a");
  assert.equal(hit.source?.slot, 0);
  assert.equal(hit.target?.slot, 0);
  assert.deepEqual(hit.changes, [
    { targetId: defender.id, playerId: "b", stat: "health", amount: -3 },
    { targetId: attacker.id, playerId: "a", stat: "health", amount: -3 },
  ]);
  const deaths = cues.filter((c) => c.kind === "retire");
  assert.equal(deaths.length, 2);
  assert.ok(
    deaths.every(
      (c) =>
        c.sequence > hit.sequence && c.target?.slot === 0 && c.target?.name,
    ),
  );
  assert.deepEqual(
    deaths.map((c) => c.changes?.[0].amount),
    [-2, -2],
  );
  assert.equal(s.players[0].board.length + s.players[1].board.length, 0);
});

test("一线自损是同一次攻击演出的变化，冲脸不产生虚构反击", () => {
  let s = fresh();
  let attacker: Unit;
  [s, attacker] = placed(s, "T01", 3);
  attacker.deployedTurn = 0;
  s = run(s, { type: "ATTACK", cardId: attacker.id, targetId: "b" });
  const cue = getView(s, "a").visualCues.findLast((c) => c.kind === "attack")!;
  assert.equal(cue.target?.kind, "hero");
  assert.deepEqual(cue.changes, [
    { targetId: "b", playerId: "b", stat: "mind", amount: -5 },
    { targetId: "a", playerId: "a", stat: "mind", amount: -1 },
  ]);
  assert.equal(s.players[0].mind, 29);
  assert.equal(s.players[1].mind, 25);
});

test("学历演出明确区分主技能与进修，多目标和吉大阶段不靠文案推断", () => {
  let s = fresh("H10", "S08");
  let one: Unit, two: Unit;
  [s, one] = placed(s);
  [s, two] = placed(s);
  s = run(s, { type: "USE_SECONDARY", targetIds: [one.id, two.id] });
  let cues = getView(s, "a").visualCues;
  const skill = cues.findLast((c) => c.kind === "secondary_skill")!;
  assert.equal(skill.educationId, "S08");
  assert.equal(skill.sourceId, "a");
  assert.deepEqual(
    skill.targets?.map((a) => a.id),
    [one.id, two.id],
  );
  assert.ok(
    cues
      .filter((c) => c.sequence > skill.sequence && c.kind === "buff")
      .every((c) =>
        c.changes?.some((x) => x.stat === "maxHealth" && x.amount === 1),
      ),
  );
  s.players[0].education.usedThisOwnTurn = false;
  s.players[0].education.jluSignins = 2;
  s.players[0].timeRemaining = 8;
  s = run(s, { type: "USE_PRIMARY", targetId: one.id });
  cues = getView(s, "a").visualCues;
  const ultimate = cues.findLast((c) => c.kind === "primary_skill")!;
  assert.equal(ultimate.educationId, "H10");
  assert.equal(ultimate.effectId, "jlu_ultimate");
  assert.equal(ultimate.targetId, one.id);
  assert.equal(
    cues.filter(
      (c) => c.kind === "primary_skill" && c.effectId === "jlu_ultimate",
    ).length,
    1,
  );
});

test("治疗和保障减伤演出使用实际结算量，上桌能力来源为该角色", () => {
  let s = fresh("H05");
  let own: Unit, enemy: Unit;
  [s, own] = placed(s);
  own.damage = 1;
  s.players[0].mind = 29;
  s = run(s, { type: "USE_PRIMARY", targetId: own.id });
  let cue = getView(s, "a").visualCues.findLast(
    (c) => c.kind === "heal" && c.targetId === own.id,
  )!;
  assert.equal(cue.amount, 1);
  assert.equal(cue.changes?.[0].stat, "health");
  [s, enemy] = placed(s, "T00", 4, "B07", "b");
  const card = inject(s, "N07");
  s = run(s, { type: "PLAY_CARD", cardId: card, targetId: enemy.id });
  cue = getView(s, "a").visualCues.findLast(
    (c) => c.kind === "damage" && c.targetId === enemy.id,
  )!;
  assert.equal(cue.amount, 0);
  assert.equal(cue.changes?.[0].amount, 0);
  const support = offer(s, "T07", 3);
  s.players[0].timeRemaining = 8;
  s = run(s, { type: "DEPLOY_OFFER", offerId: support, targetId: enemy.id });
  cue = getView(s, "a").visualCues.findLast(
    (c) => c.kind === "damage" && c.targetId === enemy.id,
  )!;
  assert.equal(cue.source?.kind, "unit");
  assert.equal(cue.source?.templateId, "T07");
});

test("反话盖下不泄漏身份，只有真实翻开才产生对应反话演出", () => {
  let s = fresh();
  let enemy: Unit;
  [s, enemy] = placed(s, "T00", 4, null, "b");
  const retort = inject(s, "F04", "b");
  s.activePlayerId = "b";
  s = run(s, { type: "PLAY_CARD", cardId: retort }, "b");
  s.activePlayerId = "a";
  const covered = getView(s, "a").visualCues.findLast(
    (c) => c.kind === "covered",
  )!;
  assert.equal(covered.cardId, undefined);
  assert.ok(!JSON.stringify(covered).includes("F04"));
  assert.ok(!JSON.stringify(covered).includes(retort));
  const card = inject(s, "N07");
  s = run(s, { type: "PLAY_CARD", cardId: card, targetId: enemy.id });
  const cues = getView(s, "a").visualCues,
    reveal = cues.findLast((c) => c.kind === "retort")!;
  assert.equal(reveal.cardId, "F04");
  assert.equal(reveal.sourceId, "b:retort");
  assert.ok(
    cues.some((c) => c.sequence > reveal.sequence && c.effectId === "cancel"),
  );
  assert.ok(
    !cues.some((c) => c.sequence > reveal.sequence && c.kind === "damage"),
  );
});

test("抽牌演出只有通用牌背锚点，窥视也不会广播隐私选择", () => {
  let s = fresh("H01");
  const drawCard = inject(s, "N09");
  s = run(s, { type: "PLAY_CARD", cardId: drawCard });
  s = run(s, { type: "USE_PRIMARY" });
  const mine = getView(s, "a"),
    other = getView(s, "b");
  assert.ok(mine.pendingChoice);
  assert.equal(other.pendingChoice, null);
  for (const cue of other.visualCues.filter((c) => c.kind === "draw")) {
    assert.equal(cue.cardId, undefined);
    assert.equal(cue.source?.kind, "deck");
    assert.equal(cue.target?.kind, "hand");
    assert.equal(cue.source?.definitionId, undefined);
  }
  for (const card of s.players[0].hand)
    assert.ok(
      !JSON.stringify(other.visualCues).includes(JSON.stringify(card.id)),
    );
  assert.ok(!JSON.stringify(other.visualCues).includes("profile"));
});

test("演出ID可稳定去重并支持确定性回放，读取视图不会共享可变对象", () => {
  let s = fresh();
  const id = inject(s, "N01"),
    initial = structuredClone(s),
    command: Command = {
      type: "PLAY_CARD",
      cardId: id,
      commandId: "visual-once",
    };
  s = run(s, command);
  const first = getView(s, "a");
  assert.ok(
    first.visualCues.some(
      (c) => c.kind === "deploy" && c.target?.definitionId === "N01",
    ),
  );
  const duplicate = applyCommand(s, "a", command).state;
  assert.deepEqual(getView(duplicate, "a").visualCues, first.visualCues);
  const replay = run(initial, command);
  assert.deepEqual(getView(replay, "a").visualCues, first.visualCues);
  assert.ok(
    first.visualCues.every((c) => c.id === `${s.matchId}:${c.sequence}`),
  );
  const cue = first.visualCues.find((c) => c.target?.kind === "unit")!;
  cue.target!.name = "UI修改";
  assert.ok(!JSON.stringify(s.events).includes("UI修改"));
});

test("演出队列沿用事件授权过滤，不暴露私有事件且保持有序上限", () => {
  const s = fresh();
  for (let i = 0; i < 90; i++)
    s.events.push({
      sequence: ++s.eventSequence,
      type: "test_public",
      text: "公开演出",
      visual: { kind: "status", effectId: "public" },
    });
  s.events.push({
    sequence: ++s.eventSequence,
    type: "test_private",
    text: "私有演出",
    privateTo: "a",
    visual: { kind: "status", effectId: "secret-only-a" },
  });
  const a = getView(s, "a"),
    b = getView(s, "b");
  assert.equal(a.visualCues.length, 80);
  assert.equal(b.visualCues.length, 80);
  assert.ok(a.visualCues.some((c) => c.effectId === "secret-only-a"));
  assert.ok(!b.visualCues.some((c) => c.effectId === "secret-only-a"));
  assert.ok(
    b.visualCues.every(
      (c, i) => !i || c.sequence > b.visualCues[i - 1].sequence,
    ),
  );
});
