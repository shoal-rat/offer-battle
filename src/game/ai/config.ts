import type { BotDifficulty, SearchBudget, SetupMode } from './types';
export const BOT_VERSION = '2.3.0';
export const BOT_DIFFICULTIES = [
  {id:'easy',label:'实习搭子',description:'安全浅层交换，适合熟悉规则'},
  {id:'normal',label:'秋招同学',description:'规划本回合的连续动作'},
  {id:'hard',label:'面霸',description:'规划回合并检查主要回击'},
  {id:'expert',label:'终面Boss',description:'采样未知牌，残局推演到终局再出手'},
] as const;
export const BOT_STYLES = [
  {id:'aggressive',label:'卷王',description:'进攻与节奏'},
  {id:'control',label:'合同大师',description:'交换与反制'},
  {id:'growth',label:'长期主义',description:'成长与资源'},
] as const;
export const BOT_BUDGETS: Record<BotDifficulty,SearchBudget> = {
  easy:{beamWidth:4,maxNodes:80,maxMs:40,maxDepth:2,samples:1,responseDepth:0},
  normal:{beamWidth:8,maxNodes:300,maxMs:100,maxDepth:6,samples:1,responseDepth:0},
  hard:{beamWidth:16,maxNodes:1500,maxMs:300,maxDepth:6,samples:1,responseDepth:3},
  expert:{beamWidth:32,maxNodes:5000,maxMs:1800,maxDepth:8,samples:4,responseDepth:4,playoutFromRound:9,finalists:8},
};
export function normalizeDifficulty(value:unknown):BotDifficulty {return BOT_DIFFICULTIES.some(d=>d.id===value)?value as BotDifficulty:'normal'}
export function normalizeSetupMode(value:unknown,legacySkipSetup=false):SetupMode {return value==='quick'||(value===undefined&&legacySkipSetup)?'quick':'full'}
