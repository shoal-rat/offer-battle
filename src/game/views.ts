import { flexCandidates, mulliganCandidates } from "./ai/setup";
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
export function candidateActions(s: MatchState, id: string): Command[] {
  const p = getPlayer(s, id);
  if (!p || s.result) return [];
  if (s.phase === "flex") return p.flexReady ? [] : flexCandidates();
  if (s.phase === "mulligan") return p.mulliganReady ? [] : mulliganCandidates(p.hand.map(c => c.id));
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
  return commands;
}
export function legalActions(s: MatchState, id: string): Command[] {
  const commands = candidateActions(s, id);
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
export function getView(s: MatchState, playerId: string, includeLegalActions = true): MatchView {
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
    legalActions: includeLegalActions ? legalActions(s, playerId) : [],
  };
}
