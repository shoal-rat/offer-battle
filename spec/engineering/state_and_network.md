# 状态、消息与隐藏信息 v2.0

## 1. 状态模型

`MatchState`包含rulesVersion、catalogHash、matchId、round、activePlayerId、phase、deadline、players、rngState、pendingChoice、eventSequence和result。

每个Player持有mind、timeRemaining、hand、deck、discard、offerZone、board、retort、fatigue、negotiationUsed、education和sessionBinding。

`education`保存主辅流派、共享行动机会、进修次数、返场折扣和分阶段技能进度。所有战斗标记都按局保存，不能从收藏修改。

`returnTicket`保存offerId、discount与expiresAfterOwnerTurnIndex。`referralDiscount`为0、1或2。分阶段技能进度为0、1或2，终极强化使用标记只允许从false变为true。

`OfferInstance`保存持久offerId、definitionId、ageStage和everDeployed。`DeploymentInstance`保存单次deploymentId、owner、baseDefinition、damage、modifiers、canAttack、attackedThisTurn和localFlags。回手创建区转换，保留OfferInstance，销毁DeploymentInstance。

## 2. 双学历状态转换

一个己方回合开始时，重置usedThisOwnTurn。SECONDARY技能还要求round≥4且secondaryUsed=false。无论两个槽位是否同校，每次成功发动都设置usedThisOwnTurn=true。

第一学历校友流派状态依次为COLLECT_0、COLLECT_1、READY、SPENT。前两次集合各扣2小时，恢复1心态，增加1章。READY阶段只能对己方场上Offer释放大招；无目标时保持READY。成功释放扣2小时、清空章数、设ultimateUsed=true、添加当前上桌修饰＋4／＋4。SPENT阶段技能为2小时恢复2心态。

第二学历校友流派独立检查secondaryUsed，添加当前上桌修饰＋2／＋2。它不能操作第一学历的进度计数，也不能创建第一学历大招机会。

## 3. 命令协议

每个命令至少含matchId、commandId、expectedStateVersion、actorSessionToken、type和payload。身份由会话确定，不能相信客户端传来的playerId。

指令枚举：SELECT_LOADOUT、SELECT_FLEX、MULLIGAN、PLAY_CARD、DEPLOY_OFFER、NEGOTIATE、ATTACK、USE_PRIMARY、USE_SECONDARY、RESOLVE_CHOICE、END_TURN、CONCEDE、RECONNECT。

payload只提交卡片实例ID、目标ID和合法选择。排面、底气、年龄、折扣、抽牌结果都由服务端计算。数组目标最多按技能规定数量，重复ID视为非法。

`applyCommand`返回不可变nextState、publicEvents、privateEvents与rejection。非法命令返回原状态，任何资源和一次性机会都不变化。已成功处理过的commandId返回同一应答，不重复结算。

## 4. 隐藏选择事务

清北技能和其他窥视必须先支付时间并占用学历行动，随后服务器创建pendingChoice，只向使用者发送对应快照。此时拒绝其他战斗命令，RESOLVE_CHOICE与CONCEDE除外。

快照选择对象通过临时choiceId引用，不把隐藏对象ID广播给另一方。玩家无法通过关闭面板撤销支付。超时选稳定排序中的第一项，完成效果后解锁行动。

对手已被窥视的当前牌仍保留knownTo状态；之后新抽牌不自动公开。己方客户端不得通过调试对象看到未获知内容。

## 5. 对玩家的视图

对外视图公开心态、剩余时间、学校组合、学校技能状态、校友流派章数、已公开的Offer与场面、牌库数量、手牌数量、反话存在状态。

每个玩家只收到自己的手牌与允许查看的信息。对手牌库仅提供数量。反话仅发covered=true；真实retortId和具体牌面不得出现在隐藏DOM属性、图片资源预加载、音效名、网络消息或日志中。

服务器event日志可以保存完整事件，客户端回放使用过滤后的事件流。原始数据目录、会话文件与环境配置不纳入静态资源托管。全部反话素材统一预加载或使用共享背面，不能根据一张尚未揭示的反话按需加载专属图。客户端动画只按已授权的事件播放。

## 6. 技能分类

学历技能属于hero_skill来源。它们不触发F04合同，也不触发B07保障。技能明确指向角色时不受挡话限制。

S09造成的底气伤害与通用牌相同地触发角色退场及Offer心态损失。S03先加属性，再处理自己的心态损失，损失致命就结束对局。S00先恢复，再抽牌。S04逐张抽牌，在每次焦虑后检查结果。

## 7. 回手与折扣

H07和S07发动前检查己方场上Offer、手牌未满。扣费后按统一回手规则处理，清本次伤害与强化，保留年龄和使用记录。

H07创建一张1小时返场便条。它绑定Offer身份；同一玩家有便条时，新的H07被拒绝。S07只回手加抽牌，不额外生成便条。

上桌时间公式：max(1,原始耗时＋最大有效学校加时＋其他加时－谈薪－内推－返场)。同一类别内推只取当前一张；学校标记加时取最大；不同类别折扣相加。

返场仅适用绑定Offer从手牌上桌。谈薪仅适用从未上桌且位于Offer区的两张卡，所以同一个合法目标不能同时享受谈薪与返场。内推可以分别与两者组合。符合条件的便条在合法上桌命令接受时消耗，即使最低1小时使折扣部分溢出。

## 8. 计时与断线

服务端截止时间是计时真相。客户端仅显示剩余时间。动画不延长截止时间。待选择操作也共用回合剩余时间，到期执行默认选择后结束回合。

连续两个自己的回合没有有效动作并超时判负，合法END_TURN算主动行动。一方断线不泄漏会话，重连后从版本号获取当前视图及已授权事件。

两个浏览器可以通过房间码加入，不允许同一座位被无会话令牌的第三方接管。开发调试工具默认关闭，只在本地明确debug配置下暴露。

## 9. 确定性

洗牌使用固定算法与记录种子。原始种子在对局期间仅服务端保存，普通重连和公开回放不发送能够重建秘密牌序的种子。真实时间只由TIMEOUT事件进入规则，引擎内部不读取系统时钟。生成图片、音效完成与网络延迟都不参与伤害判定。

全量状态哈希按稳定序列化计算。回放输入相同初始快照和已接受指令，必须输出相同最终哈希。UI表演时长可变，事件顺序保持一致。

## 10. 机器人

机器人获取与该座位真人等价的视图。合法动作枚举按自己手牌和公开场面执行。评估函数可以使用已公开的Offer、对手公开资源及真实获知的手牌快照。

基础优先级：能结束比赛则结束；有到期优化且能保住核心则考虑转管理或回手；高收益交换优先；部署角色；保留必要解牌；使用可产生收益的学历技能；结束回合。

校友流派策略会比较集合与当前场面的收益。READY时先评估被回手风险与当前可用保护，再选择目标。机器人的决策记录不输出未获知信息。
