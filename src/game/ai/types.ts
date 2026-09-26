import type { Command, HandCard, MatchView } from '../types';
export type BotDifficulty = 'easy' | 'normal' | 'hard' | 'expert';
export type BotStyle = 'aggressive' | 'control' | 'growth';
export type SetupMode = 'full' | 'quick';
export interface BotKnowledge {
  matchId: string;
  ownBaseDeck: string[];
  ownFlexDeck: string[];
  lastVersion: number;
  lastEventSequence?: number;
  knownTop: HandCard[];
  knownEnemyHand: HandCard[];
  publicPlayed: string[];
}
export interface SearchBudget { beamWidth: number; maxNodes: number; maxMs: number; maxDepth: number; samples: number; responseDepth: number }
export interface BotDecisionRequest {
  view: MatchView;
  knowledge?: BotKnowledge;
  difficulty: BotDifficulty;
  style: BotStyle;
  botSeed: number;
  requestId: string;
  /** Tests use maxMs: Infinity for fixed-node reproducibility. */
  budget?: Partial<SearchBudget>;
}
export interface BotDecision {
  command: Command;
  matchId: string;
  stateVersion: number;
  requestId: string;
  botVersion: string;
  reasonCode: string;
  nodesVisited: number;
  elapsedMs: number;
  fallbackReason?: 'nodes' | 'time' | 'worker-error' | 'worker-timeout';
  principalVariation: Command[];
  sampleCount: number;
}
