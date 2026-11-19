# 算力狂飙 · Math Kart v9 最终验收报告

## 结论

v9 保留双场景 BGM、事件音效、路障减速、护盾抵挡、七车车库和只点击答案的自动竞速，并完成用户再次指出的两块挡路岩石修复。此次不再仅凭固定机位判断，而是在真实答案-only 比赛中复现遮挡、用相机中心射线定位实例、过滤道路净空，再在原故障时间点复验。

- 玩家入口：`http://127.0.0.1:28474/`
- 当前证据 Run ID：`v9-audio-collision-final`
- 生产 JS：`assets/index-dtn8739k.js`，1,044.95 kB，gzip 289.73 kB
- 生产 CSS：`assets/index-qOLfBgZ0.css`，135.58 kB，gzip 23.23 kB
- 静态发布目录：`dist/preview/`
- 普通玩家入口不暴露 QA 诊断；`?qa=1` 仅用于自动化验收。

最终结果：TypeScript / ESLint、生产构建、Playwright 9/9、Chromium / Firefox / WebKit、桌面与手机实景、完整两圈答案-only 比赛、普通玩家入口和 24 项证据覆盖检查全部通过。无需重启电脑或重新授权，刷新页面即可。

## 1. 两块挡路岩石：定位、修复与复验

### 真实故障定位

在当前 v9 重新进行真实答案输入比赛，第二圈约 29.85 秒山崖段与约 33.85 秒洞穴段均复现过浅色岩体遮挡。山崖故障时玩家进度约 0.4568，相机中心射线前两个命中为：

1. `hyper3d-instanced-hill`，实例 **4**，距离相机约 2.59；
2. `hyper3d-instanced-hill`，实例 **2**，距离约 8.44。

因此这两块不是“镜头感觉太近”，而是实际岩体进入驾驶及镜头空间。洞穴遮挡会随自动走线变化，不能仅凭另一场同一秒没有命中就判定不存在。

### 道路净空过滤

`World.installEnvironment` 现在对 `cliff` 与 `hill` 的每个实例执行实际几何包围盒检查：

- 对整条赛道取 385 个路面采样点；
- 垂直方向与道路及车辆空间重叠，且水平方向进入道路中心 9 米安全区的实例不渲染；
- 被过滤实例也不加入镜头碰撞体；
- 道路外地形、洞穴地标和远景山体保留。

本次过滤记录为 1 个 `cliff` 和 13 个 `hill`，其中包括已确认的 hill 2、4：

- `cliff:0`
- `hill:0,1,2,3,4,6,8,10,12,14,16,27,32`

### 原时间点复验

过滤后重新跑真实答案输入比赛：

| 原故障时间 | 路段 | 中心射线首个命中 | 画面结果 |
|---|---|---|---|
| 29.85 秒 | 第二圈山崖 | `v4-crowned-asphalt-with-metric-uv` | 赛车、道路和护栏完整可见 |
| 33.85 秒 | 第二圈洞穴 | `v4-crowned-asphalt-with-metric-uv` | 道路、赛车和洞穴通道完整可见 |

证据：

- 修复前：[`山崖遮挡`](v9-final/rock-audit/current-29-8.png)、[`洞穴遮挡`](v9-final/rock-audit/current-33-8.png)
- 射线定位：[`camera-hits.json`](v9-final/rock-audit/camera-hits.json)
- 过滤清单：[`removed-road-blockers.json`](v9-final/rock-audit/removed-road-blockers.json)
- 修复后：[`山崖清晰`](v9-final/rock-audit/fixed-29-8.png)、[`洞穴清晰`](v9-final/rock-audit/fixed-33-8.png)
- 复验数据：[`fixed-report.json`](v9-final/rock-audit/fixed-report.json)

## 2. 双场景音乐与事件音效

已接入 11 个 Seed Audio 生成并后处理的本地 WAV：

