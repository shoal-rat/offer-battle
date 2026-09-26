# 秋招斗兽棋：Offer 开打
## v2.0 原始设计与可执行参考

这里保留设计阶段的规则、结构化内容、工程要求与 Python 参考实现。游戏已经实现；游玩、开发和部署请先读 [项目 README](../README.md)。这些资料用于追溯设计意图，当前运行类型和验收结果以 `src/`、自动化测试及 [测试报告](../TEST_REPORT.md) 为准。

## 新版重点

学校改成第一学历主技能加第二学历进修技能，增加海外Top 50、Top 100、100+与校友流派。十个第一学历乘十一个第二学历选择，共110种有序搭配。

进修第四轮解锁，每局一次，与主技能共用每个己方回合一次的学历行动。校友流派通过两次集合，兑换一次＋4排面／＋4底气上限。双校友流派在另一回合再加＋2／＋2，拥有本硕连读演出。

保留三十张通用牌、十一种Offer模板、七种条款、谈薪、年龄、话题和反话。补全零密钥启动、190个资源槽位、48条事件台词、10套配队、机器人、回放与好友对战要求。

## 文件导航

| 文件 | 内容 |
|---|---|
| AGI_START_HERE.md | 实施入口、完成标准和交付顺序 |
| LAUNCH_PROMPT.txt | 可直接复制到开发代理的启动指令 |
| game_design.md | 全量游戏设计书 |
| education_system.md | 双学历、海外和校友流派的完整章节 |
| rules_catalog.json | 基础规则、30张通用牌、模板、条款与10个主技能 |
| education_catalog.json | 11个进修技能、110组合规则、校友流派状态机参数 |
| example_offers.json | 原规格六份已编译示例；当前游戏另有扩展示例 |
| data/education_combinations.json | 110个有序组合逐项数据 |
| data/loadout_presets.json | 十套可直接开局的配置 |
| data/dialogue_bank.json | 48条带事件条件的本地台词 |
| data/runtime_tokens.json | 三种临时召唤物 |
| data/showcase_scenarios.json | 五个明确标注的练习演示场景 |
| art/art_bible.md | 角色、界面、动画与声音设定 |
| art/character_specs.json | 十个学校主角的形象锚点 |
| art/asset_manifest.json | 190槽位的路径、尺寸、提示词、依赖、制作方式 |
| art/asset_index.md | 可读资源索引 |
| prompts/art_generation.md | 美术生产代理提示词 |
| ai_prompts.md | 信息提取、卡名、台词和原有生成流程 |
| engineering/build_contract.md | 技术结构、脚本、页面与运行要求 |
| engineering/state_and_network.md | 状态机、消息、隐藏信息和技能事务 |
| engineering/balance_and_delivery.md | 模拟、平衡观测与交付门槛 |
| acceptance_tests.md | 88条基础验收，附追加用例入口 |
| tests/education_acceptance.md | 70条双学历与校友流派验收 |
| tests/delivery_acceptance.md | 20条美术和整体交付验收 |
| tests/education_cases.json | 70条学历验收的机器可读版本 |
| reference/education_reference.py | 独立、确定性的学历即时效果参考模型 |
| tests/test_education_reference.py | 41项已执行的参考模型测试 |
| validate_bundle.py | 数值编译、目录一致性与参考测试检查 |
| reports/ | 实际执行的资料校验和参考测试结果 |
| CHANGELOG.md | v2.0变更 |
| .env.example | 外部创作接口与本地模式配置示例 |

## 本地检查资料包

```bash
python3 spec/validate_bundle.py
```

仅运行参考模型测试：

```bash
python3 -m unittest discover -s spec/tests -p 'test_*.py' -v
```

以上命令在仓库根目录执行，使用 Python 3.10 及以上版本的标准库。参考模型覆盖学历发动和即时效果。完整交锋、网络与图形界面的验收由开发工程执行。

## 对最终游戏的启动要求

开发代理交付的游戏具有npm run dev、npm test、npm run build、npm run assets:check以及start.sh和start.ps1。默认本地资源模式无需模型密钥。可选创作服务的参数分别配置。

素材总表是制作需求，190个槽位不等于190张待绘原画。头像通过裁切产生，UI通过矢量制作，特效通过事件动画制作，声音通过生成或原创合成制作。36张人物母版覆盖学校、Offer、示例、助阵和临时角色。
