# QA、性能与发布验收

## 1. 一键验收

```bash
node scripts/setup.mjs --with-tests
npm run verify:local
npm run verify:local -- --full-race
```

`verify:local` 会自行启动和关闭静态服务器。它执行资源校验、TypeScript/ESLint、生产构建、9 项 Playwright、三浏览器、普通玩家入口和四组桌面/手机画布检查。

GitHub 托管 runner 没有硬件 WebGL，因此推送时执行 `npm run verify:ci`：资源 SHA-256、TypeScript/ESLint、生产构建、300 道数学题的确定性检查，以及正式 HTTP 入口和 GLB/WAV/PNG 资源可访问性。它不替代上方在本机已通过的 9 项真实输入、三浏览器和图形回归；完整测试用例均保留，未因 CI 环境删除或标记跳过。

## 2. 单项命令

先在一个终端运行 `npm run preview:static`，再执行：

```bash
npm run lint
npm test                    # 七项玩法、车库、手机与赛道回归
npm run test:audio          # 双 BGM、事件采样、碰撞和护盾
npm run test:compat         # Chromium / Firefox / WebKit
npm run test:release        # 正式玩家入口、无 QA、无驾驶按钮、无坏响应
npm run test:race           # 完整两圈答案-only + 视频 + 排名
ANSWERS=0 npm run test:race # 不答题对照组
npm run inspect:canvas      # 声明的桌面/手机状态和预算
```

## 3. 当前功能基线

- TypeScript / ESLint：PASS。
- Playwright：9/9 PASS。
- Chromium、Firefox、WebKit：PASS。
- 普通生产入口：0 QA 暴露、0 驾驶按钮、0 页面错误、0 坏响应。
- 完整答案-only 比赛：五车完赛、0 软锁、0 浏览器错误、0 音频加载错误。
- 音乐同时实例数为 1；暂停和重开不叠加。

## 4. 全新仓库复刻结果

在没有 `node_modules` 的 `math-kart-github` 新目录中执行 `node scripts/setup.mjs --with-tests`，再执行 `PORT=28476 npm run verify:local -- --full-race`：

- 65/65 运行资源 SHA-256 一致；469 个 npm 依赖安装成功。
- TypeScript / ESLint、生产构建、Playwright 9/9、三浏览器全部通过。
- 四组桌面/手机画布与预算检查全部通过，GPU 报告为硬件渲染。
- 完整比赛：玩家 40.98 秒第一，21 次答对、最佳连对 21、4 次超车、1 次自然路障接触。
- 五车完赛，0 软锁、0 浏览器错误、0 音频加载错误。
- 峰值 209 draw calls / 701,502 triangles，均低于桌面预算。

报告、桌面/手机截图和完整录像见 `artifacts/reproduction/`。

## 5. 原 v9 完整比赛基线

| 指标 | 结果 |
|---|---:|
| 玩家排名 | 1 / 5 |
| 玩家时间 | 42.28 秒 |
| 答对 | 20 |
| 最佳连对 | 18 |
| 超车 | 7 |
| 自然路障接触 | 2 |
| 软锁 / 浏览器错误 | 0 / 0 |
| 峰值 draw calls | 203 / 300 |
| 峰值 triangles | 666,668 / 750,000 |

比赛只点击开始与真实答案，不发送驾驶键，不调用 `setState`。结果会随真实点击时间略有变化，不应把单次排名当作所有输入条件下的保证。

## 6. 桌面与手机预算

| 项目 | 桌面 | 手机 |
|---|---:|---:|
| Draw calls | 300 | 150 |
| Triangles | 750,000 | 300,000 |
| Geometries | 300 | 200 |
| Textures | 60 | 40 |

当前实测和像素报告由 `artifacts/reproduction-manifest.json` 声明；运行 `npm run verify:local` 会刷新 `artifacts/reproduction/`。手机为 Chromium 移动视口与真触摸仿真，不是实体手机帧率证明。

## 7. 岩石专项证据

- `artifacts/v9-final/rock-audit/current-29-8.png` / `current-33-8.png`：修复前真实故障。
- `camera-hits.json`：hill 2、4 的射线、距离和实例矩阵。
- `removed-road-blockers.json`：实际包围盒道路净空过滤清单。
- `fixed-29-8.png` / `fixed-33-8.png`：原故障时间点修复后画面。
- `fixed-report.json`：两次中心首命中均为道路。

## 8. 证据规则

1. 使用当前代码的新 Run ID，不把旧报告改名复用。
2. 捕获真实活动比赛，不用车库或标题页代替。
3. 截图只证明画面，真实输入测试才证明玩法。
4. 音频需要真实手势、事件、循环、暂停/重开和静音检查。
5. 动画与遮挡需要动态录像或原时间点的真实比赛复验。
6. 失败项必须保留并修复，不能从清单删除后宣称通过。

完整当前报告见 `artifacts/final-evidence.md`；复刻验证输出见 `artifacts/reproduction/`。
