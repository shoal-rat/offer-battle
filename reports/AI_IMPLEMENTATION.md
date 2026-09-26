# AI 2.2 implementation and evidence

Battle rules remain 2.0.0 and the Offer compiler remains 2.1.0. The new independent bot version is 2.2.0. No online model API is used.

## Strategy contract

`src/game/ai/search.ts` consumes a `MatchView`, the bot's own starting deck/flex choice, legitimately revealed knowledge, an independent bot seed, style and difficulty. It never consumes `MatchState`, a real deck order, an opponent's hidden cards, or the battle RNG. `belief.ts` reconstructs independent hypotheses from observations. Every simulated command settles through the existing `applyCommand`; there is no alternate damage or timing implementation.

Styles remain aggressive/control/growth. Difficulty is independently easy/normal/hard/expert. Room `setupMode` is independently full/quick; full is the default, regardless of training. Old difficulty-less rooms migrate to normal. Rematches retain configuration; replay responses carry the bot version and configuration.

The planner maintains one total simulation budget across actions, samples and replies. It caches child states, deduplicates complete rule-state keys, retains different root actions in its beam, includes END_TURN, and checks real wins, losses, fatigue, notices and round-twelve settlement. Hidden draw/reveal/return boundaries stop the planned route. Only its first command is committed before getting a new view. Hard considers public board and known-hand replies; expert additionally samples plausible unknown composition. All samples within a route use the same action sequence up to a new observation. Covered retaliation is tested against all three possible retaliation types before a lethal claim. This bounded search is not an exhaustive proof of optimal play.

The previous scoring function is frozen in `src/game/ai/legacy.ts`. Benchmark legacy setup uses the old selected flex/default keep, even though shared legal setup enumeration is now complete.

## Runtime

Guest deep planning uses a dedicated module Web Worker; Node uses worker_threads with the same planner package. Requests/results bind match ID, version and request ID. New matches, replacement state and disposal terminate abandoned jobs. Late results cannot commit. Worker exceptions/timeouts return the upgraded easy strategy and preserve explicit fallback diagnostics. Search principal variations, setup commands and hypothetical hidden samples do not enter room snapshots or public diagnostics. Scripted tutorials still use `tutorialCoachCommands`.

## Executed evidence

- `reports/ai-unit.txt`: 34 passing AI tests, including the seven supplied probes converted to real engine fixtures, full setup candidate counts, safety across four levels, multi-command tactics, precise choices, information-equivalent observations, global budgets, cancellation and Node-worker execution.
- `reports/ai-runtime-tests.txt`: 110 passing existing rules, guest, Node HTTP match/replay and tutorial tests.
- `reports/ai-browser-worker.json`: actual Chromium guest-worker run. Expert planning hit its 800 ms protection limit and returned a legal result; animation frames continued. Two workers started and both terminated; the replacement match left the old state version unchanged. This is a desktop browser lab measurement, not mobile or live-player evidence.
- `reports/ai-benchmark*.json`: executed paired results, including retained tuning attempts. The primary holdout benchmark is `reports/ai-benchmark.json`; inspect its status before interpreting completion. Its report includes paired-cluster bootstrap intervals, algorithm/style/seat results, node/time data, observed self-losses, immediate public-win misses, legality and replay checks.

The interrupted asymmetric exploratory benchmark is retained as `ai-benchmark-asymmetric-partial.json`. The primary acceptance benchmark mirrors loadout and education within each pair, varies them across pairs, and swaps algorithms between two legally initialized seats with the same seed. Four disjoint pair-index shards shorten wall time; the merger rejects duplicate pair seats and mismatched implementation hashes. Superseded serial attempts are retained and excluded from final sample counts. It never mutates an already-dealt first-player identity.

An exhaustive missed multi-command lethal oracle has not been implemented; that benchmark field is deliberately not claimed. Tactical regressions prove the enumerated scenarios only. AI strength targets (hard ≥70% against legacy; expert ≥60% against normal with a meaningful interval) must be assessed from completed holdout data, not inferred from architecture or passing tactics.

## Completed developer benchmark

The four fixed-source shards are now merged: **500 pairs / 1,000 games**, **110 education combinations across the combined pool**, **0 illegal commands**, and **all 1,000 replays matching**. `reports/ai-benchmark-validation.json` also verifies the current source hash and pair identity.

| Challenger / opponent | Mean score | Paired bootstrap 95% interval | Target |
| --- | ---: | --- | --- |
| hard / legacy | 77.75% | 71.50%–83.25% | ≥70%, met |
| expert / normal | 61.75% | 57.25%–66.25% | ≥60%, met; interval above 50% |

Each matchup covers 22 combinations and two preset indices. The sample supports the stated targets on those fixtures, without proving balance across every deck. Production timeout behavior must use the separate browser/runtime evidence because the benchmark disables wall-clock cutoffs. Independent post-submission release acceptance is still not-run.
