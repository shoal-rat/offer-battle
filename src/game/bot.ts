import type { Command, MatchView } from './types';
import { decideBotCommand } from './ai/search';
import { normalizeDifficulty } from './ai/config';
export function chooseBotCommand(view:MatchView,strategy='aggressive',difficulty='normal'):Command {
  return decideBotCommand({view,style:strategy==='control'||strategy==='growth'?strategy:'aggressive',difficulty:normalizeDifficulty(difficulty),botSeed:view.version+1,requestId:`compat:${view.version}`}).command;
}
