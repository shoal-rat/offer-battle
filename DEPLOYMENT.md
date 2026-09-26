# 发布与运维

网页位于 **https://weikezhang.cn/offer-battle/**，源代码位于 **https://github.com/shoal-rat/offer-battle**。已上线基础版本使用 GitHub Pages 与 Cloudflare Workers Free；后端地址为 **https://offer-battle-api.offer-battle.workers.dev**，健康检查地址为 `/healthz`。历史线上验收见本页末尾。2.2 的本地开发证据不能替代该版本的发布后验收；本轮独立验收仍为待执行。

## 2.2.0-beta.2 已发布

2026-09-27 已更新 [正式网页](https://weikezhang.cn/offer-battle/)。发布源码为 `79733e220f9ec625cd66e1737841ec9c2f446d78`，网站提交为 `7e7c72c9562833a98713a6f5059600e61d186d90`，[Pages 部署](https://github.com/shoal-rat/shoal-rat.github.io/actions/runs/36270794684) 成功。兼容 Worker 版本为 `59390c39-6047-4269-ad43-a5b747c5cfb8`，保留账号、房间存储和现有权限。

本轮包含单击/拖拽出牌、定向卡牌纸飞机、放慢且不留分身的攻击、手机教程遮挡修复、准备阶段慢练习修复，以及每套 8 张助阵的预设。已有自定义配队保留；使用新版配方需主动点击“应用这套预设”。主开发代理已在发布前完整打完一局并检查结算、回放和返回首页，修复后另开局复查。

正式网页版本和 23 项关键资源哈希核对通过；1440/390px 游客教程均真实完成且没有 API 请求。两个既有账号完成好友房创建、加入、准备、回合操作、WSS 接收和刷新恢复，零页面错误；这是轻量检查，不是完整公网对局。

本地 289 项单测、22 项关键生产浏览器检查、15 项静态套件和 11 项 Cloudflare 集成检查通过；边界及公网复核见 [本轮发布记录](reports/upgrade-v2.2/beta2-release.json)。按用户要求优先上线，48 次独立验收仍未执行。

## 三条运行路径

| 路径 | 游客可用功能 | 账号与房间 | 数据位置 |
| --- | --- | --- | --- |
| GitHub Pages 静态网页 | 四档人机、五课教程、自定义 Offer、配队；显式开启的本机实验 | 注册后调用 Cloudflare 好友房、显式迁移与战报接口 | 本机卡册、草稿与设置在浏览器；当前牌局仅会话暂存 |
| Cloudflare 后端 | 无需登录可读最小邀请预览；不承接人机计算 | 用户名注册/登录/恢复、好友联机、云端卡册迁移、主动保存的标准战报 | SQLite Durable Objects |
| Node 自托管版 | 本地完整版，后台线程人机；可配置外部创作适配器 | 本地会话与 Node WebSocket 房间，不提供 Cloudflare 注册体系 | `DATA_DIR` 原子文件存储；单实例使用 |

Pages 本身没有数据库或 WebSocket 服务。后端暂时不可达时，游客仍可以进入教程或人机；联机和云保存会明确报告连接错误。首次下载页面与媒体资源仍需要网络，未加载的媒体不承诺离线可用。浏览器人机在 Web Worker 中计算，Cloudflare 好友服务不执行机器人搜索。

网页版的注册不是邮箱注册。用户名为 3–32 位英文、数字、下划线或连字符，密码为 12–128 个字符。注册后只展示一次恢复码；恢复密码后旧恢复码和旧会话失效。会话默认 30 天到期，每账号最多保留 8 个活动会话。不要把测试密码、恢复码、令牌或运行数据提交到仓库。

## 2.2 数据与功能边界

登录不会替换本机游客身份，也不会自动把全部本机收藏变成云端卡册。账号迁移先预览，再明确提交；相同内容去重，ID 冲突由用户选择保留两份或使用云端，原本机收藏不删除。好友阵容中的新自定义卡由服务端重新编译，不接受客户端伪造属性；已有同 ID 云端卡不会被客户端旧副本静默覆盖。

私人卡仍使用 2.1 造卡编译器，战斗规则仍为 2.0；AI 有独立的 2.2 版本。已有收藏缺少资料版本时从 revision 0 开始。修订保持卡 ID 并增加定义版本，已开始对局和旧回放继续使用冻结快照。删除卡牌是 30 天可恢复的软删除，同时移除当前阵容引用；恢复卡牌不会自动覆盖当前阵容。

昵称与阵容的条件写入需要 `expectedRevision`。缺少版本返回 428 `PROFILE_REVISION_REQUIRED`，过期版本返回 409 `PROFILE_REVISION_CONFLICT` 及本人最新资料。客户端保留草稿并让用户选择，不自动重试覆盖。保存卡牌、修订、恢复和迁移有幂等处理；网络重试应复用原操作标识，不能每次产生新标识。

生产 Cloudflare 配置未连接识图、绘图、配音或在线模型服务。静态造卡使用本地文本处理、规则编译和随包角色；上传参考图不代表已经执行 OCR。可选远程生成仅由 Node 自托管的服务端适配器配置，失败保留已编译卡牌，旧任务结果不能覆盖新修订。Node 关闭会取消生成请求、等待收尾并原子保存；多个进程不得同时共用一个 `DATA_DIR`。

诊断记录只在本机保留允许的事件与版本等字段，不自动上传；错误报告不包含原始堆栈、自由文本、公司、精确薪酬、令牌或手牌。实验关卡、教程和练习不能冒充标准云端战报；长期保存本地普通局时，服务端会重建初始状态并逐条验证指令。

## Cloudflare Free 部署

需要 Node.js 24+、Cloudflare 账号与 Workers Free 计划。无需启用付费计划，也不要求把个人网站的域名 DNS 迁移到 Cloudflare。

```sh
npm ci
npx wrangler login --use-keyring --scopes account:read user:read workers_scripts:write
npm run test:cloudflare
npm run deploy:cloudflare
```

`wrangler.jsonc` 声明 `AccountRegistry` 与 `BattleRoom` 两类 **SQLite Durable Objects**，首次部署的迁移使用 `new_sqlite_classes`，适配 Free 计划。每个好友房使用独立对象；WebSocket 使用 hibernation，回合超时和房间回收使用 alarm，不靠周期性常驻轮询。

首次部署按 Wrangler 提示启用免费的 `workers.dev` 子域名。部署后记录实际输出的 `https://offer-battle-api.<你的子域名>.workers.dev`，并检查其 `/healthz`。账号密钥不进入前端，也不需要写进仓库。`ALLOWED_ORIGINS` 只填允许的完整来源，逗号分隔；当前为 `https://weikezhang.cn,https://shoal-rat.github.io`。本地跨域调试时另用 `.dev.vars` 加入开发来源，禁止提交该文件。

| 配置 | 默认值 | 用途 |
| --- | --- | --- |
| `TURN_MS` | `30000` | 正式回合时限 |
| `SETUP_MS` | `20000` | 应对牌/换牌阶段时限 |
| `WAITING_RETENTION_MS` | `86400000` | 等待房间与邀请码 24 小时 |
| `ROOM_RETENTION_MS` | `604800000` | 已结束房间临时保留 7 天 |
| `MAX_SAVED_MATCHES` | `30` | 每账号主动保存的战报上限 |
| `ENABLE_BEST_OF_THREE` | 未设置，等同 `false` | 明确允许实验好友三局两胜；生产默认关闭 |

临时好友房仅保留最近 5 次重赛。需要长期保存的对局必须在结算界面点击“长期保存这局”；它们独立存放在账号战报中，直到用户删除或服务维护者清理数据。游客完成普通人机对局后，可当场注册并保存同一局；刷新或关闭已结束的游客牌局后，无法从服务器找回它。自定义云端卡册每账号最多 100 张。本机实验系列赛的局间状态可在同一标签页会话中恢复，最长 12 小时；整组结束后按游客临时记录规则清理。

## 构建个人网站子目录

先部署后端，再使用其真实 HTTPS 地址构建：

```sh
VITE_API_BASE_URL=https://offer-battle-api.offer-battle.workers.dev npm run build:pages
npm run prepare:pages -- /path/to/shoal-rat.github.io
```

`build:pages` 固定 `VITE_BASE_PATH=/offer-battle/`、`VITE_STATIC_MODE=true`，产物写入 `dist-pages/`，包括版本清单 `release.json`。图片、音频、视频、邀请链接和脚本都遵循子目录路径。`VITE_API_BASE_URL` 是公开服务地址，不能携带密码或令牌。

`prepare:pages` 校验目标仓库为 `shoal-rat/shoal-rat.github.io`，仅更新其中的 `offer-battle/`。个人网站现有首页、博客和 `CNAME` 保持原样。确认差异后，在个人网站仓库提交并推送该目录，等待 GitHub Pages 构建完成。不要把整个源码仓库、`node_modules/`、`.env` 或运行数据复制到网站。

Fork 到其他网站时，调整构建脚本中的固定 base、目标仓库校验、页面链接与 Cloudflare 来源白名单。Worker 和静态网页分别发布；修改规则或 API 时应先确保兼容，再更新双方。

## 2.2 前后端切换顺序

先完成源码提交与开发检查，再执行独立验收和发布。不要把本地报告中的工作树验证写成某个线上版本已经通过。2.2 的 `/healthz` 仍报告战斗 `rulesVersion: 2.0.0` 和 `offerCompilerVersion: 2.1.0`，因此仅这两个值不能区分 2.1 与 2.2；还需记录 Wrangler 发布版本、前端提交与 `release.json`。

1. 构建待发布 Pages 产物，记录其源码提交、API 地址和资源清单；保留上一版产物及 Worker 版本作为回退依据。检查既有 DO 绑定和迁移历史，保留 `v1`，不重新创建账号或房间对象。
2. 先更新 Worker。检查健康接口、`/api/capabilities` 中的 `offerRevision`、`offerIdempotency` 与默认关闭的 `experimental.bestOfThree`，以及未登录私有接口返回 401。用测试账号核实资料 revision、迁移预览和标准好友房协议。
3. 紧接着发布匹配的 Pages 产物。核实 `/offer-battle/` 下的脚本、Web Worker、角色资源和邀请链接，再完成两个独立账号的准备、指令、重连、保存与回放检查。
4. 明确提示仍打开旧版页面的玩家刷新后再编辑资料。老对局的冻结定义与命令协议保留兼容，但 2.1 客户端缺少 `expectedRevision`，切换期间资料写入会被新服务拒绝为 428。这是防止过期覆盖的保护，不能承诺旧页面所有编辑功能无感升级。2.2 页面也不能在旧 Worker 上假设修订、迁移或实验接口已存在。

应把前后端切换安排在同一个发布窗口。切换尚未完成时，已加载的游客人机仍可在本机运行；云端新功能要等两端匹配。发现异常优先暂停新入口或修正兼容服务；如需回退，核对前后端组合和已经写入的数据字段，不能只回退静态页面后宣称完整回滚，更不能通过删除 DO 数据恢复旧版本。

## 实验开关

浏览器的 `tempo`、`challenges`、`series`、`boss`、`achievements` 五项设置默认全部为 `false`。玩家须在实验室中逐项开启；开关只影响独立入口，不修改标准局规则。节奏实验由 `scripts/simulate-tempo.ts` 单独运行，标准房间拒绝数值实验字段。固定残局与 Boss 标记公开关卡条件，继续使用正常引擎结算。

Node 只有在服务端 `ENABLE_EXPERIMENTS=true` 时接受残局、Boss 和真实事件成就记录，在 `ENABLE_BEST_OF_THREE=true` 时接受系列赛。Cloudflare 仅实现可选好友系列赛，需维护者显式设置 `ENABLE_BEST_OF_THREE` 为字符串 `true`；当前 `wrangler.jsonc` 未设置它。网页开关不能绕过服务端限制，Cloudflare 不承接残局、Boss 或机器人计算。

系列赛锁定学历、三张 Offer 和十二张基础牌，仅局间调整三张应对牌；先两胜结束，平局不计胜场，最多九局后按胜场判定。比分与锁定阵容由服务器保存。实验局有单独标记，不写入标准长期战报；默认关闭的能力未经上线验收不能宣传为正式好友功能。成就只产生外观贴纸，没有数值奖励。

## 发布前检查

```sh
npm run assets:check
npm test
npm run build
npm run test:cloudflare
npx playwright install chromium
E2E_PRODUCTION=1 npm run test:e2e
npm run test:e2e:static
```

- 规则测试验证合法动作、确定性重放、教程、动画队列和纯本地游客路径。
- Cloudflare 测试使用真正的 workerd/Miniflare 与 SQLite Durable Objects，验证账号、好友房、隐藏信息、持久化和权限边界。
- 静态浏览器测试禁用游客 API 网络，验证教程恢复；账号界面使用明确的测试接口夹具。它们不能代替实际部署后的双客户端联机检查。
- 传统 Node 浏览器套件继续验证拖拽、布局、音乐、技能影片、全屏请求、对手技能与双方战败。像素基线来自 macOS，Linux CI 运行功能用例。

上线后至少检查：网页和子目录资源加载、游客人机/教程、注册及登录、两个独立浏览器的好友房与出牌、断线恢复、对局结算、保存与跨会话回放、另一个账号无法读取私有战报。

## 免费额度与维护边界

Cloudflare 免费服务有额度上限，不是无限服务器。SQLite Durable Objects 免费额度及超额行为以 [Cloudflare 官方价格说明](https://developers.cloudflare.com/durable-objects/platform/pricing/) 为准；Workers 请求和 CPU 限制见 [官方限制](https://developers.cloudflare.com/workers/platform/limits/)。本项目用休眠连接、事件触发和保存数量上限控制资源消耗，没有自动升级付费计划的代码。

请在 Cloudflare 控制台查看实际请求、存储、错误和限额。账号与对局属于运行数据；源码开源不意味着这些数据公开。恢复码只能由玩家自己保管，维护者看不到明文密码与恢复码。长期保存表示跨设备保留，不构成无限期托管或备份保证；玩家可以在登录后导出 JSON 战报作为个人备份。

删除 Worker 或 Durable Object 数据会影响账号和已存对局。正常更新使用 `wrangler deploy`，不要删除既有 migration 或用全新绑定替代原数据库；数据格式升级应提供明确迁移方案。当前版本尚未经过独立安全审计或公网容量压力测试。

## 2.2 后端实际发布（2026-09-27）

Cloudflare 正式 Worker 已发布为 `b34a8571-5982-41b6-8698-e9fd608cbc3c`。部署前的 Cloudflare 类型检查和 dry-run 通过；部署后的 `/healthz` 与 `/api/capabilities` 均为 200，匿名资料请求为 401，合法来源预检为 204，未知来源为 403。生产三局两胜仍关闭，没有重置 Durable Objects 或修改 secrets。完整记录见 [后端发布证据](reports/upgrade-v2.2/cloudflare-v22-deployment.json)。

这份记录只证明正式后端已发布及上述 HTTP 边界通过，不代表 48 轮独立 Agent 验收已完成。静态页面部署与完整联机、造卡、保存回放路径的验收单独记录。旧 2.1 标签页编辑资料时应刷新，加载携带 `expectedRevision` 的新版页面。

## 历史基础版本线上验收（2026-09-26，不代表 2.2）

后端版本：`c96f68f9-b3a6-4e77-a514-3bfaba954f6d`。使用 Workers Free 和 SQLite Durable Objects，无付费资源升级。首次部署的域名证书在短暂传播后正常生效；实际 HTTPS 健康检查返回 200，游客访问账号战报返回 401 `AUTH_REQUIRED`。

两名真实测试账号在公网完成 50 条合法指令的一整局，双方各收到 109 次 WSS 状态快照。已验证手牌裁剪、好友战报保存与重放、本地完成对局导入、好友重赛、重新登录读取历史、恢复码轮换和旧令牌失效。整组协议验收耗时约 56 秒，首次注册/登录各约 1 秒（含网络往返）。测试账号与凭证保存在未公开的本地工作目录。

正式网页另使用两个隔离的 Chromium 浏览器上下文，实际登录、创建房间、通过邀请加入、准备、选择应对牌、换起手牌和点击 Offer 上桌。双方通过 UI 提交 7 次操作，再用各自公开视图中的合法指令推进 43 次，完成第 8 轮结算；双方实际接收 141 / 136 次 WSS 消息。断网后刷新保留席位和回合截止时间。双方都通过界面保存对局并打开已校验的回放，另一个账号读取私有记录返回 404，刷新后登录状态保留。

第三个游客浏览器在 390px 下阻断所有 API，完成第一课四步、刷新恢复和临时记录清理，实际 API 请求为 0。人工检查发现结业面板在窄屏发生裁切，已修正网格与宽高约束，补充四边界断言，并在生产包中完成 10 项静态回归；增量发布后，在正式网址再次完成 390px 教程全过程与结业四边界检查，1/1 通过（8.7 秒）。

首次线上发布的 305 个文件已全部进行 HTTP 检查，0 缺失；个人网站仅新增或更新 `offer-battle/`，同时使用已签发的站点证书启用 HTTPS。上述检查不等同于大规模并发压力测试。

机器可读取的脱敏公网结果见 [线上验收摘要](evidence/online-validation.json)。网页发布提交为 `1d945c9f5574dd834ad8f70fa99ccdf2d6ffbae1`；不公开测试账号、密码、恢复码或完整浏览器 trace。
