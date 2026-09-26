import type {
  MatchState,
  PlayerState,
  HandCard,
  Unit,
  Loadout,
  Command,
  GameEvent,
  Topic,
  PendingChoice,
  BattleAnchor,
  BattleVisualCue,
  BattleChange,
} from "./types";
import { cardById, education, templateById, benefitById } from "./catalog";
import { validateLoadout } from "./offers";
const requireRule = (condition: unknown, text: string): void => {
  if (!condition) throw Error(text);
};
export const getPlayer = (s: MatchState, id: string) =>
  s.players.find((p) => p.id === id)!;
export const getEnemy = (s: MatchState, id: string) =>
  s.players.find((p) => p.id !== id)!;
const uid = (s: MatchState, prefix: string) => `${prefix}-${s.nextId++}`;
function unitAnchor(s: MatchState, unit: Unit): BattleAnchor {
  const owner = getPlayer(s, unit.ownerId);
  const definition = owner.offerZone.find(
    (o) => o.id === unit.offerId,
  )?.definition;
  return {
    kind: "unit",
    id: unit.id,
    playerId: unit.ownerId,
    slot: owner.board.findIndex((u) => u.id === unit.id),
    name: unit.name,
    definitionId: unit.definitionId,
    ...(unit.templateId ? { templateId: unit.templateId } : {}),
    ...(definition?.artId ? { artId: definition.artId } : {}),
  };
}
function anchor(s: MatchState, id?: string): BattleAnchor | undefined {
  if (!id) return undefined;
  const player = s.players.find((p) => p.id === id);
  if (player) return { kind: "hero", id, playerId: id, name: player.name };
  const unit = s.players.flatMap((p) => p.board).find((u) => u.id === id);
  return unit ? unitAnchor(s, unit) : undefined;
}
function defaultVisual(
  s: MatchState,
  type: string,
  text: string,
  event: Partial<GameEvent>,
): BattleVisualCue | undefined {
  const source = anchor(s, event.actorId),
    target = anchor(s, event.targetId);
  const common = {
    label: text,
    ...(source
      ? { source, sourceId: source.id, playerId: source.playerId }
      : {}),
    ...(target ? { target, targetId: target.id } : {}),
    ...(event.amount !== undefined ? { amount: event.amount } : {}),
    ...(event.cardId ? { cardId: event.cardId } : {}),
  };
  if (type === "draw" && event.actorId) {
    const playerId = event.actorId;
    return {
      kind: "draw",
      label: text,
      playerId,
      sourceId: `${playerId}:deck`,
      targetId: `${playerId}:hand`,
      source: { kind: "deck", id: `${playerId}:deck`, playerId },
      target: { kind: "hand", id: `${playerId}:hand`, playerId },
    };
  }
  if (type === "covered" && event.actorId) {
    const playerId = event.actorId;
    return {
      kind: "covered",
      label: text,
      playerId,
      sourceId: playerId,
      targetId: `${playerId}:retort`,
      source: anchor(s, playerId),
      target: { kind: "retort", id: `${playerId}:retort`, playerId },
    };
  }
  if (type === "heal" || type === "damage" || type === "fatigue")
    return {
      ...common,
      kind: type === "heal" ? "heal" : "damage",
      ...(type === "fatigue" ? { effectId: "fatigue" } : {}),
      ...(target && event.amount !== undefined
        ? {
            changes: [
              {
                targetId: target.id,
                playerId: target.playerId,
                stat: target.kind === "hero" ? "mind" : "health",
                amount: (type === "heal" ? 1 : -1) * event.amount,
              } as BattleChange,
            ],
          }
        : {}),
    };
  if (type === "deploy" || type === "summon")
    return { ...common, kind: "deploy" };
  if (type === "play") return { ...common, kind: "card" };
  if (type === "retort" && event.actorId)
    return {
      ...common,
      kind: "retort",
      sourceId: `${event.actorId}:retort`,
      source: {
        kind: "retort",
        id: `${event.actorId}:retort`,
        playerId: event.actorId,
      },
      targetId: event.actorId,
      target: source,
    };
  if (type === "topic") return { ...common, kind: "topic", effectId: s.topic };
  if (type === "turn_start")
    return { ...common, kind: "turn", targetId: event.actorId, target: source };
  if (type === "result") {
    const winner = anchor(s, s.result?.winnerId ?? undefined);
    return {
      ...common,
      kind: "result",
      ...(winner
        ? { targetId: winner.id, target: winner, playerId: winner.playerId }
        : {}),
      effectId: s.result?.winnerId ? "winner" : "draw",
    };
  }
  if (
    [
      "protection",
      "notice",
      "notice_expired",
      "management",
      "optimization",
      "freeze",
      "equity_disabled",
      "age",
      "jlu_signin",
      "cancel",
      "negotiate",
    ].includes(type)
  )
    return { ...common, kind: "status", effectId: type };
  return undefined;
}
const log = (
  s: MatchState,
  type: string,
  text: string,
  extra: Partial<GameEvent> = {},
) => {
  const visual = extra.visual ?? defaultVisual(s, type, text, extra);
  s.events.push({
    sequence: ++s.eventSequence,
    type,
    text,
    ...extra,
    ...(visual
      ? {
          visual: {
            ...visual,
            label: visual.label ?? text,
            ...(visual.changes
              ? {
                  changes: visual.changes.map((change) => ({
                    ...change,
                    amount: Object.is(change.amount, -0) ? 0 : change.amount,
                  })),
                }
              : {}),
          },
        }
      : {}),
  });
};
function random(s: MatchState): number {
  let x = s.rngState || 1;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  s.rngState = x >>> 0;
  return s.rngState / 4294967296;
}
function shuffle<T>(s: MatchState, a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random(s) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export const defaultTopic = (round: number): Topic =>
  round < 4 ? "salary" : round < 7 ? "life" : "future";
export function unitStats(s: MatchState, u: Unit) {
  let attack = u.baseAttack,
    maxHealth = u.baseHealth;
  if (u.kind === "offer") {
    if (u.templateId === "T04") {
      if (u.ageStage >= 2) attack += 2;
      if (u.ageStage === 3) maxHealth += 2;
    }
    if (u.templateId === "T10") attack += u.ageStage;
    if (u.benefitId === "B04" && !u.equityDisabled)
      attack += u.ageStage === 3 ? 3 : u.ageStage === 2 ? 2 : 0;
    if (s.topic === "salary" && u.originalTime >= 5) attack++;
    if (s.topic === "future" && u.ageStage >= 2) attack++;
  }
  for (const m of u.modifiers) {
    attack += m.attack;
    maxHealth += m.health;
  }
  maxHealth = Math.max(1, maxHealth);
  return {
    attack: Math.max(0, attack),
    maxHealth,
    health: maxHealth - u.damage,
  };
}
export function offerCost(
  p: PlayerState,
  o: PlayerState["offerZone"][number],
  negotiation = 0,
): number {
  const hand = p.hand.find((h) => h.kind === "offer" && h.offer?.id === o.id);
  const tax = hand
    ? Math.max(
        0,
        ...hand.taxes
          .filter((t) => t.untilTurn === p.ownTurn)
          .map((t) => t.amount),
      )
    : 0;
  return Math.max(
    1,
    o.definition.originalTime +
      tax -
      negotiation -
      (o.definition.originalTime >= 5 ? p.education.referralDiscount : 0) -
      (hand && p.education.returnTicket?.offerId === o.id
        ? p.education.returnTicket.discount
        : 0),
  );
}
export function handCost(p: PlayerState, c: HandCard): number {
  if (c.kind === "offer") return offerCost(p, c.offer!);
  return (
    cardById[c.definitionId].time_cost +
    Math.max(
      0,
      ...c.taxes.filter((t) => t.untilTurn === p.ownTurn).map((t) => t.amount),
    )
  );
}
function finish(s: MatchState, winnerId: string | null, reason: string) {
  s.result = { winnerId, reason };
  s.phase = "finished";
  s.pendingChoice = null;
  log(
    s,
    "result",
    winnerId
      ? `${getPlayer(s, winnerId).name}获胜：${reason}`
      : `平局：${reason}`,
  );
}
function checkVictory(s: MatchState) {
  if (s.result) return;
  const dead = s.players.filter((p) => p.mind <= 0);
  if (dead.length)
    finish(
      s,
      dead.length === 2 ? null : getEnemy(s, dead[0].id).id,
      "心态归零",
    );
}
function heal(s: MatchState, p: PlayerState, n: number, sourceId = p.id) {
  const actual = Math.min(n, 30 - p.mind);
  p.mind += actual;
  if (actual)
    log(s, "heal", `${p.name}恢复${actual}点心态`, {
      targetId: p.id,
      actorId: p.id,
      amount: actual,
      visual: {
        kind: "heal",
        sourceId,
        targetId: p.id,
        playerId: p.id,
        source: anchor(s, sourceId),
        target: anchor(s, p.id),
        amount: actual,
        changes: [
          { targetId: p.id, playerId: p.id, stat: "mind", amount: actual },
        ],
      },
    });
}
function healUnit(s: MatchState, u: Unit, n: number, actorId: string) {
  const actual = Math.min(u.damage, n);
  u.damage -= actual;
  if (actual)
    log(s, "heal", `${u.name}恢复${actual}点底气`, {
      actorId,
      targetId: u.id,
      amount: actual,
    });
}
function mindDamage(
  s: MatchState,
  p: PlayerState,
  n: number,
  actorId: string,
  effectId?: string,
) {
  p.mind -= n;
  log(s, "damage", `${p.name}失去${n}点心态`, {
    actorId,
    targetId: p.id,
    amount: n,
    visual: {
      kind: "damage",
      sourceId: actorId,
      targetId: p.id,
      playerId: actorId,
      source: anchor(s, actorId),
      target: anchor(s, p.id),
      amount: n,
      effectId,
      changes: [{ targetId: p.id, playerId: p.id, stat: "mind", amount: -n }],
    },
  });
}
function freeze(s: MatchState, u: Unit, actorId: string, sourceId = actorId) {
  u.frozenUntilTurn = Math.max(
    u.frozenUntilTurn,
    getPlayer(s, u.ownerId).ownTurn + 1,
  );
  log(s, "freeze", `${u.name}下个回合暂停开怼`, {
    actorId,
    targetId: u.id,
    visual: {
      kind: "status",
      sourceId,
      targetId: u.id,
      playerId: actorId,
      source: anchor(s, sourceId),
      target: unitAnchor(s, u),
      effectId: "freeze",
    },
  });
}
function discard(s: MatchState, p: PlayerState, c: HandCard, reason = "弃置") {
  p.discard.push(c);
  if (c.offer) {
    const o = p.offerZone.find((o) => o.id === c.offer!.id);
    if (o) o.status = "discard";
  }
  log(
    s,
    "discard",
    `${p.name}${reason}了${c.offer?.definition.name || cardById[c.definitionId]?.name || "卡牌"}`,
    { actorId: p.id, cardId: c.definitionId },
  );
}
function give(s: MatchState, p: PlayerState, c: HandCard) {
  if (p.hand.length >= 8) discard(s, p, c, "手牌已满，公开弃置");
  else p.hand.push(c);
}
function draw(s: MatchState, p: PlayerState, n = 1) {
  for (let i = 0; i < n && !s.result; i++) {
    const c = p.deck.shift();
    if (c) {
      give(s, p, c);
      log(s, "draw", `${p.name}抽取一张牌`, { actorId: p.id });
    } else {
      p.fatigue++;
      p.mind -= p.fatigue;
      log(s, "fatigue", `${p.name}焦虑${p.fatigue}，失去${p.fatigue}点心态`, {
        targetId: p.id,
        amount: p.fatigue,
      });
      checkVictory(s);
    }
  }
}
function removeDead(s: MatchState, forced: string[] = []) {
  const locations = new Map(
    s.players.flatMap((p) => p.board).map((u) => [u.id, unitAnchor(s, u)]),
  );
  for (const p of s.players) {
    for (const u of [...p.board]) {
      if (unitStats(s, u).health <= 0 || forced.includes(u.id)) {
        p.board = p.board.filter((x) => x.id !== u.id);
        if (u.kind === "offer") {
          p.mind -= 2;
          const o = p.offerZone.find((o) => o.id === u.offerId)!;
          o.ageStage = u.ageStage;
          o.status = "discard";
        }
        if (u.card) p.discard.push(u.card);
        log(
          s,
          "retire",
          `${u.name}退场${u.kind === "offer" ? "，" + p.name + "失去2点心态" : ""}`,
          {
            actorId: p.id,
            targetId: u.id,
            visual: {
              kind: "retire",
              sourceId: u.id,
              targetId: u.id,
              playerId: p.id,
              source: locations.get(u.id),
              target: locations.get(u.id),
              label: `${u.name}退场`,
              changes:
                u.kind === "offer"
                  ? [
                      {
                        targetId: p.id,
                        playerId: p.id,
                        stat: "mind",
                        amount: -2,
                      },
                    ]
                  : [],
            },
          },
        );
      }
    }
  }
  checkVictory(s);
}
function damageUnits(
  s: MatchState,
  units: Unit[],
  n: number,
  source: "action" | "hero" | "battle",
  actorId: string,
  sourceId = actorId,
) {
  for (const u of units) {
    let d = n;
    if (
      source === "action" &&
      u.ownerId !== actorId &&
      u.benefitId === "B07" &&
      !u.protectionUsed
    ) {
      d = Math.max(0, d - 2);
      u.protectionUsed = true;
      log(s, "protection", `${u.name}的保障条款抵挡伤害`, { targetId: u.id });
    }
    u.damage += d;
    log(s, "damage", `${u.name}失去${d}点底气`, {
      actorId,
      targetId: u.id,
      amount: d,
      visual: {
        kind: "damage",
        sourceId,
        targetId: u.id,
        playerId: actorId,
        source: anchor(s, sourceId),
        target: unitAnchor(s, u),
        amount: d,
        changes: [
          { targetId: u.id, playerId: u.ownerId, stat: "health", amount: -d },
        ],
      },
    });
  }
  removeDead(s);
}
function bounce(s: MatchState, u: Unit) {
  const p = getPlayer(s, u.ownerId);
  const location = unitAnchor(s, u);
  p.board = p.board.filter((x) => x.id !== u.id);
  if (u.kind === "offer") {
    const o = p.offerZone.find((o) => o.id === u.offerId)!;
    o.ageStage = u.ageStage;
    o.status = "hand";
    give(s, p, {
      id: uid(s, "hand"),
      definitionId: o.definition.id,
      kind: "offer",
      offer: o,
      taxes: [],
      knownTo: s.players.map((p) => p.id),
    });
  } else if (u.kind === "support" && u.card) {
    u.card.taxes = [];
    u.card.knownTo = s.players.map((p) => p.id);
    give(s, p, u.card);
  }
  log(s, "bounce", `${u.name}被收回${u.kind === "token" ? "并消失" : ""}`, {
    targetId: u.id,
    actorId: s.activePlayerId,
    visual: {
      kind: "bounce",
      sourceId: u.id,
      targetId: u.kind === "token" ? p.id : `${p.id}:hand`,
      playerId: p.id,
      source: location,
      target:
        u.kind === "token"
          ? anchor(s, p.id)
          : { kind: "hand", id: `${p.id}:hand`, playerId: p.id },
      effectId: u.kind === "token" ? "token_vanish" : "return_to_hand",
      label: `收回${u.name}`,
    },
  });
}
function buff(
  s: MatchState,
  u: Unit,
  attack: number,
  health: number,
  source: string,
  expiresOwnerTurn?: number,
) {
  const before = unitStats(s, u);
  u.modifiers.push({
    attack,
    health,
    source,
    ...(expiresOwnerTurn === undefined ? {} : { expiresOwnerTurn }),
  });
  const after = unitStats(s, u),
    sourceAnchor =
      (source === "B06" ? unitAnchor(s, u) : anchor(s, source)) ??
      anchor(
        s,
        source === "F06" ? getEnemy(s, u.ownerId).id : s.activePlayerId,
      );
  const changes: BattleChange[] = [];
  if (after.attack !== before.attack)
    changes.push({
      targetId: u.id,
      playerId: u.ownerId,
      stat: "attack",
      amount: after.attack - before.attack,
    });
  if (after.maxHealth !== before.maxHealth)
    changes.push(
      {
        targetId: u.id,
        playerId: u.ownerId,
        stat: "maxHealth",
        amount: after.maxHealth - before.maxHealth,
      },
      {
        targetId: u.id,
        playerId: u.ownerId,
        stat: "health",
        amount: after.health - before.health,
      },
    );
  log(s, "buff", `${u.name}的属性发生变化`, {
    actorId: sourceAnchor?.playerId,
    targetId: u.id,
    visual: {
      kind: "buff",
      sourceId: sourceAnchor?.id,
      targetId: u.id,
      playerId: sourceAnchor?.playerId,
      source: sourceAnchor,
      target: unitAnchor(s, u),
      effectId: source,
      changes,
      amount: after.attack - before.attack,
      label: `${u.name} · 属性变化`,
    },
  });
}
function unitBase(s: MatchState, p: PlayerState): Unit {
  return {
    id: uid(s, "unit"),
    ownerId: p.id,
    definitionId: "",
    name: "",
    kind: "support",
    originalTime: 0,
    baseAttack: 1,
    baseHealth: 1,
    damage: 0,
    ageStage: 0,
    tags: [],
    modifiers: [],
    deployedTurn: p.ownTurn,
    attacked: false,
    rush: false,
    taunt: false,
    frozenUntilTurn: 0,
    managed: false,
    equityDisabled: false,
    protectionUsed: false,
  };
}
function token(
  s: MatchState,
  p: PlayerState,
  attack: number,
  health: number,
  rush = false,
  name = "实习生",
) {
  const u = {
    ...unitBase(s, p),
    kind: "token" as const,
    definitionId: rush ? "K03" : name === "临时同事" ? "K02" : "K01",
    originalTime: rush || name === "临时同事" ? 2 : 1,
    name,
    baseAttack: attack,
    baseHealth: health,
    rush,
  };
  p.board.push(u);
  log(s, "summon", `${p.name}召唤${name}`, { actorId: p.id, targetId: u.id });
  return u;
}
function makeChoice(
  s: MatchState,
  p: PlayerState,
  kind: PendingChoice["kind"],
  cards: HandCard[],
  extra: Partial<PendingChoice> = {},
) {
  s.pendingChoice = {
    id: uid(s, "choice"),
    ownerId: p.id,
    kind,
    options: cards.map((c) => ({
      id: c.id,
      label: c.offer?.definition.name || cardById[c.definitionId].name,
      card: structuredClone(c),
    })),
    ...extra,
  };
}
function turnStart(s: MatchState, p: PlayerState) {
  p.ownTurn++;
  for (const owner of s.players) {
    for (const u of [...owner.board])
      if (u.notice?.by === p.id && u.notice.turn <= p.ownTurn) {
        delete u.notice;
        if (
          u.kind === "offer" &&
          u.ageStage === 3 &&
          u.tags.includes("frontline")
        ) {
          log(s, "optimization", `${u.name}的优化通知生效`, { targetId: u.id });
          removeDead(s, [u.id]);
        } else
          log(s, "notice_expired", `${u.name}的优化通知失效`, {
            targetId: u.id,
          });
        if (s.result) return;
      }
  }
  for (const u of p.board) {
    if (u.kind === "offer") {
      const previous = u.ageStage,
        before = unitStats(s, u);
      u.ageStage = Math.min(3, u.ageStage + 1);
      p.offerZone.find((o) => o.id === u.offerId)!.ageStage = u.ageStage;
      if (previous !== u.ageStage) {
        const after = unitStats(s, u),
          changes: BattleChange[] = [];
        if (after.attack !== before.attack)
          changes.push({
            targetId: u.id,
            playerId: p.id,
            stat: "attack",
            amount: after.attack - before.attack,
          });
        if (after.maxHealth !== before.maxHealth)
          changes.push(
            {
              targetId: u.id,
              playerId: p.id,
              stat: "maxHealth",
              amount: after.maxHealth - before.maxHealth,
            },
            {
              targetId: u.id,
              playerId: p.id,
              stat: "health",
              amount: after.health - before.health,
            },
          );
        log(s, "age", `${u.name}成长到${[22, 27, 31, 35][u.ageStage]}岁`, {
          actorId: p.id,
          targetId: u.id,
          visual: {
            kind: "status",
            sourceId: u.id,
            targetId: u.id,
            playerId: p.id,
            source: unitAnchor(s, u),
            target: unitAnchor(s, u),
            effectId: "age",
            changes,
            label: `${[22, 27, 31, 35][u.ageStage]}岁`,
          },
        });
      }
    }
    u.attacked = false;
  }
  p.timeRemaining = Math.min(8, s.round);
  p.education.usedThisOwnTurn = false;
  p.actedThisTurn = false;
  log(s, "turn_start", `${p.name}的第${s.round}轮 · ${p.timeRemaining}小时`, {
    actorId: p.id,
  });
  draw(s, p);
}
function turnEnd(s: MatchState, p: PlayerState) {
  for (const u of p.board) if (u.benefitId === "B01") heal(s, p, 1, u.id);
  if (
    s.topic === "life" &&
    p.board.some((u) => ["B01", "B02", "B03"].includes(u.benefitId || ""))
  )
    heal(s, p, 1);
  for (const u of p.board) {
    u.modifiers = u.modifiers.filter(
      (m) => m.expiresOwnerTurn === undefined || m.expiresOwnerTurn > p.ownTurn,
    );
    if (u.frozenUntilTurn <= p.ownTurn) u.frozenUntilTurn = 0;
  }
  for (const c of p.hand)
    c.taxes = c.taxes.filter((t) => t.untilTurn > p.ownTurn);
  if (
    p.education.returnTicket &&
    p.education.returnTicket.expiresAfterOwnerTurnIndex <= p.ownTurn
  )
    p.education.returnTicket = null;
  log(s, "turn_end", `${p.name}结束回合`, { actorId: p.id });
  if (p.id !== s.firstPlayerId) {
    if (s.round >= 12) {
      const [a, b] = s.players;
      finish(
        s,
        a.mind === b.mind ? null : a.mind > b.mind ? a.id : b.id,
        "第12轮结算",
      );
      return;
    }
    s.round++;
    s.topic = defaultTopic(s.round);
  }
  s.activePlayerId = getEnemy(s, p.id).id;
  turnStart(s, getPlayer(s, s.activePlayerId));
}
function deal(s: MatchState) {
  for (const p of s.players) {
    p.deck = shuffle(
      s,
      [...p.baseDeck, ...p.flexDeck].map((id) => ({
        id: uid(s, "card"),
        definitionId: id,
        kind: "card" as const,
        taxes: [],
        knownTo: [],
      })),
    );
    draw(s, p, p.id === s.firstPlayerId ? 3 : 4);
  }
  s.phase = "mulligan";
}
export function createMatch(
  loadouts: [Loadout, Loadout],
  seed = 1,
  options: { skipSetup?: boolean; matchId?: string } = {},
): MatchState {
  loadouts.forEach(validateLoadout);
  requireRule(
    loadouts[0].playerId !== loadouts[1].playerId,
    "玩家身份必须不同",
  );
  const s: MatchState = {
    rulesVersion: "2.0.0",
    matchId: options.matchId || "local-match",
    version: 0,
    round: 1,
    activePlayerId: "",
    firstPlayerId: "",
    phase: "flex",
    players: loadouts.map((l) => ({
      id: l.playerId,
      name: l.name,
      mind: 30,
      timeRemaining: 0,
      ownTurn: 0,
      hand: [],
      deck: [],
      discard: [],
      offerZone: l.offers.map((o) => ({
        id: o.id,
        definition: structuredClone(o),
        ageStage: 0,
        everDeployed: false,
        status: "available",
      })),
      board: [],
      retort: null,
      fatigue: 0,
      negotiationUsed: false,
      education: {
        primaryId: l.primaryId,
        secondaryId: l.secondaryId,
        usedThisOwnTurn: false,
        secondaryUsed: false,
        referralDiscount: 0,
        returnTicket: null,
        jluSignins: 0,
        jluUltimateUsed: false,
      },
      baseDeck: [...l.baseDeck],
      flexDeck: [...l.flexDeck],
      flexReady: false,
      mulliganReady: false,
      inactiveTurns: 0,
      actedThisTurn: false,
    })),
    topic: "salary",
    rngState: seed >>> 0 || 1,
    nextId: 1,
    pendingChoice: null,
    events: [],
    eventSequence: 0,
    result: null,
    processedCommandIds: [],
  };
  s.firstPlayerId = s.players[Math.floor(random(s) * 2)].id;
  s.activePlayerId = s.firstPlayerId;
  log(s, "match_start", "工资先亮，底牌后出。");
  if (options.skipSetup) {
    s.players.forEach((p) => {
      p.flexReady = true;
      p.mulliganReady = true;
    });
    deal(s);
    s.phase = "playing";
    turnStart(s, getPlayer(s, s.activePlayerId));
  }
  return s;
}
function validateOptionalDeployTarget(
  s: MatchState,
  p: PlayerState,
  templateId: string | undefined,
  c: Command,
) {
  if (!c.targetId) return;
  const friendly = p.board.find((u) => u.id === c.targetId);
  const enemy = getEnemy(s, p.id).board.find((u) => u.id === c.targetId);
  if (templateId === "T03" || templateId === "N06")
    requireRule(friendly?.kind === "offer", "请选择自己的其他Offer");
  else if (templateId === "T05") requireRule(friendly, "请选择自己的其他角色");
  else if (templateId === "T07" || templateId === "T08")
    requireRule(enemy, "请选择敌方角色");
  else requireRule(false, "此角色上桌无需目标");
}
function deploy(
  s: MatchState,
  p: PlayerState,
  o: PlayerState["offerZone"][number],
  c: Command,
  discount = 0,
) {
  requireRule(p.board.length < 4, "场上位置已满");
  requireRule(
    o.status === "available" || o.status === "hand",
    "这张Offer不在可用区",
  );
  validateOptionalDeployTarget(s, p, o.definition.templateId, c);
  const cost = offerCost(p, o, discount);
  requireRule(p.timeRemaining >= cost, "时间不足");
  p.timeRemaining -= cost;
  if (o.definition.originalTime >= 5) p.education.referralDiscount = 0;
  if (o.status === "hand" && p.education.returnTicket?.offerId === o.id)
    p.education.returnTicket = null;
  p.hand = p.hand.filter((h) => h.offer?.id !== o.id);
  o.status = "board";
  o.everDeployed = true;
  const d = o.definition;
  const u: Unit = {
    ...unitBase(s, p),
    definitionId: d.id,
    name: d.name,
    kind: "offer",
    offerId: o.id,
    originalTime: d.originalTime,
    baseAttack: d.baseAttack,
    baseHealth: d.baseHealth,
    ageStage: o.ageStage,
    templateId: d.templateId,
    benefitId: d.benefitId,
    tags: [...d.tags],
    rush: d.benefitId === "B02",
    taunt: d.templateId === "T02",
  };
  p.board.push(u);
  log(s, "deploy", `${p.name}让${u.name}上桌`, {
    actorId: p.id,
    targetId: u.id,
    cardId: d.templateId,
  });
  enterEffect(s, p, u, c);
}
function enterEffect(s: MatchState, p: PlayerState, u: Unit, c: Command) {
  const friendly = p.board.find((x) => x.id === c.targetId),
    enemy = getEnemy(s, p.id).board.find((x) => x.id === c.targetId);
  switch (u.templateId || u.definitionId) {
    case "T00":
      heal(s, p, 1, u.id);
      break;
    case "T03":
    case "N06":
      if (friendly) bounce(s, friendly);
      break;
    case "T05":
      if (friendly) buff(s, friendly, 1, 1, u.id);
      break;
    case "T07":
      if (enemy) damageUnits(s, [enemy], 2, "hero", p.id, u.id);
      break;
    case "T08":
      if (enemy) freeze(s, enemy, p.id, u.id);
      break;
    case "N04":
      draw(s, p);
      break;
    case "T09":
      if (!p.deck.length) draw(s, p);
      else makeChoice(s, p, "consult", p.deck.slice(0, 3));
      break;
  }
  if (s.result) return;
  switch (u.benefitId) {
    case "B03":
      heal(s, p, 2, u.id);
      break;
    case "B05":
      if (s.pendingChoice)
        (s.pendingChoice as PendingChoice & { drawAfter?: boolean }).drawAfter =
          true;
      else draw(s, p);
      break;
    case "B06":
      if (c.benefitChoice === "attack") buff(s, u, 1, 0, "B06");
      else if (c.benefitChoice === "health") buff(s, u, 0, 2, "B06");
      else if (!s.pendingChoice)
        s.pendingChoice = {
          id: uid(s, "choice"),
          ownerId: p.id,
          kind: "benefit",
          unitId: u.id,
          options: [
            { id: "attack", label: "排面 +1" },
            { id: "health", label: "底气上限与当前底气 +2" },
          ],
        };
      else
        (
          s.pendingChoice as PendingChoice & { queuedBenefit?: string }
        ).queuedBenefit = u.id;
      break;
  }
}
function useEducation(s: MatchState, p: PlayerState, c: Command) {
  const e = p.education,
    secondary = c.type === "USE_SECONDARY",
    id = secondary ? e.secondaryId : e.primaryId;
  const def = (secondary ? education.secondary : education.primary).find(
    (x) => x.id === id,
  )!;
  requireRule(!e.usedThisOwnTurn, "本回合学历行动已使用");
  requireRule(
    !secondary || (s.round >= 4 && !e.secondaryUsed),
    "进修技能第4轮解锁，每局一次",
  );
  requireRule(p.timeRemaining >= def.time_cost, "时间不足");
  const enemy = getEnemy(s, p.id);
  const target = p.board.find((u) => u.id === c.targetId),
    foe = enemy.board.find((u) => u.id === c.targetId);
  const ids = c.targetIds || (c.targetId ? [c.targetId] : []);
  const hc = p.hand.find((x) => x.id === c.cardId);
  switch (id) {
    case "H01":
    case "S01":
      requireRule(enemy.hand.length, "对手空手，无法查看");
      break;
    case "H02":
      requireRule(!e.referralDiscount, "已持有内推便条");
      break;
    case "H03":
    case "S03":
      requireRule(target, "请选择友方角色");
      break;
    case "H05":
    case "S05":
      requireRule(
        target || (!p.board.length && !c.targetId),
        "请选择友方角色恢复底气",
      );
      break;
    case "H06":
    case "S06":
      requireRule(p.board.length < 4, "场上位置已满");
      break;
    case "H07":
    case "S07":
      requireRule(target?.kind === "offer", "请选择友方Offer");
      requireRule(p.hand.length < 8, "手牌已满");
      if (id === "H07") requireRule(!e.returnTicket, "已持有返场便条");
      break;
    case "H08":
      requireRule(
        target?.kind === "support" || target?.kind === "token",
        "请选择助阵角色",
      );
      break;
    case "H09":
      requireRule(
        hc?.kind === "card" && p.deck.length,
        "请选择通用手牌，且牌库须非空",
      );
      break;
    case "H10":
      if (e.jluSignins >= 2 && !e.jluUltimateUsed)
        requireRule(target?.kind === "offer", "全校撑腰需要友方Offer");
      break;
    case "S08":
      requireRule(
        ids.length >= 1 &&
          ids.length <= 2 &&
          new Set(ids).size === ids.length &&
          ids.every((id) => p.board.some((u) => u.id === id)),
        "请选择1至2个不同友方角色",
      );
      break;
    case "S09":
      requireRule(foe, "请选择敌方角色");
      break;
    case "S10":
      requireRule(target?.kind === "offer", "请选择友方Offer");
      break;
  }
  p.timeRemaining -= def.time_cost;
  e.usedThisOwnTurn = true;
  if (secondary) e.secondaryUsed = true;
  const educationTargets = ids
    .map((id) => anchor(s, id))
    .filter((a): a is BattleAnchor => !!a);
  const educationTarget = educationTargets[0] ?? anchor(s, p.id);
  const educationEffect =
    id === "H10"
      ? e.jluUltimateUsed
        ? "jlu_meal"
        : e.jluSignins === 2
          ? "jlu_ultimate"
          : "jlu_signin"
      : id;
  log(s, "education", `${p.name}发动${def.skill}`, {
    actorId: p.id,
    cardId: id,
    targetId: c.targetId,
    visual: {
      kind: secondary ? "secondary_skill" : "primary_skill",
      sourceId: p.id,
      targetId: educationTarget?.id,
      playerId: p.id,
      source: anchor(s, p.id),
      target: educationTarget,
      targets: educationTargets,
      educationId: id,
      cardId: id,
      effectId: educationEffect,
      label:
        id === "H10"
          ? educationEffect === "jlu_ultimate"
            ? "全校撑腰"
            : educationEffect === "jlu_meal"
              ? "校友饭局"
              : "校友集合"
          : def.skill,
    },
  });
  switch (id) {
    case "H01":
    case "S01":
      for (const card of enemy.hand)
        if (!card.knownTo.includes(p.id)) card.knownTo.push(p.id);
      makeChoice(s, p, "tax", enemy.hand, { amount: id === "H01" ? 1 : 2 });
      break;
    case "H02":
      e.referralDiscount = 1;
      if (p.deck.length) makeChoice(s, p, "scry", p.deck.slice(0, 3));
      break;
    case "H03":
      buff(s, target!, 2, 0, id, p.ownTurn);
      mindDamage(s, p, 1, p.id, id);
      checkVictory(s);
      break;
    case "H04":
      draw(s, p);
      break;
    case "H05":
      if (target) healUnit(s, target, 2, p.id);
      heal(s, p, 1);
      break;
    case "H06":
      token(s, p, p.board.length < enemy.board.length ? 2 : 1, 2);
      break;
    case "H07": {
      const offerId = target!.offerId!;
      bounce(s, target!);
      e.returnTicket = {
        offerId,
        discount: 1,
        expiresAfterOwnerTurnIndex: p.ownTurn + 1,
      };
      break;
    }
    case "H08":
      buff(s, target!, 1, 1, id);
      break;
    case "H09":
      p.hand = p.hand.filter((x) => x.id !== hc!.id);
      hc!.knownTo = [];
      p.deck.push(hc!);
      draw(s, p);
      break;
    case "H10":
      if (e.jluUltimateUsed) heal(s, p, 2);
      else if (e.jluSignins < 2) {
        heal(s, p, 1);
        e.jluSignins++;
        log(s, "jlu_signin", `${p.name}获得第${e.jluSignins}枚吉大签到章`, {
          actorId: p.id,
        });
      } else {
        buff(s, target!, 4, 4, id);
        e.jluSignins = 0;
        e.jluUltimateUsed = true;
        log(s, "jlu_ultimate", "全校撑腰！宇宙吉大，校友到场！", {
          actorId: p.id,
          targetId: target!.id,
        });
      }
      break;
    case "S00":
      heal(s, p, 2);
      draw(s, p);
      break;
    case "S02":
      e.referralDiscount = Math.max(2, e.referralDiscount);
      heal(s, p, 2);
      break;
    case "S03":
      buff(s, target!, 2, 2, id);
      mindDamage(s, p, 1, p.id, id);
      checkVictory(s);
      break;
    case "S04":
      draw(s, p, 2);
      break;
    case "S05":
      if (target) healUnit(s, target, 3, p.id);
      heal(s, p, 3);
      break;
    case "S06":
      token(s, p, 2, 3, true, "项目搭子");
      break;
    case "S07":
      bounce(s, target!);
      draw(s, p);
      break;
    case "S08":
      for (const tid of ids)
        buff(s, p.board.find((u) => u.id === tid)!, 1, 1, id);
      break;
    case "S09":
      damageUnits(s, [foe!], foe!.originalTime >= 5 ? 4 : 3, "hero", p.id);
      break;
    case "S10":
      buff(s, target!, 2, 2, id);
      break;
  }
}
function consumeRetort(s: MatchState, p: PlayerState) {
  const c = p.retort!;
  p.retort = null;
  p.discard.push(c);
  log(s, "retort", `${p.name}翻开「${cardById[c.definitionId].name}」`, {
    actorId: p.id,
    cardId: c.definitionId,
  });
}
function playCard(s: MatchState, p: PlayerState, c: Command) {
  const hand = p.hand.find((x) => x.id === c.cardId);
  requireRule(hand, "手牌不存在");
  if (hand!.kind === "offer") {
    deploy(s, p, p.offerZone.find((o) => o.id === hand!.offer!.id)!, c);
    return;
  }
  const d = cardById[hand!.definitionId],
    id = d.id,
    enemy = getEnemy(s, p.id),
    foe = enemy.board.find((u) => u.id === c.targetId),
    friend = p.board.find((u) => u.id === c.targetId);
  requireRule(p.timeRemaining >= handCost(p, hand!), "时间不足");
  if (d.type === "support") {
    requireRule(p.board.length < 4, "场上位置已满");
    validateOptionalDeployTarget(s, p, id, c);
  }
  if (d.type === "retort") requireRule(!p.retort, "已经留了一手");
  if (
    ["N07", "N10", "N11", "N12", "N14", "N20", "N21", "F01", "F02"].includes(id)
  )
    requireRule(foe, "请选择敌方角色");
  if (["N15", "N16"].includes(id)) requireRule(friend, "请选择友方角色");
  if (["N13", "F03"].includes(id))
    requireRule(friend?.kind === "offer", "请选择友方Offer");
  if (id === "N20")
    requireRule(
      unitStats(s, foe!).health <= 3,
      "只能优化当前底气不超过3的角色",
    );
  if (id === "F01")
    requireRule(
      foe!.kind === "offer" &&
        foe!.ageStage === 3 &&
        foe!.tags.includes("frontline"),
      "需要35岁的一线Offer",
    );
  if (id === "F02") requireRule(foe!.kind === "offer", "请选择敌方Offer");
  if (id === "N24") requireRule(p.board.length <= 2, "需要两个空位");
  if (id === "F05")
    requireRule(
      ["salary", "life", "future"].includes(c.topic || ""),
      "请选择聊天话题",
    );
  p.timeRemaining -= handCost(p, hand!);
  p.hand = p.hand.filter((x) => x.id !== hand!.id);
  if (d.type === "retort") {
    p.retort = hand!;
    log(s, "covered", `${p.name}留了一手`, { actorId: p.id });
    return;
  }
  p.discard.push(hand!);
  log(s, "play", `${p.name}打出「${d.name}」`, {
    actorId: p.id,
    cardId: id,
    targetId: c.targetId,
  });
  if (d.type === "support") {
    p.discard = p.discard.filter((x) => x.id !== hand!.id);
    const u: Unit = {
      ...unitBase(s, p),
      definitionId: id,
      name: d.name,
      originalTime: d.time_cost,
      baseAttack: d.attack!,
      baseHealth: d.max_health!,
      taunt: id === "N05",
      card: hand!,
    };
    p.board.push(u);
    log(s, "deploy", `${p.name}让${u.name}上桌`, {
      actorId: p.id,
      targetId: u.id,
      cardId: id,
    });
    enterEffect(s, p, u, c);
    return;
  }
  if (
    ["N07", "N10", "N11", "N12", "N14", "N20", "N21", "F01", "F02"].includes(
      id,
    ) &&
    foe?.kind === "offer" &&
    enemy.retort?.definitionId === "F04"
  ) {
    consumeRetort(s, enemy);
    log(s, "cancel", "合同取消了整张拆台牌的效果", {
      actorId: enemy.id,
      targetId: foe.id,
      cardId: id,
    });
    return;
  }
  switch (id) {
    case "N07":
      damageUnits(s, [foe!], 2, "action", p.id);
      break;
    case "N08":
      heal(s, p, 3);
      break;
    case "N09":
      draw(s, p, 2);
      break;
    case "N10":
      damageUnits(
        s,
        [foe!],
        foe!.tags.includes("frontline") ? 4 : 3,
        "action",
        p.id,
      );
      break;
    case "N11":
      freeze(s, foe!, p.id);
      break;
    case "N12":
      bounce(s, foe!);
      break;
    case "N13":
      bounce(s, friend!);
      draw(s, p);
      break;
    case "N14":
      buff(s, foe!, -2, 0, id, enemy.ownTurn + 1);
      draw(s, p);
      break;
    case "N15":
      buff(s, friend!, 3, 0, id, p.ownTurn);
      mindDamage(s, p, 2, p.id, id);
      checkVictory(s);
      break;
    case "N16":
      buff(s, friend!, 2, 2, id);
      break;
    case "N17":
      for (const u of p.board) healUnit(s, u, 2, p.id);
      heal(s, p, 2);
      break;
    case "N18":
      damageUnits(s, [...enemy.board], 2, "action", p.id);
      break;
    case "N19":
      damageUnits(s, [...p.board, ...enemy.board], 3, "action", p.id);
      break;
    case "N20":
      removeDead(s, [foe!.id]);
      break;
    case "N21": {
      const heals = foe!.kind === "offer" && foe!.originalTime >= 5;
      damageUnits(s, [foe!], 5, "action", p.id);
      if (!s.result && heals) heal(s, p, 2);
      break;
    }
    case "N22":
      enemy.mind -= 3;
      log(s, "damage", `${enemy.name}失去3点心态`, {
        actorId: p.id,
        targetId: enemy.id,
        amount: 3,
      });
      checkVictory(s);
      break;
    case "N24":
      token(s, p, 2, 3, false, "临时同事");
      token(s, p, 2, 3, false, "临时同事");
      break;
    case "F01":
      foe!.notice = { by: p.id, turn: p.ownTurn + 1 };
      log(s, "notice", `${foe!.name}收到优化通知：对方下回合开始检查`, {
        actorId: p.id,
        targetId: foe!.id,
      });
      break;
    case "F02": {
      const before = unitStats(s, foe!).attack;
      foe!.equityDisabled = true;
      const after = unitStats(s, foe!).attack;
      log(s, "equity_disabled", `${foe!.name}的期权条款重新估值`, {
        actorId: p.id,
        targetId: foe!.id,
        visual: {
          kind: "status",
          sourceId: p.id,
          targetId: foe!.id,
          playerId: p.id,
          source: anchor(s, p.id),
          target: unitAnchor(s, foe!),
          effectId: "equity_disabled",
          changes:
            before !== after
              ? [
                  {
                    targetId: foe!.id,
                    playerId: enemy.id,
                    stat: "attack",
                    amount: after - before,
                  },
                ]
              : [],
        },
      });
      damageUnits(s, [foe!], 2, "action", p.id);
      break;
    }
    case "F03":
      friend!.tags = friend!.tags.filter((t) => t !== "frontline");
      friend!.managed = true;
      buff(s, friend!, -2, 0, id);
      log(s, "management", `${friend!.name}转管理，失去一线标签`, {
        actorId: p.id,
        targetId: friend!.id,
      });
      draw(s, p);
      break;
    case "F05":
      s.topic = c.topic!;
      log(
        s,
        "topic",
        `现在${s.topic === "salary" ? "聊年包" : s.topic === "life" ? "聊生活" : "聊以后"}`,
        { actorId: p.id },
      );
      break;
  }
}
export function canAttack(s: MatchState, u: Unit, hero = false): boolean {
  const p = getPlayer(s, u.ownerId);
  return (
    !u.attacked &&
    u.frozenUntilTurn < p.ownTurn &&
    unitStats(s, u).attack > 0 &&
    (u.deployedTurn < p.ownTurn || (!hero && u.rush))
  );
}
function attack(s: MatchState, p: PlayerState, c: Command) {
  const u = p.board.find((u) => u.id === c.cardId || u.id === c.offerId),
    enemy = getEnemy(s, p.id),
    target = enemy.board.find((x) => x.id === c.targetId),
    hero = c.targetId === enemy.id;
  requireRule(u && canAttack(s, u, hero), "这个角色现在无法开怼");
  requireRule(hero || target, "请选择敌方角色或主角");
  const taunts = enemy.board.filter((x) => x.taunt);
  requireRule(!taunts.length || target?.taunt, "必须先开怼挡话角色");
  u!.attacked = true;
  if (hero && enemy.retort?.definitionId === "F06") {
    consumeRetort(s, enemy);
    buff(s, u!, -3, 0, "F06", p.ownTurn);
  }
  let damage = unitStats(s, u!).attack;
  if (target && u!.definitionId === "N03" && target.originalTime >= 5)
    damage += 3;
  const counter = target ? unitStats(s, target).attack : 0;
  const attackerAnchor = unitAnchor(s, u!),
    defenderAnchor = target ? unitAnchor(s, target) : anchor(s, enemy.id)!;
  const changes: BattleChange[] = [
    {
      targetId: defenderAnchor.id,
      playerId: enemy.id,
      stat: hero ? "mind" : "health",
      amount: -damage,
    },
  ];
  if (target)
    changes.push({
      targetId: u!.id,
      playerId: p.id,
      stat: "health",
      amount: -counter,
    });
  if (u!.tags.includes("frontline"))
    changes.push({ targetId: p.id, playerId: p.id, stat: "mind", amount: -1 });
  if (hero) enemy.mind -= damage;
  else {
    target!.damage += damage;
    u!.damage += counter;
  }
  if (u!.tags.includes("frontline")) p.mind--;
  log(
    s,
    "attack",
    `${u!.name}开怼${hero ? enemy.name : target!.name}，造成${damage}点${hero ? "心态" : "底气"}伤害`,
    {
      actorId: p.id,
      targetId: c.targetId,
      amount: damage,
      visual: {
        kind: "attack",
        sourceId: u!.id,
        targetId: defenderAnchor.id,
        playerId: p.id,
        source: attackerAnchor,
        target: defenderAnchor,
        amount: damage,
        changes,
      },
    },
  );
  removeDead(s);
  if (s.result) return;
  if (hero && damage > 0) {
    if (enemy.retort?.definitionId === "N23") {
      consumeRetort(s, enemy);
      mindDamage(s, p, 3, enemy.id, "N23");
      checkVictory(s);
    }
    if (!s.result && u!.templateId === "T06") draw(s, p);
  }
}
function resolve(s: MatchState, p: PlayerState, c: Command) {
  const choice = s.pendingChoice;
  requireRule(choice && choice.ownerId === p.id, "没有你的待选项");
  requireRule(!c.choiceId || c.choiceId === choice!.id, "选择已过期");
  const option = choice!.options.find((o) => o.id === c.optionId);
  requireRule(option, "请选择有效选项");
  s.pendingChoice = null;
  if (choice!.kind === "tax") {
    const enemy = getEnemy(s, p.id),
      card = enemy.hand.find((c) => c.id === option!.id);
    if (card)
      card.taxes.push({
        amount: choice!.amount!,
        untilTurn: enemy.ownTurn + 1,
      });
    log(
      s,
      "school_tax",
      `${p.name}标记一张手牌：对手下回合加时${choice!.amount}小时`,
      { actorId: p.id },
    );
  }
  if (choice!.kind === "scry") {
    const ids = choice!.options.map((o) => o.id);
    const top = p.deck.filter((c) => ids.includes(c.id));
    const rest = p.deck.filter((c) => !ids.includes(c.id));
    p.deck = [
      top.find((c) => c.id === option!.id)!,
      ...rest,
      ...top.filter((c) => c.id !== option!.id),
    ];
  }
  if (choice!.kind === "consult") {
    const selected = p.deck.find((c) => c.id === option!.id)!;
    p.deck = p.deck.filter((c) => c.id !== selected.id);
    give(s, p, selected);
    shuffle(s, p.deck);
  }
  if (choice!.kind === "benefit") {
    const unit = p.board.find((u) => u.id === choice!.unitId);
    if (unit)
      buff(
        s,
        unit,
        option!.id === "attack" ? 1 : 0,
        option!.id === "health" ? 2 : 0,
        "B06",
      );
  }
  if ((choice as PendingChoice & { drawAfter?: boolean }).drawAfter) draw(s, p);
  if (s.result) return;
  const queued = (choice as PendingChoice & { queuedBenefit?: string })
    .queuedBenefit;
  if (queued)
    s.pendingChoice = {
      id: uid(s, "choice"),
      ownerId: p.id,
      kind: "benefit",
      unitId: queued,
      options: [
        { id: "attack", label: "排面 +1" },
        { id: "health", label: "底气上限与当前底气 +2" },
      ],
    };
  log(s, "choice", `${p.name}完成选择`, { actorId: p.id });
}
function execute(s: MatchState, p: PlayerState, c: Command) {
  requireRule(!s.result, "对局已经结束");
  if (c.type === "CONCEDE") {
    finish(s, getEnemy(s, p.id).id, `${p.name}认输`);
    return;
  }
  if (s.phase === "flex") {
    requireRule(
      c.type === "SELECT_FLEX" || c.type === "TIMEOUT",
      "请先选择应对牌",
    );
    requireRule(!p.flexReady, "已经确认应对牌");
    const ids = c.type === "TIMEOUT" ? p.flexDeck : c.flexIds;
    requireRule(
      ids &&
        ids.length === 3 &&
        new Set(ids).size === 3 &&
        ids.every((id) => id.startsWith("F") && cardById[id]),
      "请选择三张不同应对牌",
    );
    p.flexDeck = [...ids!];
    p.flexReady = true;
    if (s.players.every((p) => p.flexReady)) deal(s);
    return;
  }
  if (s.phase === "mulligan") {
    requireRule(
      c.type === "MULLIGAN" || c.type === "TIMEOUT",
      "请完成起手换牌",
    );
    requireRule(!p.mulliganReady, "已经确认起手牌");
    const ids = c.type === "TIMEOUT" ? [] : c.cardIds || [];
    requireRule(
      ids.length <= 2 &&
        new Set(ids).size === ids.length &&
        ids.every((id) => p.hand.some((c) => c.id === id)),
      "最多更换两张不同手牌",
    );
    const removed = p.hand.filter((c) => ids.includes(c.id));
    p.hand = p.hand.filter((c) => !ids.includes(c.id));
    draw(s, p, removed.length);
    p.deck.push(...removed);
    shuffle(s, p.deck);
    p.mulliganReady = true;
    if (s.players.every((p) => p.mulliganReady)) {
      s.phase = "playing";
      turnStart(s, getPlayer(s, s.activePlayerId));
    }
    return;
  }
  requireRule(s.activePlayerId === p.id, "还没轮到你");
  if (c.type === "TIMEOUT") {
    while (s.pendingChoice) {
      resolve(s, p, {
        type: "RESOLVE_CHOICE",
        optionId: s.pendingChoice.options[0].id,
      });
    }
    if (s.result) return;
    if (!p.actedThisTurn) p.inactiveTurns++;
    else p.inactiveTurns = 0;
    if (p.inactiveTurns >= 2) {
      finish(s, getEnemy(s, p.id).id, "连续两个回合未行动");
      return;
    }
    turnEnd(s, p);
    return;
  }
  if (s.pendingChoice) {
    requireRule(c.type === "RESOLVE_CHOICE", "请先完成当前选择");
    resolve(s, p, c);
    return;
  }
  requireRule(c.type !== "RESOLVE_CHOICE", "没有待选择内容");
  switch (c.type) {
    case "DEPLOY_OFFER": {
      const o = p.offerZone.find((o) => o.id === c.offerId);
      requireRule(o, "Offer不存在");
      deploy(s, p, o!, c);
      break;
    }
    case "NEGOTIATE": {
      const sacrifice = p.offerZone.find((o) => o.id === c.sacrificeId),
        target = p.offerZone.find((o) => o.id === c.offerId);
      requireRule(!p.negotiationUsed, "本局已经谈过薪");
      requireRule(
        sacrifice &&
          target &&
          sacrifice !== target &&
          sacrifice.status === "available" &&
          target.status === "available" &&
          !sacrifice.everDeployed &&
          !target.everDeployed,
        "需要两张从未上桌的不同Offer",
      );
      const discount = Math.floor(sacrifice!.definition.originalTime / 2);
      sacrifice!.status = "negotiated";
      p.negotiationUsed = true;
      log(
        s,
        "negotiate",
        `${p.name}拿${sacrifice!.definition.name}去抬价，节省${discount}小时`,
        { actorId: p.id },
      );
      deploy(s, p, target!, c, discount);
      break;
    }
    case "PLAY_CARD":
      playCard(s, p, c);
      break;
    case "ATTACK":
      attack(s, p, c);
      break;
    case "USE_PRIMARY":
    case "USE_SECONDARY":
      useEducation(s, p, c);
      break;
    case "END_TURN":
      p.actedThisTurn = true;
      p.inactiveTurns = 0;
      turnEnd(s, p);
      return;
    default:
      throw Error("未知命令");
  }
  p.actedThisTurn = true;
  p.inactiveTurns = 0;
}
export function applyCommand(
  state: MatchState,
  actorId: string,
  raw: Command,
): { state: MatchState; events: GameEvent[]; error?: string } {
  if (
    raw.commandId &&
    state.processedCommandIds.includes(actorId + ":" + raw.commandId)
  )
    return { state, events: [] };
  const command = { ...raw.payload, ...raw } as Command;
  const next = structuredClone(state);
  try {
    const player = getPlayer(next, actorId);
    requireRule(player, "玩家不存在");
    execute(next, player, command);
    next.version++;
    if (command.commandId)
      next.processedCommandIds.push(actorId + ":" + command.commandId);
    return { state: next, events: next.events.slice(state.events.length) };
  } catch (e) {
    return {
      state,
      events: [],
      error: e instanceof Error ? e.message : "非法操作",
    };
  }
}
