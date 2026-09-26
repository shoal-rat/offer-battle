# 秋招斗兽棋 · Offer Battle

**工资先亮，底牌后出。**

把同学群里的 Offer 嘴仗，变成一场有来有回的卡牌对决。大厂算法岗排面很足，银行基层底气很稳，制造业研发还能继续成长——可桌上只有四个位置，这轮只有几个小时。现在上桌，还是留一手？

[游戏入口](https://weikezhang.cn/offer-battle/) · [第一局](#第一局怎么开始) · [本地运行](#把牌桌开在自己电脑上) · [设计手记](NOTES.md) · [2.2 发布准备](docs/RELEASE_2_2.md)

> **2.2 公测版。** 当前版本通过基础回归后直接发布，再开展独立测试和持续补丁迭代；完整验收尚未完成。正式版本、提交和公网检查以 [部署记录](DEPLOYMENT.md) 为准。已完成 1,000 局 AI 配对基准；48 次独立产品测试另行记录，不把机器人对战当成用户体验验收。

## 从一份工作，做出自己的角色

**工作名字要准确。** “大厂算法岗”“投行做债”“央企总部”是你展示的具体岗位，11 种玩法类型负责技能。添加新公司、新职业不必重写规则；名字、台词和插画不会偷偷加属性。

**同年包也能有不同打法。** 年包决定基础费用，工作性质与节奏调整上桌时机；城市、行业、公司情况等影响排面与底气的有限转换。造卡页实时展示费用、排面、底气和逐项依据。未知薪酬不会自动填成一份看起来合理的工资；明确填写、确认零值或使用标注过的示例，再保存自己的卡。

**草稿值得被认真对待。** 原始资料、固定规则、人物设定与对局状态分层保存。改字段会让旧预览失效；重复保存有幂等保护，编辑修订保留稳定卡 ID，旧生成任务不能覆盖新草稿。发生账号同步或版本冲突时保留本地修改，让你看到处理入口。

完整公式与历史兼容见 [Offer 规则与扩展](RULES_AND_EXTENSION.md)。这是游戏映射，不是薪酬市场报价、求职建议或现实职业排名。

## 一张纸片牌桌，也要把规则讲清楚

2.2 的首页是一座可以点击的秋招纸片广场：桌子通向对战，打印机通向制作，文件夹通向卡册。入口使用真实文字与按钮，装饰未加载时也可以开打。Offer 使用职业人物，六种助阵全部使用动物：比格犬、猫头鹰、胖老鼠、水豚、陆龟和狐狸。卡面、上桌角色与详情延续同一身份，远看也能区分角色类型。按钮和标签采用原创剪纸与撕纸边缘，文字与点击区域保持完整。

攻击、受击、上桌、回手、退场与补位只在正式事件确认后播放。规则状态、网络请求和展示动画分别管理，读牌与查看日志不会因为演出而被锁住。退场先保留原位置，再补位；终局清理积压，用短收尾接到胜负与重赛入口。支持跟随系统、完整和减少动态，首页环境动作可以单独暂停。

配乐覆盖大厅、教学、对战、紧张、胜利和失败；音效与音乐独立调节。没有首次用户手势不播放，切到后台会暂停。图像、角色、六首配乐和音效随仓库提供，正常游玩不需要模型密钥。生成资源和复用范围见 [美术报告](ASSET_REPORT.md)、[素材许可](ASSET_LICENSE.md)。

## 第一局怎么开始

1. **点“先打一局”。** 从一本＋一本、一本＋985、211＋211、985＋985、清北＋清北五套预设开始；另有一套解锁后出现。每套显示思路、短板和三份 Offer，先预览再应用，也可以继续修改。公共阵容可以直接玩，不必先录入薪酬或完成全部教程。普通人机提供按当前局面出现的“边打边学”提示，可随时关闭；“练一招”保留五课操作教程。
2. **选择对手。** 简单、普通、困难、极难四档难度与进攻、控制、成长三种风格分别选择。完整开局会选择应对牌和换起手；快速开局是独立选项。机器人读取自己的合法玩家视图，搜索在独立线程进行。
3. **用好这一轮的时间。** 每方 30 心态，每轮可用时间从 1 小时增长到最多 8 小时，场上各有 4 个位置，最多 12 轮。三份 Offer、双学历、12 张基础牌与 3 张应对牌共同组成阵容。
4. **读完，再决定。** 支持点击、鼠标和触摸拖拽；选目标后查看公开信息下的行动预览，再确认。未知反话保留不确定提示。双方学历技能都可查；暂时不可用时也能读到原因。全屏由玩家选择。
5. **回看这一局。** 结果页提供同阵容再来、调整阵容和分享名场面。关键回合、实际结果和学习点都关联事件序号，可跳到回放；证据不足时只作描述，不编造最优解。

手机可以逐张放大读牌；桌面与手机分别布局，不靠把关键规则压成小字来塞满屏幕。具体测试过的环境和仍待独立复核的范围见 [测试报告](TEST_REPORT.md)。

## 和朋友开打

从“和朋友开打”创建房间，分享邀请链接或房间码。朋友打开链接时先看到公开邀请状态；需要登录时保留邀请，登录后回到原来的房间。刷新或短暂断线可恢复自己的座位。房间码用于加入，不能代替会话令牌接管已有席位。

游客的人机、教程、自定义收藏与当前回放在浏览器本地运行。注册用于好友联机和长期对局保存；账号采用用户名、密码与恢复码，不要求邮箱。本地收藏迁往账号前先预览、去重和处理 ID 映射，保留本地原件。

GitHub Pages 托管静态页面；Cloudflare Worker 和 Durable Objects 负责账号、好友房与持久化。服务端检查身份、版本、合法指令与幂等性，只发送各自可见的信息。另保留 Node 自托管路径。容量、部署步骤和真实线上验收见 [DEPLOYMENT.md](DEPLOYMENT.md)。

## 实验室：主动打开，再单独记录

挑战关、Boss 和三局两胜属于独立实验入口，默认关闭；实验规则在局内明确展示。系列赛锁定 Offer、学历与基础牌，只在局间更换三张应对牌。成就只解锁外观，不增加卡牌属性。节奏数值实验使用独立模拟器，不进入标准对局。

云端服务是否支持实验，以 `/api/capabilities` 为准。`ENABLE_BEST_OF_THREE` 未配置时为关闭；浏览器开启实验也不能绕过服务端开关。实验回放与标准战绩分开，详见 [2.2 发布与能力边界](docs/RELEASE_2_2.md)。

## 把牌桌开在自己电脑上

需要 **Node.js 24 或更新版本**。首次安装依赖需要联网，内置素材不依赖游玩时调用生成服务。

```sh
git clone https://github.com/shoal-rat/offer-battle.git
cd offer-battle
# 若要检查尚未发布的 2.2，切换到对应开发分支。
npm ci
npm run build
npm start
```

打开 `http://localhost:5173`。也可使用 `./start.sh`、macOS 的 `开始游戏.command` 或 PowerShell 的 `./start.ps1`。稳定试玩使用生产构建；`npm run dev` 会热刷新，不适合一边修改源码一边进行正式对局。端口、数据目录和服务配置见 [本地使用说明](docs/LOCAL_PLAY.md)。

## 源码里有什么

```text
src/game/            确定性规则、版本化造卡、草稿、公开投影、复盘
src/game/ai/         四档难度、合法观测、限额搜索与独立机器人版本
src/game/experiments/ 默认关闭的独立实验
src/local-backend.ts 静态游客对局、临时恢复与当前回放
src/scene/           纸片场景与角色资源
src/motion/          五通道调度、40 项动作目录、偏好与生命周期
src/pages/           制作、卡册、配队、战斗、回放与账号界面
cloudflare/          Worker 账号、好友房与 SQLite Durable Objects
server/              Node 自托管、创作适配器、任务和持久化
public/assets/       内置插画、纸艺资源、音乐、音效和技能影片
assets/              创作原件、提示与制作记录
spec/                保留的 2.0 原始规则和工程资料
reports/             2.2 专项实现、测量与待复核说明
tests/               规则、传输、浏览器与视觉回归
```

不要提交真实 `data/`、令牌、恢复码、上传原件或服务密钥。所有创作功能按实际能力启用：内置素材与本地文案可直接用，远程提取/绘图只有在对应服务可用时才展示为可用，不用固定计时条冒充生成。

## 验证和参与

```sh
npm run typecheck
npm test
npm run assets:check
npm run build
npx playwright install chromium
E2E_PRODUCTION=1 npm run test:e2e
npm run test:e2e:static
npm run test:cloudflare
```

专项证据见 [Motion 2.2](reports/MOTION_2_2.md)、[AI 2.2](reports/AI_IMPLEMENTATION.md)、[六套预设配对测试](reports/STARTER_DECKS.md)，历史发布回归见 [TEST_REPORT.md](TEST_REPORT.md)。自动化中的可控传输、真实引擎局面、浏览器实验和公网实测分别标注；动作目录不等于 40 项均已独立视觉验收，战术单测也不等于真人竞技平衡。

欢迎用一个具体局面改进游戏：一张读不清的牌、一次不顺手的目标选择、一个可以用战报复现的规则交互。参见 [参与贡献](CONTRIBUTING.md)、[更新日志](CHANGELOG.md) 和 [安全说明](SECURITY.md)。代码与文档采用 [MIT License](LICENSE)，素材来源与适用说明见 [ASSET_LICENSE.md](ASSET_LICENSE.md)，依赖见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。这是独立项目，与 Blizzard、《炉石传说》或其他机构没有官方关联，未使用其原画、录音或品牌素材。

<details>
<summary>English overview</summary>

Offer Battle is an original Chinese-language card game about comparing precise job offers. Version 2.2 is under development: an interactive paper stage, confirmed offer drafts, versioned card revisions, four bot difficulty levels, private-information-safe action previews, invitations, optional account migration and event-linked match recaps. Guests play locally; registered accounts use Cloudflare for friend matches and saved history. Node self-hosting remains supported. See the deployment record for the live version and the release checklist for unfinished verification. Planned independent agent runs and large benchmark totals are not treated as completed evidence.

</details>
