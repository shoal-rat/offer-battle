import type {OfferPersona} from './draft-persona';
export type Topic = "salary" | "life" | "future";
export type Phase = "flex" | "mulligan" | "playing" | "finished";
export interface OfferProfile {
  card_display_name?: string;
  selected_template_id?: string;
  company_display_name: string;
  ownership: string;
  industry: string;
  company_stage: string;
  role_family: string;
  role_title: string;
  city: string;
  city_cost_level?: "auto" | "high" | "medium" | "low";
  work_nature?: "standard" | "permanent" | "contract" | "dispatch" | "internship";
  work_schedule?: "standard" | "intensive" | "flexible" | "field";
  monthly_fixed_cny: number;
  guaranteed_months: number;
  annual_fixed_allowance_cny: number;
  annual_target_bonus_cny: number;
  annual_equity_cny: number;
  one_time_signing_cny: number;
  confirmed_benefits: string[];
}
export interface OfferDefinition {
  id: string;
  name: string;
  company: string;
  role: string;
  templateId: string;
  benefitId: string | null;
  originalTime: number;
  baseAttack: number;
  baseHealth: number;
  annualPackage: number;
  annualFixed: number;
  signingBonus?: number;
  tags: string[];
  rulesVersion: string;
  definitionHash?: string;
  profile?: OfferProfile;
  artId?: string;
  tuning?: OfferTuning;
  definitionRevision?: number;
  draftRevision?: number;
  persona?: OfferPersona;
}
export interface OfferTuning {
  version: "2.1.0";
  salaryCost: number;
  costAdjustment: number;
  requestedTilt: number;
  appliedTilt: number;
  cityLevel: "high" | "medium" | "low";
  citySource: "auto" | "manual";
  contributions: { key: string; label: string; detail: string; cost: number; tilt: number }[];
  beforeBenefit: { attack: number; health: number };
  benefitPenalty: { attack: number; health: number };
}
export interface Loadout {
  playerId: string;
  name: string;
  primaryId: string;
  secondaryId: string;
  offers: OfferDefinition[];
  baseDeck: string[];
  flexDeck: string[];
}
export interface Tax {
  amount: number;
  untilTurn: number;
}
export interface HandCard {
  id: string;
  definitionId: string;
  kind: "card" | "offer";
  offer?: OfferInstance;
  taxes: Tax[];
  knownTo: string[];
}
export interface OfferInstance {
  id: string;
  definition: OfferDefinition;
  ageStage: number;
  everDeployed: boolean;
  status: "available" | "board" | "hand" | "discard" | "negotiated";
}
export interface Modifier {
  attack: number;
  health: number;
  expiresOwnerTurn?: number;
  source: string;
}
export interface Unit {
  id: string;
  ownerId: string;
  definitionId: string;
  name: string;
  kind: "offer" | "support" | "token";
  offerId?: string;
  originalTime: number;
  baseAttack: number;
  baseHealth: number;
  damage: number;
  ageStage: number;
  templateId?: string;
  benefitId?: string | null;
  tags: string[];
  modifiers: Modifier[];
  deployedTurn: number;
  attacked: boolean;
  rush: boolean;
  taunt: boolean;
  frozenUntilTurn: number;
  managed: boolean;
  equityDisabled: boolean;
  protectionUsed: boolean;
  notice?: { by: string; turn: number };
  card?: HandCard;
}
export interface EducationState {
  primaryId: string;
  secondaryId: string;
  usedThisOwnTurn: boolean;
  secondaryUsed: boolean;
  referralDiscount: number;
  returnTicket: null | {
    offerId: string;
    discount: number;
    expiresAfterOwnerTurnIndex: number;
  };
  jluSignins: number;
  jluUltimateUsed: boolean;
}
export interface PlayerState {
  id: string;
  name: string;
  mind: number;
  timeRemaining: number;
  ownTurn: number;
  hand: HandCard[];
  deck: HandCard[];
  discard: HandCard[];
  offerZone: OfferInstance[];
  board: Unit[];
  retort: HandCard | null;
  fatigue: number;
  negotiationUsed: boolean;
  education: EducationState;
  baseDeck: string[];
  flexDeck: string[];
  flexReady: boolean;
  mulliganReady: boolean;
  inactiveTurns: number;
  actedThisTurn: boolean;
}
export interface ChoiceOption {
  id: string;
  label: string;
  card?: HandCard;
}
export interface PendingChoice {
  id: string;
  ownerId: string;
  kind: "tax" | "scry" | "consult" | "benefit";
  options: ChoiceOption[];
  amount?: number;
  unitId?: string;
}
export type BattleCueKind =
  | "attack"
  | "damage"
  | "heal"
  | "deploy"
  | "primary_skill"
  | "secondary_skill"
  | "retort"
  | "retire"
  | "draw"
  | "buff"
  | "bounce"
  | "card"
  | "status"
  | "topic"
  | "turn"
  | "result"
  | "covered";
