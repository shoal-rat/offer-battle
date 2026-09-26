# AI01–AI05 handoff to root

Repository: `outputs/offer-battle-open-source`, branch `codex/offer-upgrade-2-2`. No commits, push or deploy were performed. Do not alter the planner during the fixed-source benchmark.

## Completed paired benchmark

The strategy SHA256 (sorted concatenation of `src/game/ai/*`) is:

`1e31572df9a5a034383019d38b9beafe43d6271fe590e94e2846276b28cd6b30`

Four completed subprocesses cover disjoint pair indices, exactly 500 unique paired seeds / 1000 games. Every pair mirrors deck+education between seats; pairs vary the preset and all 110 education combinations. Each pair repeats legal `createMatch` initialization with the same seed and swaps algorithms between seats, without editing dealt first-player state. Game RNG and bot RNG are separate; production node caps remain unchanged; the time guard is disabled only in the benchmark for reproducible decisions.

| Pair indices | exec session | Command | Progress |
|---|---:|---|---|
| 0–124 | 48442 | `npx tsx scripts/benchmark-bots.ts --pairs 125 --start-pair 0 --seed 77260927 --output reports/ai-benchmark-shard-0.json` | `work/ai-benchmark-shard-0.txt` |
| 125–249 | 78117 | `npx tsx scripts/benchmark-bots.ts --pairs 125 --start-pair 125 --seed 77260927 --output reports/ai-benchmark-shard-1.json` | `work/ai-benchmark-shard-1.txt` |
| 250–374 | 35956 | `npx tsx scripts/benchmark-bots.ts --pairs 125 --start-pair 250 --seed 77260927 --output reports/ai-benchmark-shard-2.json` | `work/ai-benchmark-shard-2.txt` |
| 375–499 | 8815 | `npx tsx scripts/benchmark-bots.ts --pairs 125 --start-pair 375 --seed 77260927 --output reports/ai-benchmark-shard-3.json` | `work/ai-benchmark-shard-3.txt` |

All four shards completed and were merged on 2026-09-27. This command reproduces the merged report from those recorded results. It refuses duplicate pair seats and mixed implementation hashes and merges the actual raw timing/node samples:

```sh
npx tsx scripts/merge-bot-benchmarks.ts reports/ai-benchmark-shard-0.json reports/ai-benchmark-shard-1.json reports/ai-benchmark-shard-2.json reports/ai-benchmark-shard-3.json
```

Final output is `reports/ai-benchmark.json`. Completion requires `status: completed`, `completedGames: 1000`, `requestedPairs: 500`, `educationCombinationCoverage: 110`, all replays matching, zero illegal commands. The final same-source serial partial is retained in `reports/ai-benchmark-serial-partial.json`, and must not be counted again: those overlapping seeds are superseded by the four disjoint final shards. Other tuning and failure attempts are retained too.

Acceptance targets: hard vs legacy mean score at least 0.70, expert vs normal at least 0.60 with a meaningful paired confidence interval (report whether its lower bound exceeds 0.50). The script compares five matchups (hard/legacy, expert/normal, easy/legacy, normal/legacy, hard/normal), 100 pairs each when complete. Do not infer strength acceptance from the provisional results. If targets fail, report the failure rather than changing seeds or counting attempts as new samples.

Latency data in the merged report is from **four concurrent Node benchmark subprocesses**, not single-game or mobile performance. Production browser-worker timing has separate actual Chromium evidence in `reports/ai-browser-worker.json`. No exhaustive multi-command missed-lethal oracle exists; the benchmark reports public immediate-win misses and explicit tactical tests instead.

## Implemented and tested

- Frozen legacy scorer; 21 reproductions of the seven original defects across all three styles.
- Complete 20 flex and 7/11 mulligan candidates; four difficulties independent of style, training and full/quick setup.
- Observation-only reconstructed state; authoritative applyCommand beam search, full rule-state deduplication/cache, global budgets, common action sequences across hypotheses, real end-turn valuation, bounded opponent response, uncertainty-aware retaliation handling, replan at hidden-information boundaries.
- Explicit safe-root guard avoids choosing immediate self-defeat when a sampled safe initial action exists. Regression coverage includes fatigue, notices/management, board-space creation, attack-before-return, two-card removal, affordable negotiation, tax/consult choices, and round-twelve victory.
- Browser module Worker and Node worker_threads use the same strategy. Bind request/match/version; terminate abandoned work; drop stale results; explicit safe fallback diagnostics. Node dispatch uses least-recently-served order. Public diagnostics exclude commands/PV so setup choices cannot leak.
- Local/Node room creation, migration, snapshots, rematches and replay config metadata. Five tutorials remain scripted. No battle engine or Offer compiler rules changed.

Evidence: `reports/ai-unit.txt` (34/34 passing), `reports/ai-runtime-tests.txt` (110/110 existing rules/guest/Node HTTP/replay/tutorial tests), `reports/ai-browser-worker.json` (real Chromium worker, continuous frames, cancellation), `reports/ai-evidence.json` (commands/hashes and developer-check scope). Latest typecheck and Cloudflare typecheck passed; production build passed and emitted a separate `bot.worker-*.js` asset. Root is editing Battle UI; this agent did not touch App/Battle UI.

## Deployment support and remaining review

Cloudflare `cloudflare/room.ts` exposes friend rooms with `isBot: false`; it has no chooseBot/decideBot call. Public guest bot play stays in the local browser worker. The upgrade deliberately adds no online-model API or unnecessary Cloudflare bot compute. Node self-hosted bots use the worker_threads adapter. No deployment was done.

Root should finish the benchmark merge and update `reports/ai-evidence.json` benchmark status, then run fresh independent AI review and combined release checks. Developer test evidence here is not a substitute for the requested independent acceptance agents or mobile UI review.

## Final merge audit (developer evidence)

The completed 1,000 games contain exactly 500 unique two-seat pairs, 110 education combinations across the pool, zero illegal commands and 1,000 matching replay hashes. The current planner hash still matches all four shards. `scripts/check-bot-benchmark.ts` validates those conditions and produces `reports/ai-benchmark-validation.json`.

Hard versus legacy scored **77.75%**, paired bootstrap 95% interval **71.50%–83.25%**; expert versus normal scored **61.75%**, interval **57.25%–66.25%**. Both mean-score targets are met and the expert comparison's interval is above 50%. These are score rates including half a point for draws.

Each specific comparison covers 22 education combinations and two preset indices; the 110-combination claim applies to the combined pool. Time guards were disabled for deterministic node-budget testing, so zero recorded timeouts is not a production timeout-rate claim. All new algorithms recorded zero measured immediate self-losses and zero misses in the bounded public immediate-win probe; this is not an exhaustive multi-command lethal oracle.

All prior attempts remain separate and excluded. Public report metadata and two old log titles were redacted without changing counts or measurements; evidence hashes were refreshed. Independent acceptance remains not-run, to follow the initial GitHub submission.
