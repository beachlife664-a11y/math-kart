# Math Kart v7 首屏 UI 验收报告

## 结果

- Run ID：`v7-ui-final-1`。
- 玩家入口：`http://127.0.0.1:28474/`。静态生产目录已刷新，刷新页面即可，无需重启。
- 本轮只改首屏界面、选车缩略图和相应测试；七款 Hyper3D 车模、三维车库、自动竞速、答题和排名规则均保留。
- 旧版米白大卡片与色块按钮已移除，改为深色赛车控制台、紧凑赛事字标、七车全真缩略图和明确的发车按钮。

## 视觉与交互改造

- `src/game/RaceOverlays.tsx`：重组首屏信息层级，加入赛事字标、赛制信息、七车编号、完整车辆图片、选中状态和发车按钮。
- `src/game/math-kart.css`：深色切角控制台、赛道信号色、 hover/selected/focus 状态、桌面和手机布局；手机收起重复说明，避免面板滚动与裁切。
- `art-preview.html`：增加透明背景和缩略图视角，只用于资产渲染检查。
- `scripts/capture-kart-thumbnails.mjs`：从正式 GLB 逐车渲染 480×360 原始透明图。
- `scripts/fit-kart-thumbnails.py`：按 alpha 边界裁切、统一留白，输出七张 480×300 PNG 到 `public/models/thumbnails/`。
- `tests/gameplay.spec.ts`：新增七图加载尺寸断言和手机面板无横向/纵向溢出断言；保留七车切换、360° 拖动、缩放、重置和选车开赛测试。

七车缩略图都来自当前正式模型，不是色块、无关插画或重新付费生成的模型。总文件量约 806 KB，不增加 WebGL draw calls。

## 画面证据

- [桌面首屏](v7-ui-final/desktop-menu.png)
- [手机首屏](v7-ui-final/mobile-menu.png)
- [桌面比赛](v7-ui-final/desktop-active-play.png)
- [手机比赛](v7-ui-final/mobile-active-play.png)
- [七车缩略图接触表](v7-ui/thumbnail-sheet.png)
- [七车展台与拖动背面](v7-ui-final/showroom/report.json)

桌面首屏实测：114 calls / 338,594 triangles / 137 geometries / 14 textures；硬件 GPU，非空白，预算检查通过。手机与桌面菜单、比赛四组捕获均通过。

## 自动检查

| 检查 | 结果 |
| --- | --- |
| `npm run lint` | TypeScript 与 ESLint 通过 |
| `npm run build && npm run prepare:preview` | 生产构建与静态资源同步通过 |
| `npm run inspect:canvas` | 桌面/手机的 menu、active-play 共 4 组全部 PASS |
| `npm run capture:showroom` | 七车展台及真实拖动背面全部捕获，报告 PASS |
| `npm test` | Playwright 7/7 PASS，约 37.6 秒 |
| `npm run test:compat` | Chromium、Firefox、WebKit 全部 PASS |
| `npm run test:release` | 普通玩家入口 PASS；无 QA 暴露、0 驾驶按钮、0 错误、0 坏响应 |
| 证据检查 | 16 项声明文件全部存在且有效 |

跨浏览器首轮 WebKit 出现一次等待超时；随后逐阶段诊断通过，完整三浏览器复跑也全部通过。未修改游戏代码掩盖该时序问题，最终报告以复跑结果为准。

生产 JS：1,037.20 kB，gzip 287.51 kB；生产 CSS：135.55 kB，gzip 23.22 kB。Three.js 主包仍有既有 chunk-size 提示，不是构建错误。

## 范围与边界

- 本轮为窄范围 UI 修改，不重评整套游戏的美术分数，也不把 v6 的完整比赛视频冒充本轮新证据。
- 竞速模拟、赛道和三维资产未改，因此未重复录制完整两圈；七项回归仍覆盖两圈排名、真实答题、自动竞速、七车展台与移动输入。
- 手机验证为移动视口和真实触摸事件仿真，不是实体手机帧率证明。
- 车模自带轮胎不独立程序旋转、山体与护栏为程序化资产等 v6 边界保持不变。

详细机器证据见 `artifacts/evidence.json`、`artifacts/browser-compatibility-v7-ui.json` 和 `artifacts/release-smoke-v7-ui.json`。