| 场景/事件 | 文件 |
|---|---|
| 车库 BGM | `public/audio/menu-bgm.wav` |
| 比赛 BGM | `public/audio/race-bgm.wav` |
| 按钮 | `ui-click.wav` |
| 答对 / 答错 | `correct.wav` / `wrong.wav` |
| 喷射加速 | `boost.wav` |
| 碰撞 | `impact.wav` |
| 漂移 | `drift.wav` |
| 倒计时 | `countdown.wav` |
| 冲线 | `finish.wav` |
| 对手强化预告 | `telegraph.wav` |

两段 BGM 均为 8.5 秒循环。运行时只读取本地 `public/audio/`，不依赖 CDN、API Key 或在线音频服务。`GameAudio` 使用 music、sfx、ui、engine 和 master 分组，支持手势解锁、场景切换、循环、静音、暂停挂起、继续恢复、重开清理和 dispose。

落地音和引擎音继续使用合成实现；新生成请求连续遇到服务容量限制，因此不宣称所有声音都来自 Seed Audio。漂移音采用阈值穿越检测，并增加 2.8 秒冷却，避免漏发和逐帧叠加。

## 3. 真实路障碰撞减速

沿用固定 60 Hz 的自定义街机竞速模拟和简化触发体，不对高精视觉 mesh 做碰撞。

无护盾接触路障时：速度乘以 0.58、最低保持 7，进入约 0.9 秒恢复阶段；接触冷却 1 秒，不停车、不倒退。玩家看到明确提示并听到碰撞音。护盾接触不减速，扣除约 1.25 秒护盾时间。

专项浏览器测试验证：真实接触后速度处于 7–18 的减速区间、`collisionSlowRemaining > 0`，约 1.2 秒后恢复且持续前进；护盾接触时速度保持、无 `impactSlow`，碰撞音同步触发。

## 4. 最新完整答案-only 比赛

脚本：[`scripts/full-race-bot.mjs`](../scripts/full-race-bot.mjs)。只点击“开始比赛”和真实答案按钮，不发送驾驶键，不调用跳关 `setState`。

| 指标 | 最终结果 |
|---|---:|
| 玩家排名 | 第 1 / 5 |
| 玩家比赛时间 | 42.28 秒 |
| 墙钟时间 | 52.91 秒 |
| 正确答题 | 20 |
| 最佳连对 | 18 |
| 超车 | 7 |
| 自然路障接触 | 2 |
| 路段覆盖 | 海滨、港口、山崖、洞穴、大桥 |
| 路线奖励 | 四类全部进入 |
| 软锁窗口 | 0 |
| 浏览器错误 | 0 |
| 音频加载错误 | 0 |
| 同时音乐实例 | 1 |
| 动态峰值 draw calls | **203 / 300** |
| 动态峰值三角面 | **666,668 / 750,000** |

最终排名：

1. 彗星号：42.28 秒
2. 浪花号：47.73 秒
3. 星辉号：47.95 秒
4. 闪电号：48.27 秒
5. 嫩芽号：48.73 秒

该场采样事件：按钮 1、倒计时 3、答对 20、答错 1、加速 32、漂移 11、碰撞 3、预告 4、冲线 1；落地使用合成音 2 次。

证据：

- [`完整比赛 JSON`](v9-final/full-race/report.json)
- [`完整比赛视频`](v9-final/full-race/full-race.webm)
- [`最终排名截图`](v9-final/full-race/final-ranking.png)
- [`比赛抽帧接触表`](v9-final/full-race/contact-sheet.png)

接触表覆盖发车、港口、山崖、洞穴、大桥、第二圈和冲线，已目检；未见全屏岩体遮挡、黑屏、冻结、赛道断裂或布局破损。抽帧目检不等于逐帧动画审核。

## 5. 渲染与像素证据

