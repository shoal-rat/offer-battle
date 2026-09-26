# 本地游戏服务

`npm run dev` 在一个 Node 服务中提供 Vite、HTTP 与 WebSocket。`npm run build` 后，`npm start` 从 `dist/` 提供相同接口。默认端口 5173；`.env` 和 shell 环境变量可覆盖端口及数据目录。

除健康检查、会话创建、能力声明和已发布插画外，接口均要求 `Authorization: Bearer <token>`。会话由 `POST /api/session` 创建，设备令牌可用于恢复原档案；持有房间码不能接管原玩家的座位。

| 接口 | 请求 / 行为 |
|---|---|
| `GET /healthz` | 返回服务模式与规则版本 |
| `POST /api/session` | `{nickname,token?}` → `{token,profile}` |
| `GET /api/profile` | 返回昵称、个人 Offer、已保存配队、独立创作内容 |
| `PATCH /api/profile` | `{nickname?,loadout?}`；验证配队后保存 |
| `POST /api/offers` | `{profile,benefitId?}` → `{offer,job,creative}`；完整薪酬字段必须确认，不将缺失值补零 |
| `DELETE /api/offers/:id` | 移除个人收藏；已开始的对局保持冻结定义 |
| `POST /api/offers/:id/appearance` | `{stage:'local'|'text'|'image'}`；返回可查询任务，不改战斗值 |
| `GET /api/generation/jobs` | 当前档案的创作任务 |
| `GET /api/generation/jobs/:id` | 单任务状态 `queued/running/ready/failed` |
| `POST /api/generation/jobs/:id/retry` | 重试失败任务 |
| `POST /api/uploads` | `{mime,base64}`；保存不超过 5 MB 的 PNG/JPEG/WebP 参考图，不虚构 OCR 结果 |
| `GET /api/uploads/:id` | 仅原档案有权读取参考图 |
| `POST /api/rooms` | `{mode:'bot'|'friend',loadout?,strategy?,training?,skipSetup?}` |
| `POST /api/rooms/join` | `{code}`；原会话恢复原席位，新会话只能加入空位 |
| `GET /api/rooms/:id` | 当前玩家有权查看的房间和对局状态 |
| `POST /api/rooms/:id/ready` | `{ready:true,loadout?}`；好友双方准备后进入应对牌选择、换牌、战斗 |
| `POST /api/rooms/:id/command` | 服务端裁定命令，见下文 |
| `POST /api/rooms/:id/rematch` | 保留旧对局回放；好友重新准备，机器人直接重新开局 |
| `GET /api/rooms/:id/replay?matchId=...` | 从冻结初始状态和已接受指令重建逐帧回放，过滤隐藏信息，返回哈希一致性校验 |

房间响应为 `{roomId,code,playerId,room,view,events}`。`room.players` 仅含公共身份、准备和连接状态。`view` 使用规则层 `MatchView`，附带 `deadline` 与兼容别名 `stateVersion`。`view.legalActions` 由服务端计算。未开始的好友房 `view=null`。

命令示例：

```json
{
  "matchId": "match_...",
  "commandId": "客户端生成的唯一字符串",
  "expectedStateVersion": 12,
  "type": "DEPLOY_OFFER",
  "payload": {"offerId": "E02"}
}
```

身份只由会话决定，不信任请求里的 `playerId`。`commandId` 按座位隔离，重复命令返回原接受回执及 `acceptedVersion`，不再次付费或结算。相同 ID 改写内容会被拒绝。客户端应按 `matchId + version` 防止旧回执覆盖较新的 WebSocket 状态。版本冲突返回最新视图及 `errorCode:'STALE_VERSION'`；非法命令不修改资源。`TIMEOUT` 只能由服务端发出。

WebSocket 入口：`/ws?token=...&roomId=...`。接收 `{type:'state',...房间响应}`；发送 `{type:'command',command:{...}}` 获得 `ack`。可发送 `ping` 或 `reconnect`。断线不改变身份和截止时间。外站 Origin 被拒绝。

三个机器人策略为 `aggressive/control/growth`。机器人只从同等玩家视图决策，经相同裁定函数执行。普通好友局每回合默认 30 秒；只有显式单人 `training:true` 关闭战斗计时。赛前选择超时采用保存方案，连续两个己方回合无有效动作并超时会判负。

显式教学局可额外提交 `practiceScenario:'SC01'..'SC05'`，必须同时为 `mode:'bot',training:true`。这些是标注清楚的教学起始局面，后续全部使用正常命令。房间返回 `scenario` 标题及步骤；不提供调试改数值入口，也不允许用于好友局。

可操作入门课程使用 `POST /api/rooms {mode:'bot',training:true,lessonId:'L01'..'L05'}`，不能与 `practiceScenario` 同时使用。`room.tutorial` 返回课程名、`stepIndex/stepCount`、`objective/coachLine/hint`、`allowedCommands`、`focus`、`completed`、`nextLessonId` 和三条 `summary`。对战视图中的合法动作同步限制为当前步骤的可执行动作；偏离目标的命令返回 `TUTORIAL_STEP`，不改变局面。18 次玩家操作与 7 次固定导师操作均由标准规则引擎结算并写入回放日志，教学开始后不直接修改规则状态。普通机器人自动行动和倒计时在课程中关闭，刷新或服务重启保留课程步骤。课程完成后的 `rematch` 会归档旧回放并从本课起点重玩；整个五课完成列表由客户端保存在当前浏览器。

默认创作使用本地岗位插画、固定数值编译和模板台词。`profile.card_display_name` 控制岗位卡名；`profile.selected_template_id` 可选择固定规则类型 `T00..T10`，自动匹配时应省略该字段。未知类型返回 400，不写入收藏。任意新岗位都可使用通用类型或手动选择已有类型，不能自行设置排面或底气。

可选服务独立配置在 `.env.example`。文案适配器接受结构化 JSON，返回 `name/description/quote`；图像适配器返回 `mime/base64`，通过文件头校验后发布本地 URL。外部服务失败时任务显示失败并允许重试，已经编译的卡和本地插画仍可对战。

存档默认 `data/server.json`，使用临时文件加原子替换，同一次快照包含房间状态、命令日志及幂等回执。上一次有效快照为 `.bak`；损坏恢复失败会明确报错，不静默覆盖收藏。该目录、服务端源码和环境文件不由静态服务器发布。