/** Public geometry and art identity captured while a unit is still on the table. */
export interface BattleAnchor {
  kind: "hero" | "unit" | "hand" | "deck" | "offer" | "retort";
  id: string;
  playerId: string;
  slot?: number;
  name?: string;
  definitionId?: string;
  templateId?: string;
  artId?: string;
}
export interface BattleChange {
  targetId: string;
  playerId: string;
  stat: "mind" | "health" | "attack" | "maxHealth";
  /** Signed actual change, after prevention, caps and clamping. */
  amount: number;
}
export interface BattleVisualCue {
  kind: BattleCueKind;
  sourceId?: string;
  targetId?: string;
  playerId?: string;
  amount?: number;
  label?: string;
  educationId?: string;
  cardId?: string;
  effectId?: string;
  source?: BattleAnchor;
  target?: BattleAnchor;
  targets?: BattleAnchor[];
  changes?: BattleChange[];
}
export interface BattleCue extends BattleVisualCue {
  /** Stable across HTTP, WebSocket snapshots, reconnection and replay. */
  id: string;
  sequence: number;
}
export interface GameEvent {
  sequence: number;
  type: string;
  text: string;
  actorId?: string;
  targetId?: string;
  cardId?: string;
  amount?: number;
  privateTo?: string;
  visual?: BattleVisualCue;
}
export interface MatchState {
  rulesVersion: string;
  matchId: string;
  version: number;
  round: number;
  activePlayerId: string;
  firstPlayerId: string;
  phase: Phase;
  players: PlayerState[];
  topic: Topic;
  rngState: number;
  nextId: number;
  pendingChoice: PendingChoice | null;
  events: GameEvent[];
  eventSequence: number;
  result: null | { winnerId: string | null; reason: string };
  processedCommandIds: string[];
}
export interface Command {
  type:
    | "SELECT_FLEX"
    | "MULLIGAN"
    | "PLAY_CARD"
    | "DEPLOY_OFFER"
    | "NEGOTIATE"
    | "ATTACK"
    | "USE_PRIMARY"
    | "USE_SECONDARY"
    | "RESOLVE_CHOICE"
    | "END_TURN"
    | "CONCEDE"
    | "TIMEOUT";
  cardId?: string;
  offerId?: string;
  targetId?: string;
  targetIds?: string[];
  sacrificeId?: string;
  choiceId?: string;
  optionId?: string;
  cardIds?: string[];
  flexIds?: string[];
  topic?: Topic;
  commandId?: string;
  benefitChoice?: "attack" | "health";
  payload?: Record<string, unknown>;
}
export interface UnitView extends Unit {
  attack: number;
  health: number;
  maxHealth: number;
  age: number | null;
  canAttack: boolean;
  canAttackHero: boolean;
}
export interface OfferView extends OfferInstance {
  cost: number;
}
export interface HandCardView extends HandCard {
  cost: number;
  name: string;
  text: string;
  type: string;
}
export interface PlayerView {
  id: string;
  name: string;
  mind: number;
  timeRemaining: number;
  ownTurn: number;
  hand: HandCardView[];
  handCount: number;
  deckCount: number;
  discard: HandCard[];
  offerZone: OfferView[];
  board: UnitView[];
  retort: { covered: boolean; definitionId?: string } | null;
  fatigue: number;
  negotiationUsed: boolean;
  education: EducationState;
  /** Own saved or confirmed response cards; omitted for opponents and older servers. */
  flexSelection?: string[];
  flexReady: boolean;
  mulliganReady: boolean;
  knownHand: HandCardView[];
}
export interface MatchView {
  rulesVersion: string;
  matchId: string;
  version: number;
  round: number;
  activePlayerId: string;
  firstPlayerId: string;
  phase: Phase;
  topic: Topic;
  players: PlayerView[];
  selfId: string;
  pendingChoice: PendingChoice | null;
  choosingPlayerId: string | null;
  events: GameEvent[];
  visualCues: BattleCue[];
  result: MatchState["result"];
  legalActions: Command[];
}
