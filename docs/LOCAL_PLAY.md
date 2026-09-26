# 本地开桌与开发说明

此页对应 2.2 开发分支。正式网址的已发布版本见 [部署记录](../DEPLOYMENT.md)，新版本的后端与网页发布顺序见 [2.2 发布准备](RELEASE_2_2.md)。

## 推荐启动方式

需要 Node.js 24 或更新版本。测试过的本地环境为 macOS arm64、Node.js 26.4.0、npm 11.17.0；Windows 启动器随仓库提供，但发布前报告未声称做过 Windows 实机验收。

```sh
npm ci
npm run build
npm start
```

打开 `http://localhost:5173`。第一次安装依赖需要联网，内置素材可直接使用，不要求模型密钥。

也可以运行 `./start.sh`，macOS 双击根目录的 `开始游戏.command`，Windows PowerShell 执行 `./start.ps1`。启动器默认采用生产模式，按锁文件检查依赖、检查素材并初始化内容种子；已有收藏不因再次启动而重置。

## 配置端口与数据

复制根目录 `.env.example` 为 `.env`。常用项：

```dotenv
PORT=5173
HOST=0.0.0.0
DATA_DIR=./data
TURN_MS=30000
```

已有 shell 环境变量优先。端口占用时改为其他端口，例如 5174。保留原来的 `DATA_DIR` 才能保留访客会话、收藏与房间；不要把真实运行数据提交到 Git。

两个玩家使用独立浏览器或隐私窗口，避免共享同一访客令牌。局域网朋友使用运行电脑的局域网 IP；`localhost` 只代表访问者自己的电脑。跨公网与网站子目录部署另见 [DEPLOYMENT.md](../DEPLOYMENT.md)。

## 开发模式与稳定试玩

```sh
npm run dev
```

开发模式会随源码更新刷新页面。需要稳定打完一局时，先停止开发服务，执行 `npm run build` 与 `npm start`。不要让两个服务争用同一端口或并发写入同一数据目录。

## 可选的创作服务

本地规则卡、内置插画和基础文案立即可用。图像与文案适配器彼此独立，协议定义在 [`server/providers.ts`](../server/providers.ts) 和 [`.env.example`](../.env.example)。它们使用指定的结构化 JSON，不是把任意厂商聊天接口填入 URL 就能运行。

文案服务接收 `{model, offer, preferences, characterSeed, instruction}`，返回 `{name, description, quote}` 和可选 `lines`；岗位名由已确认资料保留，远程结果不能改规则数值。图像服务接收 `{model, offer, preferences, characterSeed, previousArt, size, transparentBackground, instruction}`，返回 `{mime, base64}`。同一角色种子用于延续身份，不等于生成服务保证像素一致。URL、模型和密钥只配置在服务端。

可选图片字段提取使用服务端 `EXTRACT_PROVIDER_URL` 和 `EXTRACT_PROVIDER_KEY`，返回 `{fields:{...}}`，未识别字段必须省略。未配置时只提供本地文本提取和图片参考，不宣称自动识图；提取候选仍须玩家确认，不能推测工资或把未知值改为零。详细输入、校验和超时以适配器代码为准。

生成任务显示真实进度与失败重试；失败时仍保留已有职业插画和固定规则。改草稿会使旧生成结果失效。浏览器读取能力接口后才开放对应入口；当前 Cloudflare 部署不因为 Node 配置了适配器而自动获得这些能力。

## 游客、账号与实验

Pages 版本的游客人机、教程与当前回放直接在浏览器运行，不需要 Node 服务。收藏使用本地存储，当前标签页的临时对局可恢复；换域名、清除存储或换浏览器不会自动同步。本地收藏主动迁移账号前会显示预览，迁移后仍保留本地原件。

好友联机和长期战报需要账号与兼容后端。生成 Pages 包使用 `VITE_API_BASE_URL` 和 `npm run build:pages`，普通 `npm run build` 则用于 Node 自托管。不要把模型服务密钥写进 `VITE_*`，这些变量会进入公开网页。

挑战、Boss、系列赛与外观成就默认关闭。浏览器设置、服务端能力及战绩隔离是不同边界；Cloudflare `ENABLE_BEST_OF_THREE` 未配置时为关闭。保持默认值即可玩标准对局。

## 运行检查

```sh
npm run typecheck
npm test
npm run assets:check
npm run build
npm run simulate -- --games 220
npx playwright install chromium
E2E_PRODUCTION=1 npm run test:e2e
```

Windows PowerShell 先执行 `$env:E2E_PRODUCTION="1"`，再运行 `npm run test:e2e`。视觉基线检查使用 `npm run test:visual`；更新基线前先确认实际页面可读、无遮挡。

Playwright 会按项目配置启动隔离测试服务，测试数据与真实 `data/` 分离。具体测试端口、工作目录和命令以 [`playwright.config.ts`](../playwright.config.ts) 为准。

## 常见情况

| 现象 | 检查方式 |
| --- | --- |
| Node 首页能开，但无法创建对局 | 检查 Node 服务和端口；静态游客人机不依赖这个服务 |
| 游客能玩，但好友或保存失败 | 检查登录状态、后端 HTTPS 地址、能力接口和来源配置 |
| 朋友打不开邀请 | 不要发送 `localhost`；确认网络、访问地址、协议和后端来源配置 |
| 音乐没有开始 | 先点击页面产生一次用户手势，再检查音乐、音效音量和浏览器静音 |
| 浏览器没有进入全屏 | 2.2 默认由玩家选择全屏；浏览器可能拒绝请求，仍可在窗口中玩 |
| 刷新后没有原收藏 | 检查是否换了域名、浏览器、存储数据或服务器 `DATA_DIR` |
| 端口被占用 | 更换 `PORT` 或先关闭旧进程，避免误操作正在进行的对局 |
| 新外观生成失败 | 检查可选适配器是否配置正确；使用内置插画仍可完成游戏 |

更多已知边界见 [IMPLEMENTATION_STATUS.md](../IMPLEMENTATION_STATUS.md)，发布前本地检查见 [TEST_REPORT.md](../TEST_REPORT.md)。
