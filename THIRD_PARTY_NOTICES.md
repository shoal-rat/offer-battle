# 第三方组件说明

项目自身的代码许可见 [LICENSE](LICENSE)，生成媒体与项目素材的来源见 [ASSET_LICENSE.md](ASSET_LICENSE.md)。第三方依赖保留各自许可；安装或分发它们时，应同时保留其要求的声明。

以下为 `package-lock.json` 对应的直接依赖，许可信息读取自安装包元数据：

| 组件 | 版本 | 用途 | 声明的许可 |
| --- | --- | --- | --- |
| React | 19.3.0 | 界面 | MIT |
| React DOM | 19.3.0 | 浏览器渲染 | MIT |
| Vite | 8.3.1 | 开发与构建 | MIT |
| ws | 8.21.3 | WebSocket 服务 | MIT |
| @chinese-fonts/xiaolai（2.3 起） | 3.0.0 | 铅笔手写界面字体「小赖字体 Xiaolai SC」的按字符区段切片 webfont | 切片包 MIT；字体本身 SIL Open Font License 1.1（© 2020 LXGW，源自 Fontworks 的 Klee One，设计者瀬戸のぞみ） |
| tsx | 4.23.15 | TypeScript 执行 | MIT |
| TypeScript | 7.0.2 | 类型检查 | Apache-2.0 |
| Playwright Test | 1.63.0 | 浏览器自动化 | Apache-2.0 |
| @types/node | 26.0.0 | 类型声明 | MIT |
| @types/react | 19.2.14 | 类型声明 | MIT |
| @types/react-dom | 19.2.3 | 类型声明 | MIT |
| @types/ws | 8.18.1 | 类型声明 | MIT |

这张表用于导航，不是所有间接依赖许可文本的替代。完整依赖树以锁文件为准，各组件原始版权、NOTICE 和 LICENSE 位于安装包中。`node_modules/` 不随源码仓库提交；运行 `npm ci` 按锁文件安装。

浏览器自动化使用的浏览器由 `npx playwright install chromium` 单独下载，并非本仓库的自有资源。音乐后期和资源制作脚本还可能使用 Python 工具或系统媒体处理程序；这些工具不属于网页正常游玩的必要运行依赖，也保留各自许可。

字体说明：小赖字体按 SIL OFL 1.1 随网页分发，可嵌入、修改和再分发，但不得单独出售字体文件，修改后的版本不能使用保留字体名。构建时 Vite 会把切片后的 `.woff2` 文件复制进产物；浏览器只下载页面实际出现的字符所在的切片。
