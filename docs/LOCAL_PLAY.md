# 本地开桌与开发说明

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

文案服务接收 `{model, offer, instruction}`，返回 `{name, description, quote}`；图像服务接收 `{model, offer, size, instruction}`，返回 `{mime, base64}`。URL、模型和密钥只配置在服务端。

启用图像服务后，“生成新外观”显示任务状态与失败重试。失败时仍保留已有职业插画和固定规则。参考图片目前需要人工确认字段，不声称自动 OCR。

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
| 首页能开，但无法创建对局 | 检查 Node 服务是否在运行，以及 API 地址是否指向真实后端 |
| 朋友打不开邀请 | 不要发送 `localhost`；确认网络、访问地址、协议和后端来源配置 |
| 音乐没有开始 | 先点击页面产生一次用户手势，再检查音乐、音效音量和浏览器静音 |
| 浏览器没有进入全屏 | 全屏可能被宿主或浏览器拒绝；仍可在窗口中玩，使用右上角全屏按钮重试 |
| 刷新后没有原收藏 | 检查是否换了域名、浏览器、存储数据或服务器 `DATA_DIR` |
| 端口被占用 | 更换 `PORT` 或先关闭旧进程，避免误操作正在进行的对局 |
| 新外观生成失败 | 检查可选适配器是否配置正确；使用内置插画仍可完成游戏 |

更多已知边界见 [IMPLEMENTATION_STATUS.md](../IMPLEMENTATION_STATUS.md)，发布前本地检查见 [TEST_REPORT.md](../TEST_REPORT.md)。
