# 算力狂飙 · Math Kart

[![复刻验证](https://github.com/beachlife664-a11y/math-kart/actions/workflows/ci.yml/badge.svg)](https://github.com/beachlife664-a11y/math-kart/actions/workflows/ci.yml)

一款可离线运行的 Three.js 数学自动卡丁车游戏。支持 1–2 名真实玩家同屏竞速，没有 AI 赛车；每位玩家独立回答小学数学题，用正确答案换取喷射、连对强化、自动道具和路段奖励。

**本仓库是完整复刻版：源码、正式 GLB、原始建模包、参考图、贴图、音频母带、真实生成提示词、制作记录、测试脚本和最终验收证据均已包含。**

## 一键复刻

要求：Node.js `^20.19.0` 或 `>=22.12.0`，npm。首次安装依赖需要访问 npm registry；安装完成后，游戏运行不需要网络、Python、Hyper3D 账号、API Key 或本机 Skill。

```bash
git clone https://github.com/beachlife664-a11y/math-kart.git math-kart
cd math-kart
node scripts/setup.mjs
npm run preview:static
```

打开 **http://127.0.0.1:28474/**。

`setup.mjs` 会依次校验 65 个运行资源文件、执行 `npm ci`、构建生产版本并生成 `dist/preview/`。Windows、macOS 和 Linux 使用相同命令。

## 一键验证

```bash
# 首次需要安装测试浏览器
node scripts/setup.mjs --with-tests

# 自动启动预览，执行资源校验、构建、10 项玩法/音频测试、
# 三浏览器、普通玩家入口和桌面/手机画面检查，最后关闭服务器
npm run verify:local

# 额外跑完整两圈真实答案输入比赛并录制视频
npm run verify:local -- --full-race
```

也可使用 `PORT=28476 npm run verify:local` 避免端口冲突。无硬件 WebGL 的持续集成环境使用 `npm run verify:ci`；该命令检查依赖、资源、构建、数学逻辑与正式资源访问，不替代本机完整图形回归。

## 玩法与操作

| 行为 | 桌面 | 手机/平板 |
|---|---|---|
| 七款赛车选配 | 点击车型或左右切换 | 同左 |
| 查看完整车模 | 鼠标 360° 拖动、滚轮缩放 | 单指拖动 |
| 驾驶、跟车、超车、避障、漂移、道具 | 全自动 | 全自动 |
| 数学答题 | 屏幕数字键；P1 用主键盘数字区，P2 用右侧小键盘 | 点击各自数字键盘 |
| 提交/修改 | P1：Enter / 退格；P2：小键盘 Enter / Delete | 确认、清空、退格按钮 |
| 暂停/继续 | P / Esc 或暂停按钮 | 暂停按钮 |
| 静音 | M 或声音按钮 | 声音按钮 |

- 开局可选 1 人或 2 人同屏；双人各有独立题目、输入框、连对能量、加速和结算，没有 AI 对手。
- 卡通答题机位于左右下角，采用大算式和 6×2 数字键盘，中央赛道不放大面板；手机单人也保留完整车体视野。
- 双人接近时共享镜头，距离拉开后切换左右独立追踪画面，重新接近后自动合并，避免中点镜头无限拉远。
- 答对：自己的赛车立即喷射，连对充能，自动择机使用氮气、护盾和超级涡轮。
- 答错：显示正确答案，失去本次奖励，不停车、不倒退。
- 路段奖励：港口加速线、山崖内侧捷径、水晶高速线和落地冲刺。
- 无护盾撞到路障：明确短暂减速后自动恢复；护盾可抵挡。
- 所有真实玩家完赛后生成最终排名；单人只有一辆车，双人只有两辆车，整场无需驾驶按键。

## 五段连续旅程

1. 海滨发车区：看台、车库、起跑灯、灯塔与观众。
2. 彩色港口：主楼、仓库、集装箱、吊机、渔船与缓弯。
3. 山崖盘山道：高差、发卡弯、瀑布和自动漂移。
4. 水晶洞穴：岩壁、水晶、矿车轨道与局部灯光。
5. 跨海大桥：桥塔、悬索、桥墩、跳台和终点冲刺。

## 仓库里有什么

```text
src/                       React + TypeScript + Three.js 完整源码
public/                    正式运行模型、贴图、音频、缩略图和清单
assets/                    山体参考/原模、Seed Audio 母带、真实生成日志
artifacts/art-v6/          七车参考图、Hyper3D 原模、桌面/手机 LOD、任务记录
artifacts/art-v5/          卡通赛车与环境生成迭代、原模、优化版与预览
artifacts/art-v3/          港口原始模型及首轮地标参考资料
artifacts/v9-final/        当前完整比赛、截图、射线定位与验收报告
scripts/                   安装、预览、验证、模型优化、捕获和 QA 脚本
tests/                     真实输入玩法与音频/碰撞 Playwright 测试
docs/                      架构、编码规则、资产/音频管线、过程与发布指南
```

完整目录说明见 [`docs/REPOSITORY_CONTENTS.md`](docs/REPOSITORY_CONTENTS.md)。

## “1:1 复刻”的准确定义

- **精确复刻当前版本**：使用仓库内锁定源码和 GLB/WAV/贴图；`assets/runtime-manifest.json` 保存全部运行资源 SHA-256，`repository-files.sha256` 保存交付时整仓库文件清单。
- **依赖可重复**：`package-lock.json` 固定 npm 依赖，安装脚本不引用本机绝对路径。
- **测试可重复**：QA 使用种子 42 和真实输入；完整比赛不发送驾驶键、不跳关。
- **AI 重新生成属于再创作**：提示词与任务参数已保留，但生成服务存在随机性，不能保证新结果逐位相同；复刻当前版本无需重新生成。

## 文档导航

| 文档 | 内容 |
|---|---|
| [`docs/REPRODUCE.md`](docs/REPRODUCE.md) | 全新安装、验证、静态部署和故障排查 |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | 游戏循环、自动竞速、渲染、音频和资源架构 |
| [`docs/CODING_STANDARDS.md`](docs/CODING_STANDARDS.md) | 代码编写、性能、安全、碰撞、镜头和提交规则 |
| [`docs/ASSET_PIPELINE.md`](docs/ASSET_PIPELINE.md) | 参考图 → Hyper3D → 原模检查 → LOD → 游戏校准 |
| [`docs/AUDIO_PIPELINE.md`](docs/AUDIO_PIPELINE.md) | Seed Audio 母带、后处理、事件映射与循环规则 |
| [`docs/PROCESS.md`](docs/PROCESS.md) | v1–v9 制作过程与关键问题复盘 |
| [`docs/QA.md`](docs/QA.md) | 验收矩阵、完整比赛、性能预算和证据说明 |
| [`docs/GITHUB_PUBLISH.md`](docs/GITHUB_PUBLISH.md) | 上传 GitHub、Actions 和 Release 发布 |
| [`docs/ASSET_LICENSES.md`](docs/ASSET_LICENSES.md) | 代码与生成资产的授权/来源边界 |

## 当前验证基线

- TypeScript / ESLint、生产构建、Playwright **11/11**。
- Chromium / Firefox / WebKit 全部通过。
- 完整两圈双人真实数字输入比赛：两车完赛、各答对 21 题、各获得 4 类路段奖励，0 软锁、0 浏览器错误。
- 双人完整比赛实测峰值 **212 draw calls / 556,428 triangles**。
- 两块挡路岩石已通过真实比赛射线定位，并以道路净空过滤修复。

详见 [`artifacts/final-evidence.md`](artifacts/final-evidence.md)、[`artifacts/reproduction/README.md`](artifacts/reproduction/README.md) 与 [`docs/QA.md`](docs/QA.md)。

## 已知边界

- 一条五段两圈赛道；无联网、手工驾驶或默认手动道具。
- 手机证据来自 Chromium 移动视口和真触摸仿真，不是实体手机帧率证明。
- Hyper3D 车模为单 mesh，自带轮胎不参与程序轮转。
- 落地与引擎音使用合成实现；其余列出的 11 个运行时音频来自 Seed Audio 素材。
- 主 JS 约 1.04 MB，仍有代码拆分空间。

代码授权见 [`LICENSE`](LICENSE)；生成资产与第三方依赖的来源边界见 [`docs/ASSET_LICENSES.md`](docs/ASSET_LICENSES.md)。
