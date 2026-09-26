import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createShowcase,
  showcaseCatalog,
  applyCommand,
  getView,
  unitStats,
  offerCost,
  stableHash,
} from "../src/game/index";
for (const scenario of showcaseCatalog)
  test(`显式练习 ${scenario.id}：${scenario.title}`, () => {
    const fixture = createShowcase(scenario.id);
    let state = fixture.state;
    const before = getView(state, "p1");
    for (const command of fixture.recommendedCommands) {
      const result = applyCommand(state, "p1", command);
      assert.equal(result.error, undefined);
      state = result.state;
    }
    const own = state.players[0],
      enemy = state.players[1];
    if (scenario.id === "SC01") {
      assert.equal(own.education.jluSignins, 0);
      assert.ok(own.education.jluUltimateUsed);
      assert.equal(
        unitStats(state, own.board[0]).attack,
        before.players[0].board[0].attack + 4,
      );
    }
    if (scenario.id === "SC02") {
      assert.ok(own.education.secondaryUsed);
      assert.equal(
        own.board[0].modifiers.reduce((n, m) => n + m.attack, 0),
        6,
      );
      assert.equal(own.board[0].damage, 1);
    }
    if (scenario.id === "SC03") {
      assert.equal(enemy.board.length, 0);
      assert.equal(enemy.hand[0].offer?.ageStage, 3);
      assert.ok(enemy.education.jluUltimateUsed);
      assert.equal(enemy.mind, 24);
    }
    if (scenario.id === "SC04") {
      assert.equal(own.board[0].ageStage, 3);
      assert.ok(!own.board[0].tags.includes("frontline"));
      assert.equal(own.board[0].notice, undefined);
    }
    if (scenario.id === "SC05") {
      assert.equal(own.timeRemaining, 0);
      assert.equal(own.education.referralDiscount, 0);
      assert.equal(own.education.returnTicket, null);
      assert.equal(own.board[0].ageStage, 2);
      assert.equal(own.board[0].damage, 0);
    }
    const clone = createShowcase(scenario.id);
    assert.equal(stableHash(clone.state), stableHash(fixture.state));
  });
test("场景夹具只在显式调用时创建，可使用自定义双方身份", () => {
  assert.throws(() => createShowcase("BAD" as any));
  const s = createShowcase("SC01", "alice", "bob", {
    matchId: "practice-1",
    seed: 42,
  }).state;
  assert.equal(s.activePlayerId, "alice");
  assert.equal(s.matchId, "practice-1");
  assert.equal(s.players[1].id, "bob");
});
