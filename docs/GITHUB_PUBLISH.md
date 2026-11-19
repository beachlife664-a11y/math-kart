# 发布到 GitHub

## 1. 本地检查

```bash
npm run verify:assets
npm run lint
```

确认没有真实 `.env`、密钥、签名 URL、用户路径或 `node_modules/`。仓库中的 GLB 等单文件均低于 100 MB，默认不依赖 Git LFS，克隆后即可直接获得全部资源。

## 2. 创建并推送仓库

```bash
git init -b main
git add .
git commit -m "feat: complete reproducible Math Kart game"
git remote add origin https://github.com/<你的账号>/<你的仓库>.git
git push -u origin main
```

使用 GitHub CLI 的等价方式：

```bash
git init -b main
git add .
git commit -m "feat: complete reproducible Math Kart game"
gh repo create math-kart --public --source=. --push
```

将 `--public` 改为 `--private` 可创建私有仓库。推送前请先确认 `docs/ASSET_LICENSES.md` 中的生成资产分发边界符合你的账号条款。

## 3. GitHub Actions

`.github/workflows/ci.yml` 在 Ubuntu + Node.js 22 上执行：

1. `npm ci`；
2. 资源 SHA-256、lint 和生产构建；
3. 安装 Playwright 浏览器；
4. `npm run verify:local`，覆盖 9 项测试、三浏览器、正式入口和桌面/手机画面。

完整两圈录像较耗时，默认由本地 `npm run verify:local -- --full-race` 执行，不作为每次 push 的强制 CI 步骤。

## 4. 发布 Release

建议标签：`v9.0.0`。Release 可附两个产物：

- 完整源码仓库 ZIP（含建模包和文档）；
- 仅 `dist/preview/` 的静态运行包，便于直接部署。

运行包制作：

```bash
npm ci
npm run build
npm run prepare:preview
```

将 `dist/preview/` 内全部文件压缩上传。玩家解压后用任意静态 HTTP 服务托管即可；不要用 `file://` 直接打开。

## 5. 克隆后的验收评论模板

```text
Node.js:
npm:
OS:
npm ci: PASS/FAIL
npm run verify:assets: PASS/FAIL
npm run verify:local: PASS/FAIL
完整比赛（可选）: PASS/FAIL
问题与日志:
```

这样可以把“代码相同”与“不同机器实际复刻成功”区分开。
