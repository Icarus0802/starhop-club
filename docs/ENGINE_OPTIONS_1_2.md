# 121 孔十子引擎资源核验（2026-10-10）

目标是可实际运行、规则一致、可公开发布的强 AI。仓库名、作者自述、GPU 时间或训练次数均不等于本项目棋力。本文没有把任何第三方模型接入运行版，也没有声称已完成模型推理。

## 核验结论

这轮找到三个含训练模型或实际发布包的重点方向，但没有找到一个同时满足 **121 孔十子、明确可分发许可、权重可下载、本机快速推理已验证** 的现成冠军级替代品。不能用错棋盘的模型替换当前 AI，也不能将无许可权重打包到 MIT 项目。

| 资源 | 实际可取得的内容 | 规则与集成阻碍 | 当前用途 |
|---|---|---|---|
| NEXUS / AnwarDebes/RL-CCA | `phase2_best_by_eval2p.pt`，30,236,839 字节 | 121 孔十子；训练目标包含位置、时间、步数等比赛分数。仓库 API `license=null`，完整 279 文件树未发现 LICENSE/COPYING。CPU 推理未测 | 架构参考；取得明确许可和加载验证后再评测 |
| KataGomo `tiaoqi` | 382,981,945 字节专用包；已实际读取 662,550,439 字节合集，其中跳棋权重 86,980,327 字节 | 当前源码是中央 9×9 菱形的 81 个落子点、十子、长跳；社区另有传统单跳包，尚未核验 | 强模型候选，须先核对具体包规则与模型许可，不能直接改名接入 121 孔模式 |
| JumpStar / CCZero | C++20 引擎、协议、标准局面与公开比赛记录 | 标准 121 孔十子短跳；代码 CC BY-NC 4.0。模型未在 Git 中，GitHub Releases 为空；模型条款仍标为草案 | 规则与外部评测参考；需取得实际模型与确定许可 |
| Tovarnykh/rl-chinesecheckers-competition | 当前已提供四个约 23 MB 策略模型及 4.5 MB 启发式数据 | 仓库 `license=null`，完整 163 文件树未发现许可证；策略主要由启发式/MCTS 教师训练，未证明冠军棋力 | 更新旧资料；不发布其权重 |
| noahadhikari/pettingzoo-chinese-checkers | MIT 多玩家环境、PPO 训练、论文实验数据 | 未发现随仓库发布的模型权重；论文的研究问题是参数共享 | 可作为训练环境和对照方法参考 |
| alexicanesse/ChineseCheckers | GPL-3.0 C++ Alpha-Beta、TensorFlow 小模型、开局生成器 | 源码采用 64 位棋盘及 8×8 位置表；不是 121 孔棋盘 | 搜索工程参考，不能当兼容现成引擎 |
| arthur-x/MarbleFish | MIT、可浏览器运行的 121 孔短跳 Alpha-Beta | 启发式进度/横向分布，按深度截断候选；没有神经网络或强棋力外部证明 | 可用外部基线；不是实质强权重升级 |

## KataGomo：确认了发布包，也确认了棋盘不兼容

真正的发布地址在旧发布仓库，而非当前源码仓库：