| 状态 | Draw calls | 三角面 | Geometries | Textures | 色彩熵 | 边缘密度 |
|---|---:|---:|---:|---:|---:|---:|
| 桌面比赛 | 123 | 556,934 | 226 | 33 | 6.75 | 0.429 |
| 桌面山崖 | 122 | 534,262 | 205 | 27 | 6.35 | 0.424 |
| 手机比赛 | 86 | 220,464 | 178 | 19 | 5.42 | 0.312 |
| 手机山崖 | 92 | 248,056 | 168 | 17 | 5.45 | 0.358 |

四组均为硬件 GPU、非空画布、已确认状态、0 浏览器错误，所有渲染预算通过。手机证据来自 Chromium 移动视口和真触摸仿真，不是实体手机帧率证明。

本轮是岩石净空窄修复及此前音频、碰撞集成的最终回归，沿用既有卡通美术基线，不重新宣称 Showcase。

## 6. 构建、玩法和浏览器检查

```bash
npm run lint
npm run build
npm run prepare:preview
npx playwright test tests/audio-collision.spec.ts
npx playwright test tests/gameplay.spec.ts
RUN_NAME='v9-final/full-race' npm run test:race
REPORT_PATH='artifacts/v9-final/browser-compatibility.json' npm run test:compat
REPORT_PATH='artifacts/v9-final/release-smoke.json' npm run test:release
npm run inspect:canvas
```

结果：

- TypeScript 与 ESLint：PASS。
- Vite 生产构建：PASS；主 chunk 有体积提示，不是构建错误。
- 音频/碰撞专项：2/2 PASS。
- 玩法回归：7/7 PASS。
- Chromium `159.0.8154.6`：PASS。
- Firefox `159.0`：PASS。
- WebKit `27.2`：PASS。
- 普通生产入口：PASS；0 驾驶按钮、0 QA 暴露、0 页面错误、0 坏响应。

报告：[`audio-collision-tests.json`](v9-final/audio-collision-tests.json)、[`gameplay-tests.json`](v9-final/gameplay-tests.json)、[`browser-compatibility.json`](v9-final/browser-compatibility.json)、[`release-smoke.json`](v9-final/release-smoke.json)。

## 7. 证据覆盖

清单：[`artifacts/evidence.json`](evidence.json)。共 **24 项**，包括四组当前 Run 实景报告、11 个运行时音频、两类测试 JSON、完整比赛 JSON / 视频、三浏览器报告、玩家入口报告和本轮岩石修复前后证据。

该检查证明证据覆盖与文件有效性，不单独替代玩法、性能或美学判断。

## 8. 主要代码位置

- `src/game/world.ts`：实际岩石包围盒道路净空过滤、地形与镜头避让、移动 LOD
- `src/game/GameEngine.ts`：QA 相机射线审计、手势解锁、场景音乐与诊断
- `src/game/audio.ts`：双场景 BGM、分组、采样播放、暂停/重开
- `src/game/raceSimulation.ts`：路障减速、护盾抵挡、漂移事件和冷却
- `tests/audio-collision.spec.ts`：音频与真实接触专项
- `scripts/full-race-bot.mjs`：完整答案-only 比赛、音频和预算断言

## 9. 已知边界

1. 只有一条五段两圈赛道；无联网对战、手工驾驶或默认手动道具操作，属于既定玩法范围。
2. 落地音和引擎音为合成实现，其余列出的 11 个音频为 Seed Audio 素材。
3. Hyper3D 车模为单 mesh，自带轮胎不参与程序轮转；车身侧倾、悬挂、驾驶员动作、尾焰、漂移痕迹与跳台运动保留。
4. 手机证据不是实体手机帧率证明；主 JS 约 1.04 MB，仍有后续代码拆分空间。

## 10. 发布与交付

- 运行包：`math-kart-v9-game.zip`（已更新为岩石净空修复后的版本）
- 源码包：`math-kart-v9-source.zip`（同上）
- 本报告：`math-kart/artifacts/final-evidence.md`

将 `dist/preview/` 内的全部内容上传到静态网站根目录即可。运行时不需要 Hyper3D、API Key、临时下载地址或第三方音频服务。
