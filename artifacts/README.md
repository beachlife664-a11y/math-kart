# 制作与验收资料

## Git 中保留

- `design-brief.md`：核心循环、五段关卡与平衡契约。
- `v4-art-direction.md`：全场景精细美术方案。
- `game-progress.md`：历史制作状态与关键决策。
- `final-evidence.md`：当前版本验收报告。
- `reproduction-manifest.json`：全新环境一键验证的四组画布捕获声明。

## 仅保留在制作者本机

- `art-v*/`：原始模型、参考图、任务记录、LOD 中间版本和逐资产预览。
- `v*/`：历史版本截图、录像、射线定位和阶段性验收输出。
- `reproduction/`：运行 `npm run verify:local` 后重新生成的报告、截图与录像。

这些大型目录已被 `.gitignore` 排除，不是安装、构建、运行或二次开发的依赖。精简设计文档和可重复执行的验证脚本仍随仓库提供；需要新证据时在本地重新生成，不将录像和截图重新提交到 Git。
