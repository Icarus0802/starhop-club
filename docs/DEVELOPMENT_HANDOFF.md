# 换电脑继续开发

仓库：https://github.com/Icarus0802/starhop-club 。主分支为已发布版本；本次研究与1.4界面成果在 `research/step-gap-and-learned-value`，合并前可直接下载该分支。完整源码包同时保存为根目录 `source.zip` 与 `research-source.zip`，附SHA-256校验；如果自动展开尚未完成，解压后即可开发。

## 获取与启动

安装Node.js 18以上和Git，然后：

```sh
git clone https://github.com/Icarus0802/starhop-club.git
cd starhop-club
git switch research/step-gap-and-learned-value
node server.cjs
```

打开 `http://127.0.0.1:5173/#play`。无需安装npm依赖；Windows也可双击 `启动跳棋.cmd`，离线直接打开index.html可用。原电脑棋谱保存在浏览器本地，迁移请先在“我的棋谱”导出JSON，新电脑导入；Git不会自动迁移浏览器存档。

## 校验与继续研究

```sh
node --test tests/*.test.cjs
node scripts/build.cjs
node scripts/report-step-match.cjs --include-heldout --public-evidence
```

Windows PowerShell如不展开测试通配符，可用：

```powershell
$starhopTests = @(Get-ChildItem -LiteralPath tests -Filter *.test.cjs | ForEach-Object { $_.FullName })
node --test $starhopTests
```

本轮本地140/140测试通过，包含规则、请求取消、实际棋谱、完整连续跳、冻结模型复训练与公开克隆复算。云端最初两个跨平台浮点末位对照失败已按1e-12严格容差修复，同进程复训仍精确比较；最终CI结果以Actions为准。

生产搜索在 `js/fast-search.js`、`js/ai.js` 和 `js/worker.js`；调整后重建worker bundle。结构诊断在 `js/analysis.js`，界面在 `js/app.js`、`js/analysis-ui.js` 和style.css。`js/value-model.js`只用于展示，与 `benchmarks/learned-value-v2.json` 冻结权重一致，不参与正式AI落子。

研究基线与候选保存在benchmarks，完整训练/自战脚本在scripts，11批64盘原始结果在 `docs/benchmarks/2026-10-10/`，没有本机arena目录也能复算报告。先读 `docs/benchmarks/PR_REVIEW.md`、`LEARNED_VALUE_REVIEW.md`、`SELF_PLAY_2026_10_10.md` 和 `docs/TRAINING_PLAN.md`。

## 未完成与验收标准

没有候选通过四个全新开局交换先后手共8局、相同思考预算、稳定领先旧版至少5个自身回合。候选I在350ms复验3胜4负1上限和；已解算5局步差均值−1.2，另3局未知。J修正数据契约但权重与I相同，未自战，不能宣称提升。

linear-v2仅50局、14开局组，35/11/4训练验证测试分组，12参数且欠拟合。真实第94手能一步赢而模型约51.8%；估计是和棋折半预期得分，非真人胜率。用户与大师棋谱虽排除训练，已用于诊断设计，不能再作为盲测。下一阶段应扩大独立训练数据、校准并严格等时自战，再考虑策略价值网络；未实现神经网络、冠军强度、联网房间或排名。

发布流程：研究分支上传包触发独立测试与源码展开，PR提供文字差异；main既有工作流测试通过后发布Release和Pages。修改发布包时同步SHA文件并升级package版本；不要跳过测试或将未过棋力门槛候选接入生产。
