# 全部开发进度与换电脑入口

**最新开发分支：`research/step-gap-and-learned-value`。main／正式站仍为1.3，PR #1尚未合并。继续开发请下载本分支。**

| 想做什么 | 直接入口 |
| --- | --- |
| 下载全部最新代码与资料 | [本分支](https://github.com/Icarus0802/starhop-club/tree/research/step-gap-and-learned-value)，点Code → Download ZIP；或git clone后切换分支 |
| 单独下载可运行1.4源码 | [source.zip](source.zip)，249文件，与当前已测试源码完全一致 |
| 换设备启动、测试、继续改AI | [开发交接](docs/DEVELOPMENT_HANDOFF.md) |
| 查看所有补充历史研究进度 | [development-progress-2026-10-10.zip](development-progress-2026-10-10.zip)，321份原始研究文件与逐文件SHA-256清单 |
| 核对补充包内容 | [补充档案清单](development-progress-2026-10-10.manifest.json)与[包校验值](development-progress-2026-10-10.sha256) |
| 查看PR与当前改动 | [PR #1](https://github.com/Icarus0802/starhop-club/pull/1) |

## 新电脑最短启动流程

```sh
git clone https://github.com/Icarus0802/starhop-club.git
cd starhop-club
git switch research/step-gap-and-learned-value
node server.cjs
```

浏览器打开 `http://127.0.0.1:5173/#play`。Node.js18以上即可，无需npm依赖安装。想恢复研究工作文件，下载并将补充档案解压到项目根目录，恢复原 `arena-results/` 和 `release-package/` 路径。棋谱存档仍在原浏览器本地，先导出JSON再在新电脑导入。

## 已完成与证据

- 1.4源码已公开展开，青玉/暖金材质、完整连跳逐段动画、上一手重播、双方自身步数、后子与堵塞诊断、规则验证一步完成、实验模型分析均在仓库。
- 最后本地完整检查140/140通过，串行及默认并行都通过；源码上传提交的云端测试与Worker复现检查通过，机器人已展开源码。95手真实对局浏览器合法重放，青玉48步完成、暖金47步8/10到达。
- [完整研究审查](docs/benchmarks/PR_REVIEW.md)、[11批64盘正式研究原始棋谱与结果](docs/benchmarks/SELF_PLAY_2026_10_10.md)、[实际用户对局分析](docs/benchmarks/USER_GAME_95.md)、[训练规划](docs/TRAINING_PLAN.md)均已公开。
- 生产AI搜索仍为1.2：研究候选没有通过等时8盘稳定领先旧版至少5个自身回合的验收。I350复验3胜4负1上限和，已解算5局步差均值−1.2，另3局未知。失败、和局与未知保留，J权重相同且未自战。
- 正式展示用linear-v2为12参数、50局14开局组，训练/验证/测试35/11/4；只支持双人短跳且未锁营。实验估计是和棋折半预期得分，未校准为真人胜率；真实第94手能一步完成而模型约51.8%，欠拟合明确保留。

## 本次补齐的全部历史进度

补充ZIP保存321份原始字节文件，未压缩7,169,063字节、ZIP3,070,174字节。包括所有本项目历史arena自战目录（胜负、失败、截断与未完成批次）、临时审查脚本和输出、人机原始棋谱、残局语料、CPU profile、界面验收截图及旧测试日志。逐文件清单含路径、字节数与SHA-256；不把这些历史试验合并为棋力结论。

`learned-private173.json` 是本项目原创MIT线性实验模型：212个输入，173个合法唯一局，35/11/4正式模型之外的探索进度。它未接入生产、未经过当前棋力门槛验证；仅保存原始实验，不能将其规模视为更强棋力或盲测保证。`fast-v11-250` 缺少summary；`step-completion-human-smoke`只有单局文件，均标为不完整，不补造完成结果。其他档案以各自原始summary和元数据为准。

去掉重复的历史源码解压校验目录，它们可从Git标签和公开source.zip恢复；第三方原始媒体及下载二进制未再次分发，保存了本项目原创识别JSON和来源记录。已检查的纯棋室及公开仓库截图随包保留。

第三方Kata研究下载可从[官方Release](https://github.com/hzyhhzy/KataGomo_fork/releases/tag/20240406)重新获取 `Kata_MoveStoneGames_20220526.zip`，SHA-256 `e6246770e592783b70c75eed246431ec09a914638454b851c4ea492d3e024e65`；提取权重SHA-256 `7498b378217461d296fda4d21be6ad860713bad95724550b4e5d97deb8de981a`。它是81落点菱形长跳模型，与本项目121孔短跳不同，未完成推理棋力验证；详细记录见[引擎研究](docs/ENGINE_OPTIONS_1_2.md)。未用第三方包的JRE许可冒充模型许可。

## 校验与版本边界

1.4源码包SHA-256：`337caaa83cf55083313e81327aefd3f71a90bcf6d35f31a6b5afa271feb23ad3`。

补充进度包SHA-256：`6a3680ffd8c91f5d6dc06b01daa738e7e74d82218a0317d88811344d1b48dc50`。

本次仅补齐开源交接；没有新训练、新棋力宣称，也没有合并PR或更新正式站。后续修改源码按交接说明测试、更新源码包校验、通过PR审查再发布。
