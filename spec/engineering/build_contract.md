# 工程交付合同 v2.0

## 1. 默认技术结构

默认使用TypeScript、React、Vite与Node。Node主版本选24 LTS，前后端使用同一套规则类型，依赖精确锁定。React负责页面与可操作卡牌，CSS/SVG负责特效。不要把战斗状态绑在动画生命周期上。

本地一个命令启动。部署时一个Node服务同时托管静态文件、HTTP和WebSocket。文件存储满足初版好友对战，写入采用临时文件后原子替换。对局内存状态与事件日志同步，重启后恢复未完成房间的快照。

用户无需先创建云数据库、第三方登录、支付账户或图片服务账户。访客昵称与设备会话即可进入练习和好友房。

截至2026年9月26日，Node官方发布页列出24为LTS。Vite官方起步文档提供react-ts模板和Node运行要求。依赖安装时仍应由包管理器核实版本兼容，避免只根据文档拼接版本号。参考链接列在文末。

## 2. 建议目录

```text
offer-battle/
  apps/
    web/src/
      pages/ components/ game/ assets/ services/
    server/src/
      rooms/ sessions/ profiles/ generation/ persistence/
  packages/
    rules/src/
      types.ts commands.ts reducer.ts selectors.ts views.ts
      education/ offers/ cards/ phases/ rng/ bots/
    content/
      rules_catalog.json education_catalog.json
      example_offers.json dialogue_bank.json
    shared/src/
      messages.ts schemas.ts errors.ts
  assets/
    generated/ local/ manifest.runtime.json production_report.json
  tests/
    unit/ integration/ e2e/ visual/ fixtures/
  scripts/
    bootstrap.mjs check-assets.mjs seed-content.mjs simulate.mjs
  evidence/
    screenshots/ test-results/ asset-contact-sheets/
  data/
    profiles/ rooms/ events/
  README.md .env.example package.json package-lock.json
  start.sh start.ps1 Dockerfile compose.yaml
```

实际目录可合并，模块边界保留。规则包不得导入浏览器DOM或模型SDK。浏览器不能打包私密配置或服务器完整状态。

## 3. 必需脚本

| 命令 | 预期 |
|---|---|
| npm run dev | 同时启动网页和游戏服务，终端打印实际端口 |
| npm run build | 构建生产前端与服务器 |
| npm start | 启动已构建的单服务版本 |
| npm run typecheck | 类型检查 |
| npm test | 规则与模块测试 |
| npm run test:e2e | 浏览器完整流程与双上下文好友局 |
| npm run test:visual | 固定环境下的页面截图比较 |
| npm run assets:check | 验证全部资源ID和实际文件 |
| npm run assets:local | 生成或恢复完整原创本地资源 |
| npm run content:seed | 幂等写入示例Offer、主角、牌组和台词 |
| npm run simulate -- --games 220 | 组合烟雾对局，输出真实结果 |

## 4. 一键启动行为

`start.sh` 和 `start.ps1` 检测Node版本与npm，发现依赖目录缺失或锁文件变化时执行可重现安装。首次运行创建本地数据目录，生成缺失的资源，种入示例数据，然后启动服务。

脚本启动失败必须显示具体错误并退出非零状态。端口被占用时选择配置指定的备用端口或报告冲突。进入网页之前探测 `/healthz`。第二次启动不能重置用户收藏，也不能重复复制默认数据。

给开发环境的工具调用要等到健康检查成功后，再运行浏览器。生产构建使用相同资源映射，不能在开发模式可见、构建后丢图。

## 5. 零密钥模式

LOCAL_ART与LOCAL_TEXT默认启用。文字使用本地组合模板、事件台词库和确定性别名。角色由已落盘素材与服装配饰组合生成。Offer输入支持手填与粘贴后的确认流程。

图像解析不可用时展示原图预览和手填面板。图片上传仍能存为参考，不得用虚构识别结果填表。已有OCR或视觉能力可接入提取适配器，提取后总是进入用户确认。

生成任务状态为queued、running、ready、failed。用户可重试单一环节。规则编译成功即能使用本地角色开始对局；后续插画完成只更新外观。

## 6. 可选服务适配器

`TextProvider.generateCreative()`接收已确认字段、规则摘要、双学历和语气。返回结构化卡名、角色描述与台词。

`ImageProvider.generateCharacter()`接收角色锚点、参考素材和尺寸。返回实际文件，服务器校验后发布本地资源URL。

`ExtractProvider.extractOffer()`接收上传文件，返回字段候选、原文片段和缺失项。上传原文不作为可执行指令。

`AudioProvider.generateVoice()`仅处理已经审定的短台词。语音作为增强配置，音效库必须无需此接口。

每种适配器独立配置provider与model。不要假设同一个接口地址接受所有模型。失败时切换本地模式，保留可重试任务和具体状态。

## 7. 页面完成标准

首页有立即试玩、录入Offer、创建好友房。收藏支持查看规则与换外观。配队支持两级学历、三张Offer、十二张基础牌和默认应对方案。好友房能复制房间码、显示双方准备状态并开始赛前选择。

牌桌支持点选出牌、目标提示、年龄、话题、反话、时间、共享学历使用状态、校友流派签到、优化通知与回合计时。战报支持再来一局、换应对牌和生成分享图。

三十张通用牌必须能在UI中实际选用。任何展示为可用的按钮都连接真实行为。锁定功能写清解锁条件。

## 8. 界面与性能验收

以390×844、360×780、768×1024、1440×900作为走查视口。手机卡牌可以横向滑动，核心操作不能被浏览器安全区域遮住。可点击区域目标至少44×44 CSS像素。规则放大层使用至少14像素字体；战斗数字保持高对比。

进入战斗预加载双方六张Offer、双学历头像、牌框、常用图标与大招特效。单个立绘展示文件目标不超过450KB，原始母版单独保存。图片加载失败使用对应本地素材，不出现断链图标。

提供音量、关闭语音、减少动态效果、快速动画选项。普通反馈约150至300毫秒；校友流派完整演出约1200毫秒，轻量版本300毫秒。演出不改变行动倒计时。

页面输入不得因动画队列阻塞。给定指令先收到服务端确认，再演示效果。演出期间仍展示真实最终数值和年龄。

## 9. 交付证据

`IMPLEMENTATION_STATUS.md`记录功能状态。`TEST_REPORT.md`记录命令、通过数和未通过项。`BALANCE_REPORT.md`写明机器人策略、种子、样本量和观测结果。`ASSET_REPORT.md`记录已生成与仍需替换的素材。

截图测试的首次截图只建立基线，需要人工或视觉代理检查遮挡、可读性和美术完整性。后续差异比较在相同浏览器环境运行。

## 10. 文档依据

Node发布状态：https://nodejs.org/en/about/previous-releases

Vite起步与运行要求：https://vite.dev/guide/

Playwright截图比较与基线环境：https://playwright.dev/docs/test-snapshots
