# 素材许可与来源

代码、文档、项目自行编写的 SVG、动效定义和音频制作脚本使用 [MIT License](LICENSE)。项目维护者拥有可授权权利的素材贡献，也按 MIT 提供，允许随项目使用、修改与再分发；这不是对生成内容独占性、可版权性或不存在第三方权利的保证。

AI 辅助媒体随工程保留，是为了让项目可以完整运行、复核和修改。生成平台、模型、第三方标识或其他权利人的适用条款，不会因为本仓库的 MIT 声明而被重新授权。发布时尚未完成对所有生成服务条款与所有输出的独立法律审计；特别是把素材抽取为独立素材包、转售或用于另一款商业产品时，应自行核对相应服务和使用场景的条件。

## 来源清单

| 资源 | 制作方式与范围 | 可复核记录 |
| --- | --- | --- |
| 职场人物、行动牌、背景原图 | 内置 imagegen；56 次独立图像生成，角色和背景按项目主题创作 | `assets/generation-prompts.json`、`assets/production_report.json`、`public/assets/originals/` |
| 2.2 人物、六位动物助阵、道具、动作与表情 | 内置 imagegen 原创生成或同身份编辑，裁切导出；SVG 配饰与互补遮罩为项目代码 | `public/art2.2-manifest.json`、`assets/paper-source/`、`scripts/paper-assets-input.json`、`scripts/paper-assets-expressions-input.json` |
| WebP 角色、头像与衍生图 | 上述原图的格式转换、裁切或复用，保留父子来源关系 | `assets/production_report.json`、`public/assets/manifest.json` |
| UI、配饰、卡框与文字 | 项目代码、SVG、DOM/Canvas 绘制；文字与数值不烧录进卡牌图 | `public/assets/`、`src/`、`scripts/` |
| 金色校友徽章技能影片 | Running Hub 中的 MiniMax H3 Max Turbo 生成；本地压缩并移除原音轨。2.3 起牌桌改用纸艺奖章花结，影片文件保留在仓库但不再在对局中播放 | `assets/animation-originals/`、`public/assets/animations/manifest.json` |
| 六首正式情境配乐 | 根据项目的主题、段落、配器要求，通过 RunningHub / ACE-Step XL Turbo 生成纯器乐，再在本地母带处理与制作循环 | `assets/music-production-v2/`、`public/assets/audio/music/score-manifest.json`、`scripts/master_music.py` |
| 16 种短音效 | 项目脚本合成纸张、木击、气流、冲击和泛音层 | `scripts/compose_sfx.py`、`public/assets/audio/` |
| 初版合成音乐草稿 | 代码生成 MIDI、WAV 与逐音符 JSON；并非正式生成配乐的转录谱 | `assets/music-masters/`、`scripts/compose_music.py` |
| 2.3 纸艺材质与铅笔涂鸦 | 项目脚本程序化生成的纸张纤维、牛皮纸板、撕边轮廓、胶带、铅笔爱心/星芒/时钟涂鸦（SVG 滤镜与多边形，不含外部图片） | `scripts/generate-paper-tokens.mjs`、`src/styles/paper-tokens.css` |
| 2.3 手写界面字体 | 第三方开源字体「小赖字体 Xiaolai SC」，SIL OFL 1.1，通过 npm 包 `@chinese-fonts/xiaolai` 引入，不属于本项目 MIT 授权范围 | `THIRD_PARTY_NOTICES.md`、`node_modules/@chinese-fonts/xiaolai/` |
| 游戏截图 | 项目实际界面的截图，包含上述资源 | `docs/images/` |

更详细的尺寸、资源数量与制作方法见 [ASSET_REPORT.md](ASSET_REPORT.md)。资源 ID 与哈希用于来源追踪和缺失检查，不能单独证明授权或原创性。

## 再使用时请保留什么

- 保留项目的 MIT 许可和相关版权声明。
- 保留对应来源说明，明确哪些内容由生成工具辅助制作，不将生成配乐描述为真人演奏录音。
- 修改、替换或新增素材时更新 manifest、校验信息和来源记录；标明改动后的作者或制作方式。
- 对第三方依赖和另行引入的资源，遵循其自身许可，不能用本项目的 MIT 声明替代。

## 名称、题材与无关联声明

《炉石传说》是玩法灵感来源之一。本项目与 Blizzard Entertainment、《炉石传说》、出现的学校、雇主或其他机构没有赞助、授权合作或官方关联。项目未导入《炉石传说》的原画、录制音乐或配音。

学校与职业名称用于游戏主题和卡牌识别，不构成对现实教育、就业质量或个人价值的排名。公共 Offer 为虚构体验资料。相关名称与商标权利归其各自权利人，MIT 不授予对其商标的独立使用许可。

若发现素材的来源、署名或权利记录有误，请提交不包含私密信息的 Issue；涉及敏感凭证或安全问题时按 [SECURITY.md](SECURITY.md) 处理。
