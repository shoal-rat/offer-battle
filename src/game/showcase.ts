import type { Command, MatchState, Unit } from "./types";
import { createMatch, applyCommand } from "./engine";
import { defaultLoadout } from "./offers";

/** Explicitly selected teaching positions, never part of matchmaking or normal initialization. */
export const showcaseCatalog = [
  {
    id: "SC01",
    title: "校友集合到全校撑腰",
    instructions: [
      "已经集齐两枚公开签到章。",
      "发动「全校撑腰」，选择己方大厂算法岗。",
      "观察 +4 排面、+4 底气，以及主技能转为校友饭局。",
    ],
  },
  {
    id: "SC02",
    title: "本硕连读叠加",
    instructions: [
      "这张国企综合岗已获得第一次母校强化。",
      "发动第二学历「母校再认证」。",
      "两份学历强化合计 +6 / +6，进修本局仅一次。",
    ],
  },
  {
    id: "SC03",
    title: "母校刚到，Offer先下班",
    instructions: [
      "对方的三十五岁大厂算法岗已经获得 +4 / +4。",
      "用「流程重走」收回它。",
      "年龄会保留，强化消失，吉大大招次数不会退回。",
    ],
  },
  {
    id: "SC04",
    title: "三十五岁转管理",
    instructions: [
      "你的三十五岁大厂算法岗收到优化通知。",
      "打出「转管理」，移除一线标签。",
      "结束回合，观察对手回合开始时通知失效。",
    ],
  },
  {
    id: "SC05",
    title: "海外返场减费",
    instructions: [
      "你已经持有一张 2 小时内推便条。",
      "用「跨国调度」收回大厂算法岗，获得专属 1 小时返场便条。",
      "花剩余 2 小时返场：原始 5 − 内推 2 − 返场 1 = 2。",
    ],
  },
] as const;
export type ShowcaseId = (typeof showcaseCatalog)[number]["id"];
export function createShowcase(
  id: ShowcaseId,
  playerId = "p1",
  opponentId = "p2",
  options: { matchId?: string; seed?: number } = {},
) {
  const scenario = showcaseCatalog.find((s) => s.id === id);
  if (!scenario) throw Error("未知练习场景");
  const own = defaultLoadout(playerId, "练习中的你", 0),
    other = defaultLoadout(opponentId, "演示对手", 0);
  own.primaryId =
    id === "SC03"
      ? "H04"
      : id === "SC04"
        ? "H03"
        : id === "SC05"
          ? "H07"
          : "H10";
  if (id === "SC04" || id === "SC05") other.primaryId = "H05";
  own.secondaryId = id === "SC02" ? "S10" : id === "SC05" ? "S02" : "S00";
  let state = createMatch([own, other], options.seed ?? 104729, {
    skipSetup: true,
    matchId: options.matchId ?? `showcase-${id}`,
  });
  const round = id === "SC02" || id === "SC03" ? 6 : 4;
  state.round = round;
  state.topic = "life";
  state.firstPlayerId = playerId;
  state.activePlayerId = playerId;
  for (const p of state.players) {
    p.ownTurn = round;
    p.timeRemaining = 8;
    p.hand = [];
    p.mind = 24;
    p.actedThisTurn = false;
    p.education.usedThisOwnTurn = false;
  }
  const ownerId = id === "SC03" ? opponentId : playerId;
  const offerId = id === "SC02" ? "E02" : "E01";
  state.activePlayerId = ownerId;
  const deployed = applyCommand(state, ownerId, {
    type: "DEPLOY_OFFER",
    offerId,
  });
  if (deployed.error) throw Error(deployed.error);
  state = deployed.state;
  state.activePlayerId = playerId;
  const me = state.players.find((p) => p.id === playerId)!,
    enemy = state.players.find((p) => p.id === opponentId)!;
  const unit = state.players.find((p) => p.id === ownerId)!.board[0];
  unit.deployedTurn = state.players.find((p) => p.id === ownerId)!.ownTurn - 1;
  function age(u: Unit, stage: number) {
    u.ageStage = stage;
    state.players
      .find((p) => p.id === u.ownerId)!
      .offerZone.find((o) => o.id === u.offerId)!.ageStage = stage;
  }
  function handCard(cardId: string) {
    const card = {
      id: `showcase-card-${state.nextId++}`,
      definitionId: cardId,
      kind: "card" as const,
      taxes: [],
      knownTo: [],
    };
    me.hand.push(card);
    return card.id;
  }
  const recommendedCommands: Command[] = [];
  if (id === "SC01") {
    me.education.jluSignins = 2;
    recommendedCommands.push({ type: "USE_PRIMARY", targetId: unit.id });
  }
  if (id === "SC02") {
    me.education.jluUltimateUsed = true;
    unit.modifiers.push({ source: "H10", attack: 4, health: 4 });
    age(unit, 2);
    unit.damage = 1;
    recommendedCommands.push({ type: "USE_SECONDARY", targetId: unit.id });
  }
  if (id === "SC03") {
    enemy.education.jluUltimateUsed = true;
    unit.modifiers.push({ source: "H10", attack: 4, health: 4 });
    age(unit, 3);
    recommendedCommands.push({
      type: "PLAY_CARD",
      cardId: handCard("N12"),
      targetId: unit.id,
    });
  }
  if (id === "SC04") {
    age(unit, 3);
    unit.notice = { by: opponentId, turn: enemy.ownTurn + 1 };
    recommendedCommands.push(
      { type: "PLAY_CARD", cardId: handCard("F03"), targetId: unit.id },
      { type: "END_TURN" },
    );
  }
  if (id === "SC05") {
    me.education.referralDiscount = 2;
    me.education.secondaryUsed = true;
    age(unit, 2);
    unit.damage = 1;
    recommendedCommands.push(
      { type: "USE_PRIMARY", targetId: unit.id },
      { type: "DEPLOY_OFFER", offerId: unit.offerId },
    );
  }
  me.timeRemaining = id === "SC05" ? 4 : round;
  enemy.timeRemaining = 0;
  me.actedThisTurn = false;
  state.version = 0;
  state.events = [];
  state.eventSequence = 0;
  state.processedCommandIds = [];
  state.events.push({
    sequence: ++state.eventSequence,
    type: "showcase_start",
    text: `演示练习：${scenario.title}`,
  });
  return {
    state,
    id: scenario.id,
    title: scenario.title,
    instructions: [...scenario.instructions],
    recommendedCommands,
  };
}
