# 独立浏览器 Agent 验收

这套 runner 真正启动独立 Codex CLI 会话和独立 Playwright BrowserContext。计划是 12 个角色 × 4 个 run；新手只能看到截图、坐标点击、滚动、键盘和当前 URL。计划、工具链冒烟和游戏验收分别统计。

`agents/run-plan.json` 是固定样本清单，不因重试扩充样本数。执行结果写到 `reports/agent-runs/<runId>/session.json`；原始模型调用、截图、视频、trace、账号及匿名版本映射保存在忽略的 `work/agent-runs/` 下，不随公开仓库发布。

## 当前版本的验收依据

beta.2 采用默认直接点牌/拖牌、定向纸飞机和较慢实体交锋，覆盖旧升级包中多次确认与短动画预算。专项角色提示已采用 [当前验收补充](../docs/QA_BETA_2.md)；不要以缺少强制“使用/确认行动”按钮或超过旧动画预算判错。网络权威确认、未提交不消耗、隐私和正式回合期限的要求保持不变。

A01/A02 提示保持初见盲测，不提供操作路线、按钮名或选择器答案。A08 对缺少成对图的场景明确保留 blocked；A09 正常速度原生视频观察依旧 blocked。历史失败不覆盖。正式 48 轮须等待 beta.2 完整流程亲自体验、修复、发布与冻结构建后启动，目前未运行。

## 运行前

需要 Node.js 24+、现有已登录的 Codex CLI、Playwright Chromium 和 WebKit。CLI 路径可通过 `CODEX_QA_CLI` 或 `--cli` 指定，模型通过 `--model` / `QA_MODEL` 显式指定。runner 不读取或导出 CLI 的登录凭据。

```sh
npx playwright install chromium webkit
npm run test:agents:plan -- --url http://127.0.0.1:5344/offer-battle/ --model gpt-6-astra
```

plan 验证每角色工具和浏览器，以及以下私有素材，并为每个 run 输出独立 readiness。没有参考图不会阻塞规则角色，A09 的部分能力也不会阻塞其他角色。

- `--storage-fixture work/agent-returning-fixture.json`：`{ "synthetic": true, "storage": { "key": "string value" }, "sessionStorage": { "key": "string value" } }`。仅虚构本地收藏、阵容与活跃练习存档；不接受账号、授权或 token 键。每次 run 使用自己的副本。
- `--accounts work/agent-accounts.json`：`{ "synthetic": true, "accounts": [{ "runId": "A05-R01", "username": "synthetic_user", "password": "private fixture password", "registered": true }] }`。A05/A06 共需 8 个不同账号。已注册账号从可见 UI 登录，runner 不偷偷代登录。使用隔离测试后端；生产注册限流保持不变。
- `--references work/agent-visual-inputs.json`：数组，每项为 `{ "id": "ref-1", "kind": "reference", "path": "work/reference.png", "sourceUrl": "official source" }` 或 `{ "id": "capture-1", "kind": "capture", "path": "work/capture.png", "scene": "home-first", "version": "baseline" }`。baseline/candidate 应覆盖首页首帧、搭台后、菜单、弹窗、满场、结算及手机。必须是实际浏览器记录。每轮整体随机标为 X/Y，仅向审稿 agent 显示匿名标签与场景；原始对应关系保存在私有目录。A08 不访问实时候选页，以免破坏盲评。

## 工具隔离与冒烟

CLI 不载入用户配置、项目指令、技能或其他插件；禁用 shell、内置浏览器、应用、文件图像工具及其他工具来源，MCP `enabled_tools` 与服务器自身校验双重限制工具。Code Mode 排除 `functions`、`collaboration`、`clock`、`default` 底层工具 namespace，保留无文件/网络接口的调用包装器。只有本地受限 MCP 网关预先批准执行。

配置机制见 [官方配置参考](https://learn.chatgpt.com/docs/config-file/config-reference) 与 [官方 MCP 配置](https://learn.chatgpt.com/docs/extend/mcp)。配置变化或 CLI 版本变化使已有 smoke 证明失效；每次正式会话还需列出实际底层工具清单，未知工具使结果 blocked。

```sh
npm run test:agents:run -- --smoke --url http://127.0.0.1:5344/offer-battle/ --model gpt-6-astra
```

smoke 只读取 URL 和截图，不操作游戏，不计入 48 轮。其 session 状态固定为 blocked（非游戏验收），成功的真实 CLI/MCP 链路另写 `toolchain.json`。本机已真实验证 `codex-cli 0.158.0-alpha.2.1` 与显式 `gpt-6-astra`。该 CLI 的 ephemeral JSON 事件未报告 resolved model，因此 `requestedModel` 记录明确传入值，`actualModel` 保持 null，不能声称取得了服务端模型元数据。

## 首次源码推送后运行

正式运行会检查 HEAD 与远程同名分支 SHA 一致、源码工作区没有变化。必须先完成首推，随后冻结被测构建及源码。公开 reports 和私有 work 文件不影响源码一致性检查。

```sh
npm run test:agents:run -- \
  --all --published-commit <已推送的完整HEAD-SHA> \
  --url http://127.0.0.1:5344/offer-battle/ \
  --allow-origin http://127.0.0.1:5299 \
  --model gpt-6-astra --concurrency 3 \
  --storage-fixture work/agent-returning-fixture.json \
  --accounts work/agent-accounts.json \
  --references work/agent-visual-inputs.json
```

A05/A06 自动成对执行，只通过公开邀请文件交互；两边账号、Cookie、模型上下文和浏览器存储独立。并发 3 表示最多三个 CLI/浏览器会话，好友对占两个。A10 性能测试独占调度队列，避免其他 agent 干扰采样。不同角色也可用独立 `--run A07-R01` 命令测试不同部署 URL，最终 verifier 合并固定 run ID。

重试使用 `--run A01-R01 --retry`，保留失败 attempt，并创建新的模型和浏览器上下文。不要同时从两个 runner 启动同一 run ID。

```sh
npm run test:agents:verify
```

verify 核对 48 个 run、实际会话和浏览器 ID 的独立性、模型参数、提交、工具策略、完整视频/trace/截图及所有证据哈希。未执行、工具缺失、失败、缺证据均不能通过。开发修复应形成新的提交与冻结构建，复核使用同一 run ID 的新 attempt，不抹掉失败证据。

## 明确的能力边界

A09 能录制真实连续视频，观察连续时码帧及帧间隔、长任务数据；当前模型工具无法原生观看正常速度视频。因此允许它真实执行受支持的逐帧复核，但 `normalSpeedMotionReview` 及全门槛保持 blocked。静态画面正确不能证明动画顺滑。

A07/A12 的白盒权限限固定源码目录和预定义测试套件；没有任意命令或 JavaScript 输入。AI 的 1000 局开发基准单独保存在 benchmark 报告中，不算这 48 个 agent 样本。A10 的性能结果注明测试机和浏览器仿真，不代表真机性能。`emulated-touch` 表示设备仿真；没有伪称真实手机。

公开投影仅输出计数、状态、缺陷严重度和证据引用，原始缺陷文字与 UI 记录应在私有 work 中审阅后再脱敏发布。真人留存、分享率等字段始终为空。
