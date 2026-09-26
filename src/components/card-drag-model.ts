import type { Command } from "../game/types";

export interface CardDragSource {
  kind: "hand" | "offer";
  id: string;
  offerId?: string;
  label: string;
  disabled?: boolean;
}
export interface CardDropLocation {
  targetId?: string;
  boardId?: string;
}

/** Only caller-authorized actions are eligible; never infer costs or game rules. */
export function dragActions(
  source: CardDragSource,
  legalActions: Command[],
): Command[] {
  if (source.disabled) return [];
  return legalActions.filter((command) =>
    source.kind === "offer"
      ? command.type === "DEPLOY_OFFER" && command.offerId === source.id
      : (command.type === "PLAY_CARD" && command.cardId === source.id) ||
        (command.type === "DEPLOY_OFFER" &&
          !!source.offerId &&
          command.offerId === source.offerId),
  );
}
export function commandsForDrop(
  actions: Command[],
  location: CardDropLocation,
  selfId: string,
): Command[] {
  if (location.targetId) {
    const targeted = actions.filter(
      (command) =>
        command.targetId === location.targetId && !command.targetIds?.length,
    );
    if (targeted.length) return targeted;
  }
  // The friendly row is also a staging area: targeted cards open Battle's
  // existing target chooser instead of silently cancelling or guessing a target.
  if (location.boardId === selfId) return actions;
  return [];
}

export function dropNeedsTarget(
  commands: Command[],
  location: CardDropLocation,
): boolean {
  const exactTarget =
    location.targetId &&
    commands.some(
      (command) =>
        command.targetId === location.targetId && !command.targetIds?.length,
    );
  return (
    !exactTarget &&
    commands.some(
      (command) => !!command.targetId || !!command.targetIds?.length,
    )
  );
}
