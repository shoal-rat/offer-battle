import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dragActions,
  commandsForDrop,
  dropNeedsTarget,
} from "../src/components/card-drag-model";
import type { Command } from "../src/game/types";

test("drag eligibility uses only the current authorized hand or Offer actions", () => {
  const allowed: Command[] = [
    { type: "PLAY_CARD", cardId: "h1", targetId: "enemy" },
    { type: "PLAY_CARD", cardId: "h2" },
    { type: "DEPLOY_OFFER", offerId: "E1" },
    { type: "NEGOTIATE", offerId: "E1", sacrificeId: "E2" },
    { type: "ATTACK", cardId: "h1", targetId: "enemy" },
  ];
  assert.deepEqual(
    dragActions({ kind: "hand", id: "h1", label: "手牌" }, allowed),
    [allowed[0]],
  );
  assert.deepEqual(
    dragActions({ kind: "offer", id: "E1", label: "Offer" }, allowed),
    [allowed[2]],
  );
  assert.deepEqual(
    dragActions(
      { kind: "hand", id: "returned", offerId: "E1", label: "回手Offer" },
      allowed,
    ),
    [allowed[2]],
  );
  assert.deepEqual(
    dragActions(
      { kind: "offer", id: "E1", label: "不可支付", disabled: true },
      allowed,
    ),
    [],
  );
  assert.deepEqual(
    dragActions({ kind: "hand", id: "h1", label: "教程此步未允许" }, []),
    [],
  );
});
test("friendly row stages targeted cards for the chooser; an exact legal target resolves directly", () => {
  const plain: Command = { type: "PLAY_CARD", cardId: "h1" },
    targeted: Command = {
      type: "PLAY_CARD",
      cardId: "h2",
      targetId: "enemy-unit",
    };
  assert.deepEqual(commandsForDrop([plain], { boardId: "me" }, "me"), [plain]);
  assert.deepEqual(commandsForDrop([plain], { boardId: "enemy" }, "me"), []);
  assert.deepEqual(commandsForDrop([plain], {}, "me"), []);
  assert.deepEqual(commandsForDrop([targeted], { boardId: "me" }, "me"), [
    targeted,
  ]);
  assert.equal(dropNeedsTarget([targeted], { boardId: "me" }), true);
  assert.equal(dropNeedsTarget([plain], { boardId: "me" }), false);
  assert.deepEqual(
    commandsForDrop([targeted], { targetId: "friend-unit" }, "me"),
    [],
  );
  assert.deepEqual(
    commandsForDrop([targeted], { targetId: "enemy-unit" }, "me"),
    [targeted],
  );
  assert.equal(dropNeedsTarget([targeted], { targetId: "enemy-unit" }), false);
  assert.deepEqual(
    commandsForDrop([plain], { targetId: "friend-unit", boardId: "me" }, "me"),
    [plain],
  );
});
test("drop preserves real clause/topic choices for the existing chooser and never invents a multi-target selection", () => {
  const clauses: Command[] = [
    { type: "DEPLOY_OFFER", offerId: "E1", benefitChoice: "attack" },
    { type: "DEPLOY_OFFER", offerId: "E1", benefitChoice: "health" },
  ];
  assert.deepEqual(commandsForDrop(clauses, { boardId: "me" }, "me"), clauses);
  const multi: Command = { type: "USE_SECONDARY", targetIds: ["a", "b"] };
  assert.deepEqual(
    commandsForDrop([multi], { targetId: "a", boardId: "me" }, "me"),
    [multi],
  );
  assert.equal(
    dropNeedsTarget([multi], { targetId: "a", boardId: "me" }),
    true,
  );
  assert.deepEqual(
    commandsForDrop([multi], { targetId: "a", boardId: "enemy" }, "me"),
    [],
  );
  const optional: Command[] = [
    { type: "DEPLOY_OFFER", offerId: "E3" },
    { type: "DEPLOY_OFFER", offerId: "E3", targetId: "friend" },
  ];
  assert.deepEqual(
    commandsForDrop(optional, { boardId: "me" }, "me"),
    optional,
  );
  assert.equal(dropNeedsTarget(optional, { boardId: "me" }), true);
  assert.deepEqual(
    commandsForDrop(optional, { targetId: "friend", boardId: "me" }, "me"),
    [optional[1]],
  );
});