- [KataGomo_fork 20240406 Release](https://github.com/hzyhhzy/KataGomo_fork/releases/tag/20240406)
- [Kata_TiaoQi_20220313.zip](https://github.com/hzyhhzy/KataGomo_fork/releases/download/20240406/Kata_TiaoQi_20220313.zip)，382,981,945 字节。
- [tiaoqi 分支许可证](https://github.com/hzyhhzy/KataGomo/blob/tiaoqi/LICENSE)：主体为 MIT；第三方库保留各自许可。
- [棋盘源码](https://github.com/hzyhhzy/KataGomo/blob/tiaoqi/cpp/game/board.cpp) 与 [头文件](https://github.com/hzyhhzy/KataGomo/blob/tiaoqi/cpp/game/board.h)。

源码的 `Board::init` 拒绝非 9×9 棋盘，初始每方十子。`setLegalMap` 将一个 17×17 工作空间中的可达性结果映射回中央 9×9，周围的星角空间并不是该引擎可选落子点。头文件定义 `KONGTIAO`，跳跃射线允许对称的远距离空跳。它与本项目“整个六角星 121 孔可落子”有关键差异。

发布页说明主要是 OpenCL 构建，TensorRT 需自行编译。作者的[研究档案](https://hzyhhzy.github.io/boardgames/games.html)写的是当前模型自战接近和棋；这不是对人类冠军的验证。当前受限环境的 Windows 显卡查询被系统拒绝，因此也没有据此声称本机有可用 GPU。

本轮实际下载并只读检查了同一官方 Release 的 `Kata_MoveStoneGames_20220526.zip`，662,550,439 字节，SHA256 为 `e6246770e592783b70c75eed246431ec09a914638454b851c4ea492d3e024e65`。其中有 `engine/tiaoqi9x9.exe`、OpenCL DLL 和 `weights/tiaoqi9x9.bin.gz`。该权重压缩 86,980,327 字节，解压 93,664,655 字节，头部标识 `tiaoqi9x-b20c256-s251485184-d92267590`，20 块/256 通道。权重压缩文件 SHA256 为 `7498b378217461d296fda4d21be6ad860713bad95724550b4e5d97deb8de981a`。合集配置只有一个 TiaoQi 9×9 引擎项，并没有传统/空跳三个选择。

仅执行过二进制 `version` 子命令，确认 KataGo v1.10.0、2022-03-13 编译、OpenCL 后端；**未启动模型推理、未跑 GTP 对局、未测试 GPU 或 CPU 棋力与速度**。下载包保存在忽略的研究目录，没有加入公开发布文件。包内 JRE 许可不能替代模型独立许可。

另外，挑战者本人 2022 年发布的[传统加空跳版说明](https://tiaoqi.top/thread-379.htm)明确提供一子跳、空跳、空跳无回绕三个引擎选项，并称其测试中胜过伤心和旧 Kata。公开百度分享链接为 `https://pan.baidu.com/s/1zjVl4a3maEFPOqxwlhhPpw`，提取码 `29xr`。这是值得继续核验的真实单跳包线索，不能把当前 `tiaoqi` 默认长跳源码的结论套到所有社区包；但这份包尚未取得或核验，作者测试自述也不能替代本项目基准。

完整分页查阅官方分支后，还确认了 [tiaoqi_yizitiao](https://github.com/hzyhhzy/KataGomo/tree/tiaoqi_yizitiao)，提交 `a7251eb19246d8f43a8b830ffb131b2f1c62042b`。它的 `setLegalMapIter` 只越过紧邻棋子、在空位递归继续跳，确实是传统单跳，源码同样有 MIT 许可。编译默认 `MAX_LEN=9`，初始化十子，仍是 81 落点菱形，未包含另外四角的四十个孔。没有找到该分支对应的独立可下载单跳权重。后续可先作为中央区短跳教师候选评测，但不能把已下载的长跳权重配到它上面并假定策略一致。

若后续增加明确标注的 81 孔长跳模式，可沿如下执行路线评测：下载官方包并记录 SHA256，检查包内 README/模型/配置/第三方许可，先在本机用 GTP 完整跑一盘，再逐个转换坐标及“选子、落点”两阶段动作，建立相同规则的对照赛。该路线不能通过坐标改名变成完整 121 孔模型；迁移到新棋盘需要重新训练与验证。

## NEXUS：有真实权重，GPU 预算不能当 CPU 预算

[README](https://github.com/AnwarDebes/RL-CCA)与[模型架构](https://github.com/AnwarDebes/RL-CCA/blob/main/network/model_v4.py)描述约 7.5M 参数、32×17×17 输入、残差与 Transformer 骨干、1210 维策略及六座位价值向量。仓库树确认[阶段二权重](https://github.com/AnwarDebes/RL-CCA/blob/main/checkpoints_v4/phase2_best_by_eval2p.pt)确实存在，大小为 30,236,839 字节，blob 为 `7314f460813c78d437734db6aaab2f4515e08b67`。

作者报告的单次 GPU 前向约 8.5 ms、16–48 次模拟、0.45 秒每手上限，没有说明本机 Windows CPU 也能达到相同速度。训练价值侧重比赛的 `pin_goal_score + distance_score + time_score + move_score`；这一价值不能直接解释为本项目获胜率。

本机目前未装 PyTorch 或 ONNX Runtime，尚未加载模型。可行的后续路线是：先取得许可，再隔离环境加载可信权重（优先安全的 `weights_only` 方式），用真实 121 孔棋谱检查座位旋转、棋子编号、合法落点掩码和终局价值；计量 CPU 的中位数/P95 前向耗时。若单次推理过慢，先尝试策略直出或小型学生网络，而非在 CPU 上机械叠加 48 次搜索。只有真实同规则对照胜出后才接入正式版。

## JumpStar：最接近需要的外部基准，但模型目前取不到

[公开引擎](https://github.com/jphilleo/jumpstar-chinese-checkers-engine)提供轻依赖 C++20 核心、[CCP stdin/stdout 协议](https://github.com/jphilleo/jumpstar-chinese-checkers-engine/blob/main/docs/benchmark/CCP_PROTOCOL.md)、冻结局面和公开比赛证据。代码许可证为 [CC BY-NC 4.0](https://github.com/jphilleo/jumpstar-chinese-checkers-engine/blob/main/LICENSE)，不能作为 MIT 代码不加说明地混入发布版。

[CCERL-2P10-v2](https://github.com/jphilleo/jumpstar-chinese-checkers-engine/blob/main/docs/benchmark/CCERL-2P10-v2.md)确实使用 121 孔、十子、可走边角、短跳连跳。不过开启目标营锁定，并额外规定有效填满目标营的反堵塞胜利及等回合完成和棋；当前程序不能将这些结果混入自身规则的胜率。

[模型清单](https://github.com/jphilleo/jumpstar-chinese-checkers-engine/blob/main/benchmarks/ccerl-v1/baseline_pack/MODEL_NOTES.md)记录冠军 `iter060` 的 `.ccpv` 为 41,452,776 字节，SHA256 为 `91a35c69bfe5c8219c3f5343563d7bc54730e109e700347ca18b06fd28e23b58`。但完整 Git 树没有这些模型，GitHub Releases 集合为空；[模型条款](https://github.com/jphilleo/jumpstar-chinese-checkers-engine/blob/main/benchmarks/ccerl-v1/baseline_pack/MODEL_RELEASE_TERMS.md)还明确标为维护者草案。

官方在线网站通过 `/api/champion-move` 在服务端执行 native 引擎，浏览器并不下载神经模型。本轮只读取网页脚本及公开 `/api/champion` 元数据；其中的内部模型路径返回 404，并非可下载资产。没有冒用在线 API 作为本软件后端，没有提取网站私有部署代码，也没有取得任何模型权重。

公开[开源风格适配器对照](https://github.com/jphilleo/jumpstar-chinese-checkers-engine/blob/main/docs/benchmark/OPEN_SOURCE_BOT_SCREENING.md)有 172 局/适配器完整局面测试，但它测的是作者重写的算法风格适配器，非所有上游引擎原始二进制。这可帮助设计严格评测，不能据此宣称打败人类冠军。

## 当前工程应执行的路线

1. 短期继续升级自己的 MIT 引擎：后子运输、桥梁保留、封堵出口、残局装填，采用能在 300–500 ms 内完成的选择搜索；复用线程和计算，避免每手重新初始化。
2. 接入外部引擎时保留统一协议与本机辅助 server 路线，避免把大型 GPU 网络强塞进浏览器。每个后端均由本项目规则层检查所选动作合法性；实际计量端到端响应时间。
3. 将大师/冠军的**完整实战棋谱**与自战、合成局面分别保存来源。学习对象应包含撤桥时机、后子启动、堵塞突破和收官顺序。仅看视频中的一个截图不足以做监督标签。
4. 强化训练要保存固定留出棋谱、交换先后手、同设备同时间预算、完赛率与循环率。原来的几局对旧版胜出，只说明相对旧版的改进，不能验收顶级人类棋力。
5. 这轮最优先的神经路线是获取一个**兼容 121 孔且许可明确**的教师模型；目前 NEXUS 和 JumpStar 的发布/许可条件均未齐全。不能把这一步写成已经接入或已经训练成功。

## 对旧研究记录的修正

旧 `AI_RESEARCH.md` 说 Tovarnykh 仓库未提供权重，现已过时：[当前 checkpoints](https://github.com/Tovarnykh/rl-chinesecheckers-competition/tree/main/checkpoints)包含四个策略模型，分别为 23,026,221、23,020,646、23,032,496、23,047,530 字节。但权重存在与许可、棋力、规则兼容是四个独立检查项；现状仍不能直接随公开软件分发。

[MIT PettingZoo 项目](https://github.com/noahadhikari/pettingzoo-chinese-checkers)对应[2024 参数共享论文](https://arxiv.org/abs/2405.18733)，提供环境及实验数据；未找到已发布的可直接推理权重。[alexicanesse 源码](https://github.com/alexicanesse/ChineseCheckers/blob/main/include/ChineseCheckers.hpp)使用 64 位棋盘与 8×8 坐标表，排除直接用于当前 121 孔规则。
