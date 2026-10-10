# AI 研究与后续强化

测试版 1.0 是规则搜索引擎。增加搜索预算并不等于达到冠军棋力；必须保留可复现的棋谱和外部对局证据。

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
- 搜索评分仍主要按己方位置缓存，尚不能完整表达对手棋子作为桥梁的价值。
- 实验性跳跃连通网络评估在等时对照中得到一和一负，且降低搜索深度，未启用。代码保留于 benchmarks/experimental-transport.cjs，供后续改进。
- 没有经过训练的神经网络、胜率校准、真实人类等级分或冠军验证。

## 下一阶段的验收标准

先增加冠军或高水平棋手的实际棋谱，再实现后子运输与桥梁保留评估。每次升级需统一规则、预算、设备并交换先后手，对旧版进行多局对照，记录胜率、循环率、完赛率与棋谱。策略价值模型需要清楚的许可、兼容的规则、可加载的权重和本机推理实测；不以仓库名称代替棋力证据。
