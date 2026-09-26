# 发布与运维

网页位于 **https://weikezhang.cn/offer-battle/**，源代码位于 **https://github.com/shoal-rat/offer-battle**。本次发布使用 GitHub Pages 与 Cloudflare Workers Free；后端已部署到 **https://offer-battle-api.offer-battle.workers.dev**，健康检查地址为 `/healthz`。发布验收见本页末尾。

## 三条运行路径

| 路径 | 游客可用功能 | 账号与房间 | 数据位置 |
| --- | --- | --- | --- |
| GitHub Pages 静态网页 | 人机、五课教程、练习、自定义 Offer、配队 | 注册后调用 Cloudflare 好友房与战报接口 | 游客卡册与进度在浏览器，当前牌局仅会话暂存 |
| Cloudflare 后端 | 不承接游客人机计算 | 用户名注册/登录/恢复、好友联机、长期战报 | SQLite Durable Objects |
| Node 自托管版 | 原本地完整版，可在局域网直接使用 | 本地会话与 Node WebSocket 房间 | `DATA_DIR` 原子文件存储 |

Pages 本身没有数据库或 WebSocket 服务。后端暂时不可达时，游客仍可以进入教程或人机；联机和云保存会明确报告连接错误。首次下载页面与媒体资源仍需要网络。

网页版的注册不是邮箱注册。用户名为 3–32 位英文、数字、下划线或连字符，密码为 12–128 个字符。注册后只展示一次恢复码；恢复密码后旧恢复码和旧会话失效。会话默认 30 天到期，每账号最多保留 8 个活动会话。不要把测试密码、恢复码、令牌或运行数据提交到仓库。

## Cloudflare Free 部署

需要 Node.js 24+、Cloudflare 账号与 Workers Free 计划。无需启用付费计划，也不要求把个人网站的域名 DNS 迁移到 Cloudflare。

```sh
npm ci
npx wrangler login --use-keyring
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

临时好友房仅保留最近 5 次重赛。需要长期保存的对局必须在结算界面点击“长期保存这局”；它们独立存放在账号战报中，直到用户删除或服务维护者清理数据。游客完成普通人机对局后，可当场注册并保存同一局；刷新或关闭已结束的游客牌局后，无法从服务器找回它。自定义云端卡册每账号最多 100 张。

## 构建个人网站子目录

先部署后端，再使用其真实 HTTPS 地址构建：

```sh
VITE_API_BASE_URL=https://offer-battle-api.offer-battle.workers.dev npm run build:pages
npm run prepare:pages -- /path/to/shoal-rat.github.io
```

`build:pages` 固定 `VITE_BASE_PATH=/offer-battle/`、`VITE_STATIC_MODE=true`，产物写入 `dist-pages/`，包括版本清单 `release.json`。图片、音频、视频、邀请链接和脚本都遵循子目录路径。`VITE_API_BASE_URL` 是公开服务地址，不能携带密码或令牌。

`prepare:pages` 校验目标仓库为 `shoal-rat/shoal-rat.github.io`，仅更新其中的 `offer-battle/`。个人网站现有首页、博客和 `CNAME` 保持原样。确认差异后，在个人网站仓库提交并推送该目录，等待 GitHub Pages 构建完成。不要把整个源码仓库、`node_modules/`、`.env` 或运行数据复制到网站。

Fork 到其他网站时，调整构建脚本中的固定 base、目标仓库校验、页面链接与 Cloudflare 来源白名单。Worker 和静态网页分别发布；修改规则或 API 时应先确保兼容，再更新双方。

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

## 本次线上验收（2026-09-26）

后端版本：`c96f68f9-b3a6-4e77-a514-3bfaba954f6d`。使用 Workers Free 和 SQLite Durable Objects，无付费资源升级。首次部署的域名证书在短暂传播后正常生效；实际 HTTPS 健康检查返回 200，游客访问账号战报返回 401 `AUTH_REQUIRED`。

两名真实测试账号在公网完成 50 条合法指令的一整局，双方各收到 109 次 WSS 状态快照。已验证手牌裁剪、好友战报保存与重放、本地完成对局导入、好友重赛、重新登录读取历史、恢复码轮换和旧令牌失效。整组协议验收耗时约 56 秒，首次注册/登录各约 1 秒（含网络往返）。测试账号与凭证保存在未公开的本地工作目录。

页面发布与双浏览器操作检查正在本次发布流程中进行；完成后将补入最终结果。上述协议检查不等同于大规模并发压力测试。
