# 全新目录复刻验证

本目录是仓库组装完成后，在没有 `node_modules` 的新项目目录中实际运行得到的结果。

```bash
node scripts/setup.mjs --with-tests
PORT=28476 npm run verify:local -- --full-race
```

## 结果

- 65/65 运行资源 SHA-256：PASS。
- `npm ci`：469 个锁定依赖安装成功。
- TypeScript / ESLint / 生产构建：PASS。
- Playwright 玩法与音频/碰撞：9/9 PASS。
- Chromium / Firefox / WebKit：PASS。
- 普通玩家入口：无 QA、无驾驶按钮、无错误、无坏响应。
- 桌面/手机 active-play 与 cliff：四组画面、像素和预算全部 PASS，硬件 GPU。
- 完整两圈：只点击开始和真实答案，无驾驶键、无 `setState`。
- 玩家 40.98 秒第一；21 次答对、最佳连对 21、4 次超车、1 次自然路障接触。
- 五车完赛；0 软锁、0 浏览器错误、0 音频加载错误。
- 峰值 209 calls / 701,502 triangles，低于 300 / 750,000 预算。

`summary.json` 记录一键检查项，`full-race/report.json` 记录完整比赛，`full-race/full-race.webm` 为实际录像。其余 JSON/PNG 为跨浏览器、普通入口、玩法、音频和桌面/手机证据。
