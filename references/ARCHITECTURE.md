# 技术架构

## 1. 技术栈

- React 19 + TypeScript：界面、车库控制、HUD、答题和结算。
- Three.js：场景、GLB、实例化、地形、海水、VFX 与镜头。
- Vite：开发服务器和生产构建。
- 自定义固定 60 Hz 街机竞速模拟：多行车线、答题奖励、碰撞、道具和排名。
- Web Audio：分组音乐、采样与合成音。
- Playwright：真实输入、跨浏览器、手机仿真、完整比赛和截图。

## 2. 核心更新顺序

```text
答案/车库输入
  → 固定时间步竞速模拟
  → 路障触发、奖励、超车与排名
  → 车辆/驾驶员/VFX 同步
  → 镜头与地形/模型避让
  → HUD 与音频事件
  → Three.js 渲染
```

竞速状态不依赖渲染帧率；视觉模型不是碰撞世界。

## 3. 主要模块

| 文件 | 职责 |
|---|---|
| `src/game/GameEngine.ts` | 主循环、输入、车库、镜头、模型同步、QA 钩子 |
| `src/game/raceSimulation.ts` | 固定时间步、自动走线、答题、道具、碰撞和排名 |
| `src/game/config.ts` | 七车规格、驾驶员和手臂锚点、比赛常量 |
| `src/game/track.ts` | 赛道样条、连续高差、坐标采样 |
| `src/game/world.ts` | 五段环境、模型实例、道路净空过滤和镜头碰撞体 |
| `src/game/roadKit.ts` | 横拱路面、路缘、标线、护栏和轮胎墙 |
| `src/game/nature.ts` | 海水、云、植被和自然装饰 |
| `src/game/driver.ts` | 分件驾驶员、握姿、漂移倾身和庆祝 |
| `src/game/showroom.ts` | 三维车库、展台、工具和灯光 |
| `src/game/assets.ts` | GLB 加载、尺寸/朝向、材质和桌面/手机 LOD |
| `src/game/audio.ts` | 双 BGM、分组、采样、合成回退与清理 |
| `src/game/vfx.ts` | 尾焰、漂移火花、轮胎痕迹、护盾等 |

## 4. 自动竞速

赛车沿连续赛道距离前进，候选行车线根据前车距离、旁车空间、弯道、路障、加速状态和奖励路线评分。车辆分离约束防止排队穿插；曲率驱动减速、漂移、车身侧倾与出弯回正。

每位真实玩家的答案只改变自己的模拟状态：单题喷射、连对能量、自动道具和四类路段奖励。答错只损失本人的奖励机会。比赛生成 1–2 辆真实玩家赛车，不包含 AI 对手；所有真实玩家生成完赛成绩后才结算。

## 5. 资源加载

`public/models/` 分为七车、地标、环境、桌面/手机 LOD 和缩略图。JSON 清单声明目标高度、宽度、旋转和局部缩放。重复模型转为 `InstancedMesh`，失败时才使用程序化备选。

`assets/runtime-manifest.json` 是运行资源完整性基准；`scripts/verify-assets.mjs` 在构建前逐文件验证 SHA-256。

## 6. 道路与镜头安全

- 简化路障触发体负责减速，不对高精视觉 mesh 做碰撞。
- 连续地形和岩石模型可加入镜头避让。
- `cliff` / `hill` 在实例化时执行实际包围盒道路净空过滤，先保证物体本身不占路，再让镜头避让处理剩余遮挡。
- 双人共享/分屏由 `GameEngine` 管理：距离差大于 32 进入独立镜头，小于 18 才合并，并分别设置 1 秒 / 1.2 秒最短停留，避免边界抖动。
- 分屏使用两个 `PerspectiveCamera` 和 renderer scissor 左右渲染；每个视口渲染前分别更新近处模型渐隐，不让后一台相机的遮挡状态污染前一视口。
- 答题面板只占左右边缘，1080P 双面板之间保留约 1004px 中央赛道；布局测试同时约束面板高度、算式字号、按键高度和中央留白。
- QA 的 `auditCamera` 可从真实比赛相机中心发出射线，记录 mesh、实例 ID、距离和实例矩阵；普通玩家入口不暴露此能力。

## 7. 构建产物

```text
Vite → dist/client（中间）
     → dist/output（HTML + public 同源资源）
     → dist/output_resource/assets（JS/CSS）
     → dist/preview（完整可静态发布目录）
```

`npm run prepare:preview` 是必要步骤，会同步最新 `public/` 并重建预览目录。`scripts/static-server.mjs` 使用 Node 内置模块提供静态服务，不依赖 Python。

## 8. QA 与生产隔离

开发环境或 `?qa=1` 才安装诊断和测试钩子。普通生产入口检查 `__THREE_GAME_DIAGNOSTICS__` 与测试钩子均不存在。测试可以设置种子和场景，但完整比赛脚本必须只用真实开始按钮与答案点击证明主循环。
