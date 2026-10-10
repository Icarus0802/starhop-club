# 第三方来源

## jumpogpo/ai-chinese-checker

- 仓库：https://github.com/jumpogpo/ai-chinese-checker
- 固定提交：`94a80082fd5969a5efb72b8ac7e80d4a6d6a956e`
- 许可：MIT，版权所有 © 2022 arthur-x；全文保留在根目录 LICENSE。
- 原始 README、game-logic.ts、ai.ts 保留于 vendor/upstream。
- 本项目参考其星形棋盘生成、连跳枚举与 Alpha-Beta 框架；改写成 121 孔共享规则和 JavaScript 搜索，并增加棋谱验证、限时迭代、目标匹配、多方 MCTS、交互和诊断。

## 研究资料

论文和其他仓库只用于理解算法，未把无许可的源代码或训练权重纳入软件。引用清单与规则差异见 docs/AI_RESEARCH.md。
## Kata 一子跳原生引擎与模型（Windows 包）

- 作者：HZY / hzyhhzy；基于 David J. Wu（lightvector）及其他贡献者的 KataGo。
- 上游发布：https://github.com/hzyhhzy/KataGomo_fork/releases/tag/20240406
- 原始包：`Kata_TiaoQi_20220313.zip`。保留原始 `yizitiao.exe`、`yizitiao.bin.gz` 和所需运行库的字节，未修改权重。
- 对应源码与许可：https://github.com/hzyhhzy/KataGomo/tree/tiaoqi 。仓库主体 MIT；附带库分别遵循其许可证。许可证与贡献者名单保留于 `vendor/kata/`，不将第三方组件重新许可为本项目原创。
- 文件 SHA-256 与性能验收记录：`docs/benchmarks/kata-acceptance-20261011/protocol.json`。
- 原生程序中的 clblast、half、nlohmann_json、tclap、zstr、filesystem、SHA-2 等依赖声明保留在 `vendor/kata/`；zlib 和 OpenCL 运行库仍归各自权利人所有。
- Visual C++ 运行库属于 Microsoft，适用其分发条款；运行环境要求见 https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist 。不提供 Microsoft 产品许可或支持。
- 我们提供棋盘坐标与 GTP 适配、本地服务和浏览器回退；模型并非本项目自行训练。不包含上游 Java/Lizzie 图形界面。

## Node.js（Windows 免安装包）

Node.js 24.21.0，https://nodejs.org/ 。随包保留 `vendor/node/LICENSE` 中的 Node 及其依赖完整许可。仅打包运行程序，不要求修改用户的 PATH 或安装 npm 依赖。
