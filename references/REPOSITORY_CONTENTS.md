# 仓库内容与轻量化取舍

## 核心目录

| 路径 | 内容 | 用途 |
|---|---|---|
| `SKILL.md` | Skill 元数据、触发场景、使用流程和质量约束 | Agent 加载 Skill |
| `scripts/` | Skill 项目复制与结构/资源自检 | 创建和检查游戏项目 |
| `references/` | 玩法、复刻、架构、资产、音频、轻量化与验收参考 | 按需加载 |
| `assets/math-kart/src/` | 全部 React / TypeScript / Three.js 源码 | 构建游戏 |
| `assets/math-kart/public/` | 65 个正式模型、贴图、音频、缩略图和 JSON 清单 | 运行游戏 |
| `assets/math-kart/assets/` | 音频母带、真实生成日志、运行资源哈希 | 校验与再创作 |
| `assets/math-kart/scripts/` | 安装、预览、验证、模型优化、捕获与 QA | 游戏工程脚本 |
| `assets/math-kart/tests/` | 玩法与音频/碰撞测试 | 完整验证 |
| `assets/math-kart/artifacts/` | 可复现捕获清单和最终验收说明 | 验证参考 |

## 保留的完整运行复刻内容

- 当前版本全部源码、配置和 lockfile。
- 正式运行资源及每个文件的 SHA-256。
- 11 个音频母带与正式 WAV。
- 清洗后的真实图像、Hyper3D 和音频生成提示词/参数。
- 正式捕获清单与最终验收说明。
- 可独立运行的安装、预览、测试、检查和 CI 工作流。

## 不再随 GitHub 分发的大型资料

- `assets/math-kart/artifacts/art-v*/`：原始 GLB、参考图、任务记录、LOD 中间版本和建模预览。
- `assets/math-kart/artifacts/v*/`：历史截图、完整比赛录像和阶段性验收输出。
- `assets/math-kart/artifacts/reproduction/`：可由验证脚本重新生成的报告、截图和录像。
- `assets/math-kart/assets/models/`、`assets/math-kart/assets/concepts/`：山体原模、LOD 中间稿和参考图。

这些目录保留在制作者本机，并由 `.gitignore` 防止重新误提交。`node_modules/`、`dist/`、Playwright 与浏览器缓存同样可重建，不纳入版本控制。

轻量化不移除任何正式车辆、地标、贴图、音频、玩法或测试能力。新克隆仓库仍可离线运行当前游戏；需要重新验收时执行脚本即可生成新证据。个人电脑绝对路径、OAuth 数据、密钥、签名 URL 和内部运行轨迹始终不纳入仓库。
