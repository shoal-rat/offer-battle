import type {
  MatchState,
  MatchView,
  PlayerState,
  HandCard,
  HandCardView,
  Command,
  UnitView,
  OfferDefinition,
  OfferInstance,
} from "./types";
import { cardById, templateById, benefitById } from "./catalog";
import {
  applyCommand,
  getPlayer,
  getEnemy,
  unitStats,
  offerCost,
  handCost,
  canAttack,
} from "./engine";
export function legalActions(s: MatchState, id: string): Command[] {
  const p = getPlayer(s, id);
  if (!p || s.result) return [];
  if (s.phase === "flex")
    return p.flexReady
      ? []
      : [{ type: "SELECT_FLEX", flexIds: [...p.flexDeck] }];
  if (s.phase === "mulligan")
    return p.mulliganReady ? [] : [{ type: "MULLIGAN", cardIds: [] }];
  if (s.activePlayerId !== id) return [];
  if (s.pendingChoice)
    return s.pendingChoice.ownerId === id
      ? s.pendingChoice.options.map((o) => ({
          type: "RESOLVE_CHOICE",
          choiceId: s.pendingChoice!.id,
          optionId: o.id,
        }))
      : [];
  const enemy = getEnemy(s, id),
    targets = [
      undefined,
      ...p.board.map((u) => u.id),
      ...enemy.board.map((u) => u.id),
    ],
    commands: Command[] = [{ type: "END_TURN" }];
  for (const u of p.board)
    for (const targetId of [...enemy.board.map((u) => u.id), enemy.id])
      commands.push({ type: "ATTACK", cardId: u.id, targetId });
  for (const o of p.offerZone.filter((o) => o.status === "available")) {
    for (const targetId of targets) {
      commands.push({
        type: "DEPLOY_OFFER",
        offerId: o.id,
        targetId,
        ...(o.definition.benefitId === "B06"
          ? { benefitChoice: "attack" as const }
          : {}),
      });
      if (o.definition.benefitId === "B06")
        commands.push({
          type: "DEPLOY_OFFER",
          offerId: o.id,
          targetId,
          benefitChoice: "health",
        });
    }
    if (!p.negotiationUsed)
      for (const sacrifice of p.offerZone.filter(
        (x) => x.status === "available" && x.id !== o.id,
      ))
        for (const targetId of targets)
          for (const benefitChoice of (o.definition.benefitId === "B06"
            ? ["attack", "health"]
            : ["attack"]) as ("attack" | "health")[])
            commands.push({
              type: "NEGOTIATE",
              offerId: o.id,
              sacrificeId: sacrifice.id,
              targetId,
              ...(o.definition.benefitId === "B06" ? { benefitChoice } : {}),
            });
  }
  for (const card of p.hand) {
    if (card.definitionId === "F05")
      for (const topic of ["salary", "life", "future"] as const)
        commands.push({ type: "PLAY_CARD", cardId: card.id, topic });
    else {
      const d = cardById[card.definitionId];
      const needsTarget =
        card.kind === "offer"
          ? ["T03", "T05", "T07", "T08"].includes(
              card.offer!.definition.templateId,
            )
          : [
              "N06",
              "N07",
              "N10",
              "N11",
              "N12",
              "N13",
              "N14",
              "N15",
              "N16",
              "N20",
              "N21",
              "F01",
              "F02",
              "F03",
            ].includes(card.definitionId);
      for (const targetId of needsTarget ? targets : [undefined])
        for (const benefitChoice of (card.offer?.definition.benefitId === "B06"
          ? ["attack", "health"]
          : ["attack"]) as ("attack" | "health")[])
          commands.push({
            type: "PLAY_CARD",
            cardId: card.id,
            targetId,
            ...(card.offer?.definition.benefitId === "B06"
              ? { benefitChoice }
              : {}),
          });
    }
  }
  for (const type of ["USE_PRIMARY", "USE_SECONDARY"] as const) {
    const educationId =
      type === "USE_PRIMARY" ? p.education.primaryId : p.education.secondaryId;
    if (educationId === "H09") {
      for (const card of p.hand) commands.push({ type, cardId: card.id });
    } else if (educationId === "S09") {
      for (const unit of enemy.board)
        commands.push({ type, targetId: unit.id });
    } else if (
      ["H03", "H05", "H07", "H08", "S03", "S05", "S07", "S08", "S10"].includes(
        educationId,
      ) ||
      (educationId === "H10" &&
        p.education.jluSignins === 2 &&
        !p.education.jluUltimateUsed)
    ) {
      for (const unit of p.board) commands.push({ type, targetId: unit.id });
      if (!p.board.length && ["H05", "S05"].includes(educationId))
        commands.push({ type });
    } else {
      commands.push({ type });
    }
    if (educationId === "S08")
      for (let i = 0; i < p.board.length; i++)
        for (let j = i + 1; j < p.board.length; j++)
          commands.push({ type, targetIds: [p.board[i].id, p.board[j].id] });
  }
  const cheapState = { ...s, events: [], processedCommandIds: [] };
  const unique = new Set<string>();
  return commands.filter((c) => {
    const k = JSON.stringify(c);
    if (unique.has(k)) return false;
    unique.add(k);
    return !applyCommand(cheapState, id, c).error;
  });
}
// Raw submitted profiles and server card tracking never enter battle views.
function publicDefinition(value: OfferDefinition): OfferDefinition {
  // The private compiler hash includes financial inputs, so it must not become
  // a low-entropy signing-bonus oracle after removing the plaintext amount.
  const {
    profile: _profile,
    signingBonus: _signingBonus,
    definitionHash: _definitionHash,
    ...definition
  } = structuredClone(value);
  return definition;
}
function publicOffer(value: OfferInstance): OfferInstance {
  return {
    ...structuredClone(value),
    definition: publicDefinition(value.definition),
  };
}
function publicCard(value: HandCard): HandCard {
  return {
    ...structuredClone(value),
    ...(value.offer ? { offer: publicOffer(value.offer) } : {}),
  };
}
function cardView(p: PlayerState, c: HandCard): HandCardView {
  const d = c.kind === "card" ? cardById[c.definitionId] : null;
  return {
    ...publicCard(c),
    cost: handCost(p, c),
    name: c.offer?.definition.name || d!.name,
    text: c.offer
      ? templateById[c.offer.definition.templateId].main_effect +
        (c.offer.definition.benefitId
          ? " " + benefitById[c.offer.definition.benefitId].text
          : "")
      : d!.rules_text,
    type: c.kind === "offer" ? "offer" : d!.type,
  };
}
export function getView(s: MatchState, playerId: string): MatchView {
  const visibleEvents = s.events
    .filter((e) => !e.privateTo || e.privateTo === playerId)
    .map((e) => structuredClone(e));
  return {
    rulesVersion: s.rulesVersion,
    matchId: s.matchId,
    version: s.version,
    round: s.round,
    activePlayerId: s.activePlayerId,
    firstPlayerId: s.firstPlayerId,
    phase: s.phase,
    topic: s.topic,
    selfId: playerId,
    players: s.players.map((p) => ({
      id: p.id,
      name: p.name,
      mind: p.mind,
      timeRemaining: p.timeRemaining,
      ownTurn: p.ownTurn,
      hand: p.id === playerId ? p.hand.map((c) => cardView(p, c)) : [],
      handCount: p.hand.length,
      deckCount: p.deck.length,
      discard: p.discard.map(publicCard),
      offerZone: p.offerZone.map((o) => ({
        ...publicOffer(o),
        cost: offerCost(p, o),
      })),
      board: p.board.map((u) => {
        const { card: _card, ...publicUnit } = structuredClone(u);
        return {
          ...publicUnit,
          ...unitStats(s, u),
          age: u.kind === "offer" ? [22, 27, 31, 35][u.ageStage] : null,
          canAttack: canAttack(s, u),
          canAttackHero: canAttack(s, u, true),
        };
      }),
      retort: p.retort
        ? {
            covered: true,
            ...(p.id === playerId
              ? { definitionId: p.retort.definitionId }
              : {}),
          }
        : null,
      fatigue: p.fatigue,
      negotiationUsed: p.negotiationUsed,
      education: structuredClone(p.education),
      flexReady: p.flexReady,
      mulliganReady: p.mulliganReady,
      knownHand:
        p.id !== playerId
          ? p.hand
              .filter((c) => c.knownTo.includes(playerId))
              .map((c) => cardView(p, c))
          : [],
    })),
    pendingChoice:
      s.pendingChoice?.ownerId === playerId
        ? {
            ...structuredClone(s.pendingChoice),
            options: s.pendingChoice.options.map((o) => ({
              ...structuredClone(o),
              ...(o.card ? { card: publicCard(o.card) } : {}),
            })),
          }
        : null,
    choosingPlayerId: s.pendingChoice?.ownerId || null,
    events: visibleEvents,
    visualCues: visibleEvents
      .filter((e) => e.visual)
      .slice(-80)
      .map((e) => ({
        ...structuredClone(e.visual!),
        id: `${s.matchId}:${e.sequence}`,
        sequence: e.sequence,
      })),
    result: s.result ? { ...s.result } : null,
    legalActions: legalActions(s, playerId),
  };
}
export function chooseBotCommand(
  view: MatchView,
  strategy = "balanced",
): Command {
  const p = view.players.find((p) => p.id === view.selfId)!,
    enemy = view.players.find((p) => p.id !== view.selfId)!;
  let best: Command = { type: "END_TURN" },
    bestScore = -1;
  for (const c of view.legalActions) {
    let score = 0;
    const card = p.hand.find((h) => h.id === c.cardId);
    const target = p.board.find((u) => u.id === c.targetId),
      foe = enemy.board.find((u) => u.id === c.targetId);
    switch (c.type) {
      case "SELECT_FLEX":
      case "MULLIGAN":
        score = 10;
        break;
      case "RESOLVE_CHOICE": {
        const option = view.pendingChoice?.options.find(
          (o) => o.id === c.optionId,
        );
        score =
          10 +
          (option?.card
            ? cardById[option.card.definitionId]?.time_cost || 0
            : 0);
        break;
      }
      case "DEPLOY_OFFER":
      case "NEGOTIATE": {
        const o = p.offerZone.find((o) => o.id === c.offerId)!;
        score =
          10 +
          o.definition.baseAttack +
          o.definition.baseHealth / 2 +
          (o.definition.templateId === "T02" && p.mind < 15 ? 4 : 0);
        if (c.type === "NEGOTIATE") {
          const sacrifice = p.offerZone.find((o) => o.id === c.sacrificeId)!;
          score -= sacrifice.definition.baseAttack / 2 + 2;
          if (o.cost <= p.timeRemaining) score = -1;
        }
        break;
      }
      case "ATTACK": {
        const u = p.board.find((u) => u.id === c.cardId)!;
        if (c.targetId === enemy.id) {
          score =
            enemy.mind <= u.attack
              ? 1000
              : 7 + u.attack + (strategy === "aggressive" ? 5 : 0);
        } else if (foe) {
          const damage =
            u.attack +
            (u.definitionId === "N03" && foe.originalTime >= 5 ? 3 : 0);
          score = 3 + Math.min(damage, foe.health);
          if (foe.health <= damage)
            score += foe.attack + (foe.kind === "offer" ? 3 : 0);
          if (u.health <= foe.attack) score -= u.attack + u.health / 2;
          if (foe.taunt) score += 4;
        }
        if (u.tags.includes("frontline") && p.mind <= 1) score = -5;
        break;
      }
      case "PLAY_CARD":
        if (card) {
          if (card.type === "support" || card.kind === "offer")
            score = 12 + card.cost;
          else if (card.type === "retort") score = 4;
          else {
            const id = card.definitionId;
            score = 5;
            if (["N08", "N17"].includes(id)) score = p.mind < 25 ? 8 : 0;
            if (["N09", "N13", "N14"].includes(id))
              score = p.deckCount > 2 ? 5 : -2;
            if (id === "N22") score = enemy.mind <= 3 ? 1000 : 8;
            if (id === "N24") score = 17;
            if (foe) {
              const power =
                id === "N07"
                  ? 2
                  : id === "N10"
                    ? foe.tags.includes("frontline")
                      ? 4
                      : 3
                    : id === "N21"
                      ? 5
                      : 2;
              score =
                7 +
                Math.min(power, foe.health) +
                (power >= foe.health ? foe.attack + 3 : 0);
              if (id === "N12") score = foe.attack + foe.modifiers.length * 3;
              if (id === "F01") score = 7 + foe.attack;
            }
            if (target) {
              score = target.canAttack ? 10 + target.attack / 2 : 4;
              if (["N13", "F03"].includes(id)) score = target.notice ? 20 : 1;
            }
            if (id === "N18")
              score = enemy.board.reduce(
                (a, u) =>
                  a + Math.min(2, u.health) + (u.health <= 2 ? u.attack : 0),
                0,
              );
            if (id === "N19")
              score =
                enemy.board.reduce(
                  (a, u) =>
                    a + Math.min(3, u.health) + (u.health <= 3 ? u.attack : 0),
                  0,
                ) -
                p.board.reduce(
                  (a, u) =>
                    a + Math.min(3, u.health) + (u.health <= 3 ? u.attack : 0),
                  0,
                );
            if (id === "F05")
              score =
                c.topic === "future" && p.board.some((u) => u.ageStage >= 2)
                  ? 3
                  : 0;
          }
        }
        break;
      case "USE_PRIMARY":
      case "USE_SECONDARY": {
        const id =
          c.type === "USE_PRIMARY"
            ? p.education.primaryId
            : p.education.secondaryId;
        score = 4;
        if (["H06", "S06"].includes(id)) score = 12;
        if (id === "H10")
          score =
            p.education.jluSignins >= 2
              ? 18
              : p.education.jluUltimateUsed
                ? p.mind < 29
                  ? 4
                  : 0
                : 6;
        if (["S03", "S08", "S10", "H08"].includes(id))
          score = target?.canAttack ? 13 : 9;
        if (["H05", "S05", "S00"].includes(id))
          score = p.mind < 27 ? 7 : target?.damage ? 6 : 0;
        if (["H07", "S07"].includes(id))
          score = target?.notice ? 25 : target && target.health <= 2 ? 7 : -1;
        if (["H04", "S04", "H09"].includes(id))
          score = p.deckCount > 2 && p.handCount < 6 ? 5 : -1;
        if (id === "H03") score = target?.canAttack && p.mind > 2 ? 11 : -1;
        if (id === "S09")
          score = foe
            ? 10 +
              (foe.health <= (foe.originalTime >= 5 ? 4 : 3) ? foe.attack : 0)
            : 0;
        break;
      }
      default:
        score = 0;
    }
    if (strategy === "control") {
      if (c.type === "ATTACK" && foe) score += 4;
      if (
        c.type === "PLAY_CARD" &&
        card &&
        ["N07", "N10", "N11", "N12", "N18", "N20", "N21"].includes(
          card.definitionId,
        ) &&
        enemy.board.length
      )
        score += 3;
      if (
        target?.notice &&
        ["PLAY_CARD", "USE_PRIMARY", "USE_SECONDARY"].includes(c.type)
      )
        score += 5;
    }
    if (strategy === "growth") {
      if (["DEPLOY_OFFER", "NEGOTIATE"].includes(c.type)) {
        const o = p.offerZone.find((o) => o.id === c.offerId);
        if (o && ["T04", "T10"].includes(o.definition.templateId)) score += 5;
      }
      if (c.type === "USE_PRIMARY" && p.education.primaryId === "H10")
        score += 3;
      if (
        c.type === "PLAY_CARD" &&
        card &&
        ["N08", "N16", "N17"].includes(card.definitionId)
      )
        score += 2;
    }
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}
