# Paper Office 2.2 — asset production handoff

These are actual local runtime assets. Raster artwork and facial edits were made with the built-in imagegen tool; thumbnails and portraits are deterministic crops/resizes of the same approved identity. Paper accessories and UI plates are original SVG.

## Delivered

Current manifest: **56 asset entries, 199 runtime image/SVG files, 4,576,653 bytes (about 4.58 MB)**. JSON maps and evidence are additional files.

- 23 transparent character masters: 17 human profession/education identities plus six distinct animal support characters.
- Each character has 128/256/768px-high full-body exports, 128/256px square portraits and foot pivot (0.5, 0.94).
- Eight same-identity imagegen face edits: algorithm and research each have hit, happy, thinking and true closed-eye blink frames.
- All 23 characters have actual body/face/prop DOM layers using complementary runtime SVG masks. Ground shadows are separate.
- Four distinct action illustrations: N07, N08, N09, F04.
- Eight transparent scene props: table, chair, printer, folder, badge-rack, booth, paper-book, far.
- Eleven S00–S10 SVG accessory/seal pairs, an irregular cut-paper blank title plate and a ground-shadow SVG.

## Animal support mapping

| Rule | Character | Runtime identity |
| --- | --- | --- |
| N01 实习搭子 | Beagle with onboarding notebook | intern-beagle |
| N02 面经收集员 | Owl with interview-study binder | interview-owl |
| N03 校招生鼠鼠 | Very fat round gray rat with résumé folder | campus-rat |
| N04 内推学长 | Capybara with referral card | mentor-capybara |
| N05 老员工 | Tortoise with insulated tea mug | veteran-tortoise |
| N06 猎头姐姐 | Red fox with recruiter smartphone | headhunter-fox |
| K01 实习生 | Shares N01 animal identity | intern-beagle |
| K02 临时同事 | Shares N04 animal identity | mentor-capybara |
| K03 项目搭子 | Shares N01 animal identity | intern-beagle |

N01–N06 each have a separate new animal painting. Tokens explicitly share existing animal identities. The previous human support illustration is retained as a generic human profession fallback; no N01–N06 or K01–K03 card maps to it. Offer characters stay human. The six-animal browser grid is `assets/paper-source/evidence/animals-support-512.png`.

## Runtime paths and API

| Asset | Runtime path |
| --- | --- |
| Character | `/assets/paper/characters/{id}/{128,256,768}.webp` |
| Portrait | `/assets/paper/characters/{id}/portrait-{128,256}.webp` |
| Face variant | `/assets/paper/expressions/{algorithm,research}/{hit,happy,thinking,blink}/{128,256,768}.webp` |
| Action | `/assets/paper/actions/{N07,N08,N09,F04}/{128,256,768}.webp` |
| Homepage prop | `/assets/paper/props/{id}/{256,768,1536}.webp` |
| Second education | `/assets/paper/education/{S00…S10}/{accessory,seal}.svg` |
| Title / shadow | `/assets/paper/props/{title-sign,shadow}/{title-sign,shadow}.svg` |

Character/action size keys describe height; prop keys describe longest side. `public/art2.2-manifest.json` is the full inventory; `public/assets/paper/assetmap.json` is the compact runtime map. Both include explicit rule mappings. Source/runtime hashes, sizes, alpha, pivots, versions, prompts and original edit-target hashes are recorded.

`PaperCharacter` accepts `artId`, `size`, `expression`, `layer="all" | "character" | "body" | "face" | "prop" | "shadow"`, and `renderMode="raster" | "vector"`. It exposes real `data-rig-layer` nodes for `move`, `body`, `face`, `prop`, `shadow`; move the entire figure through `move`. `PAPER_SUPPORT_CHARACTER` maps both support rules and derived tokens. `heroArt(id)` defaults to a same-identity portrait; use `heroArt(id, "full", 768)` for the full body. Legacy audio/other asset resolution is preserved.

## What the rig actually contains

Body masks subtract face and prop regions; face masks subtract the prop; prop masks select the held object and its existing gripping hand/paw/wing where necessary. Their neutral union reproduces the approved image exactly in the production pixel comparison. Per-character boundaries and pivots are in `assets/paper-source/rig-masks.json`.

These are **runtime cuts of complete paintings, not independently painted source layers**. Hidden surfaces have not been reconstructed. Large relative rotations reveal cut boundaries, so use restrained paper-puppet motion. Face edits are consumed only through the face mask; body and prop always use the original master. Variant exports reuse the parent's crop and placement. One research happy source returned 1087×1447 instead of 1086×1448; its deterministic one-pixel canvas alignment is recorded, and the source remains unchanged.

Blink uses actual generated closed eyelids. Other identities retain their neutral face. A missing mask during HMR or a partial update uses a safe composite illustration fallback rather than crashing React. SVG clones must remap IDs and their `url(#...)` references together; the parent integration handles this.

## Source, rebuild and production evidence

Approved source PNGs are under `assets/paper-source/character`, `expression`, `action` and `prop`; original SVGs are under `education`. Exact prompts are in `scripts/paper-assets-input.json` and `scripts/paper-assets-expressions-input.json`. The inherited algorithm master is honestly marked as an existing approved master whose original tool prompt was not supplied to this producer. No unavailable seed is invented.

- Rebuild: `node scripts/paper-assets-build.mjs` (ImageMagick). Existing unchanged exports are hash-checked and reused; set `PAPER_ASSETS_FORCE=1` for a full export after changing normalization behavior.
- Runtime checks: `node scripts/paper-assets-qa.mjs`.
- Actual component masks and expression contacts: `npx tsx scripts/paper-assets-rig-qa.tsx`.
- Integration type check: `npm run typecheck`.

Evidence under `assets/paper-source/evidence` includes 72/128/512px character contacts, dark-background portraits, the six-animal grid, props/actions/overlays, isolated actual component layers, and both expression sheets. `qa-report.json` records 199 runtime files with no hash, dimension, alpha, decode or foot-pivot failures. `rig-qa-report.json` records all 23 figures with zero channel difference versus the original neutral image at 240×320 and non-empty body/face/prop layers. `review.json` retains source-hash-bound manual review. `typecheck.log` records successful TypeScript integration.

## Remaining scope and limits

Only four action paintings are individual; other action/retort rules use explicit nearest-theme fallback assets. Tokens share named animal identities. Animals and the remaining human identities do not yet have separately generated expression variants.

Static production QA does not prove game-page layout, dialogue, cue completeness or normal-speed motion acceptance. Those belong to the parent integration and later independent review. This producer changed no card UI layout, ran no independent test-agent workflow, and performed no commit, push or deployment.
