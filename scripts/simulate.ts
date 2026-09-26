import { writeFileSync, mkdirSync } from "node:fs";
import {
  createMatch,
  defaultLoadout,
  applyCommand,
  getView,
  chooseBotCommand,
  stableHash,
  education,
} from "../src/game/index";
const arg = process.argv.indexOf("--games");
const games = arg >= 0 ? Number(process.argv[arg + 1]) : 220;
if (!Number.isInteger(games) || games < 1 || games > 10000)
  throw Error("--games must be between 1 and 10000");
const records: any[] = [];
const strategies = ["aggressive", "control", "growth"];
const begin = performance.now();
for (let i = 0; i < games; i++) {
  const combo = i % 110;
  const a = defaultLoadout("a", "组合方", Math.floor(i / 22) % 10),
    b = defaultLoadout("b", "对照方", i % 10);
  a.primaryId = education.primary[Math.floor(combo / 11)].id;
  a.secondaryId = education.secondary[combo % 11].id;
  const seed = (104729 * (i + 1)) >>> 0;
  let state = createMatch([a, b], seed, { skipSetup: true });
  let commands = 0;
  const traces: any[] = [];
  while (!state.result && commands < 600) {
    const actorId = state.activePlayerId;
    const strategy = strategies[(i + (actorId === "a" ? 0 : 1)) % 3];
    const command = chooseBotCommand(getView(state, actorId), strategy);
    const result = applyCommand(state, actorId, command);
    if (result.error) throw Error(`Game ${i}: ${result.error}`);
    state = result.state;
    traces.push({ actorId, command });
    commands++;
  }
  if (!state.result) throw Error(`Game ${i} did not finish after 600 commands`);
  let replay = createMatch([a, b], seed, { skipSetup: true });
  for (const { actorId, command } of traces)
    replay = applyCommand(replay, actorId, command).state;
  if (stableHash(state) !== stableHash(replay))
    throw Error("Replay mismatch " + i);
  records.push({
    index: i,
    seed,
    primary: a.primaryId,
    secondary: a.secondaryId,
    strategy: strategies[i % 3],
    winner: state.result.winnerId,
    first: state.firstPlayerId,
    round: state.round,
    commands,
    reason: state.result.reason,
    hash: stableHash(state),
  });
  if ((i + 1) % 22 === 0)
    console.log(`${i + 1}/${games} completed; deterministic replays verified`);
}
const wins = records.filter((r) => r.winner === "a").length,
  draws = records.filter((r) => r.winner === null).length,
  firstWins = records.filter((r) => r.winner === r.first).length;
const summary = {
  offerCompilerVersion: "2.1.0",
  battleRulesVersion: "2.0.0",
  games,
  comboCoverage: new Set(records.map((r) => r.primary + r.secondary)).size,
  wins,
  losses: games - wins - draws,
  draws,
  firstWins,
  meanRound: records.reduce((s, r) => s + r.round, 0) / games,
  meanCommands: records.reduce((s, r) => s + r.commands, 0) / games,
  elapsedSeconds: (performance.now() - begin) / 1000,
  allReplaysMatch: true,
};
mkdirSync("evidence", { recursive: true });
writeFileSync(
  "evidence/simulation.json",
  JSON.stringify({ summary, records }, null, 2),
);
writeFileSync(
  "BALANCE_REPORT.md",
  `# 机器人对局观测\n\n真实运行 \`npm run simulate -- --games ${games}\`。使用固定种子 104729 × (局号 + 1)，覆盖 ${summary.comboCoverage} 种有序双学历组合。每局用完全相同命令重放，${games} 局全部哈希一致。\n\n机器人仅接收玩家视图；策略依次为 aggressive、control、growth。它使用合法动作枚举，优先斩杀、部署、收益交换、学历和解通知。三种策略共享同一启发式，不代表高水平竞技强度。\n\n- 组合方胜 ${wins}，负 ${summary.losses}，平 ${draws}。\n- 先手胜 ${firstWins}/${games}，平均结束轮次 ${summary.meanRound.toFixed(2)}。\n- 平均 ${summary.meanCommands.toFixed(1)} 条命令，全部在 600 条命令上限内完成。\n- 用时 ${summary.elapsedSeconds.toFixed(1)} 秒。\n\n这些结果只说明所有组合可以运行和重放，不能证明竞技平衡。本轮使用 Offer 编译器 2.1.0，战斗规则 2.0.0；城市与工作特征参与造卡。逐局种子、组合、结果与哈希见 \`evidence/simulation.json\`。\n`,
);
console.log(JSON.stringify(summary, null, 2));
