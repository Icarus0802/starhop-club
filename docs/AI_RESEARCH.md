# AI 研究与后续强化

正式版 1.1 是规则搜索引擎。增加搜索预算并不等于达到冠军棋力；必须保留可复现的棋谱和外部对局证据。

## 已核对资料

1. [Towards Understanding Chinese Checkers with Heuristics, Monte Carlo Tree Search, and Deep Reinforcement Learning](https://arxiv.org/html/1903.01747)，Liu 等，2019。讨论贪心、MCTS、策略与价值网络、历史与循环问题。论文采用 49 孔、每方 6 子的缩小版，不能把其人类对局结果直接用于本项目 121 孔十子规则。
2. [UCT Enhancements and an Endgame Database](https://www.cs.du.edu/~sturtevant/papers/UCT-endgame.pdf)。残局数据库和改进 UCT 是有价值的方向，需先统一棋盘大小、棋子数与规则。
3. [On Strongly Solving Chinese Checkers](https://webdocs.cs.ualberta.ca/~nathanst/papers/sturtevant2019chinesecheckers.pdf)。强解研究与完整实战引擎并非同一任务。
4. [AnwarDebes/RL-CCA](https://github.com/AnwarDebes/RL-CCA)：NEXUS 使用策略价值网络与 Gumbel MCTS，README 描述包含 121 孔模型。检查时根目录 LICENSE 不存在，未取得可分发许可，且比赛计分与本项目胜负规则不同；未集成代码或权重。
5. [Tovarnykh/rl-chinesecheckers-competition](https://github.com/Tovarnykh/rl-chinesecheckers-competition)：强化学习与 MCTS 方案，README 所需权重未随仓库提供；未作为现成强引擎导入。

## 1.0 中的实现与限制

- 全宽 Alpha-Beta，按完成迭代交付结果，历史走法与杀手走法提高排序效率。
- 最小目标匹配惩罚整体滞后；距离平方项使落后的棋子更显著。
- 位置分析独立列出借力不足的后子、孤子及可达跳跃落点。风险标记不冒充剩余步数下界。
- 1.1 将几何匹配缓存与占用敏感的借力/出口项分开，敌方棋子也作为桥梁评估；采用预计算射线、走法复用和 PVS。该局部评估仍不能完整预测动态长链与对手未来配合。
- 多样开局相邻跳同预算对照为 5 胜、2 负、1 和；长跳 1 胜、1 负、2 和。长跳循环与残局拥堵仍是薄弱点。
- 实验性跳跃连通网络评估在等时对照中得到一和一负，且降低搜索深度，未启用。代码保留于 benchmarks/experimental-transport.cjs，供后续改进。
- 没有经过训练的神经网络、胜率校准、真实人类等级分或冠军验证。

## 下一阶段的验收标准

先增加冠军或高水平棋手的实际棋谱，再实现后子运输与桥梁保留评估。每次升级需统一规则、预算、设备并交换先后手，对旧版进行多局对照，记录胜率、循环率、完赛率与棋谱。策略价值模型需要清楚的许可、兼容的规则、可加载的权重和本机推理实测；不以仓库名称代替棋力证据。

## 2026-10-11：固定十局验收与原生模型实验

本轮规则搜索改动对冻结的 `v15-corridor-fast.cjs` 正式十局仅 4 胜 6 负，没有满足用户要求的十局全胜、平均至少领先两步。协议、完整棋谱及拒绝原因在 `docs/benchmarks/acceptance-20261011/`；调整评估参数、单方规划和小型线性回归的筛选结果不作为验收成绩，后续训练脚本排除 `acceptance` 与 `holdout` 目录。

本地已接入 [KataGomo 的 tiaoqi 分支](https://github.com/hzyhhzy/KataGomo/tree/tiaoqi)对应的[作者发布的一子跳包](https://github.com/hzyhhzy/KataGomo_fork/releases/tag/20240406)。程序为 KataGo v1.10.0 OpenCL 后端，权重来自 `Kata_TiaoQi_20220313.zip` 的 `weights/yizitiao.bin.gz`。源码主体 LICENSE 为 MIT，附带第三方库另有许可证；下载的程序、DLL 和权重保持在忽略的 `arena-results/external-kata/`，未把第三方二进制和权重打包进网站。

规则与适配限制：

- 原生引擎仅表示中央和上下营的 81 个落点。四个侧营可以作为连跳途经区域，但侧营有棋子时不能表示完整局面，适配器明确回退到现有全盘引擎。
- 只试验双人、相邻单子跳、无营地锁定。所有返回走法仍通过本项目的 121 孔共享规则引擎校验，真实胜负由共享规则裁定。
- `komi=0` 对应先填满者胜；原生引擎内部还存在 30 回合出营及 100 回合结束规则，不能宣称其训练规则完全等同于本项目。逐次加载当前局面会重置内部历史，亦有策略信息损失。
- 以 SGF 显式设置所有占据和空点，避免其 `set_position` 自动保留初始棋子的问题。将当前方旋转、换色为原生黑方，保持目标方向一致。
- 原生“选子”和“落点”各需一次搜索，两次共用整手预算；禁止后台思考，记录实际墙钟耗时、超时回退和不兼容局面回退。首次 GPU 调优与模型加载单独进行。
- `benchmarks/kata-native.cjs` 与 `scripts/arena-native.cjs` 在全新的五组开局换先对照中得到十局全胜、平均精确收官领先 3.3 步，完整证据见 `docs/benchmarks/kata-acceptance-20261011/`。本机服务核对通过记录与文件散列后，已允许页面最高档使用同一适配器；静态网页仍使用 JS 引擎。
