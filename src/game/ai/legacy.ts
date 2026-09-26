// Frozen pre-2.2 scoring baseline. Do not tune; benchmarks depend on this snapshot.
import type { MatchView, Command } from "../types";
import { cardById } from "../catalog";
export function chooseLegacyBotCommand(
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
