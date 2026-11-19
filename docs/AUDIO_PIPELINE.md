# 音频生产与集成管线

## 1. 已包含的音频

`assets/audio/seed/` 保存 11 个 Seed Audio 原始 WAV 母带；`public/audio/` 保存正式运行版本。真实生成提示词及重试记录位于 `assets/generation-log.json` 的 `audio` 数组。

| 用途 | 运行文件 |
|---|---|
| 车库 BGM | `menu-bgm.wav` |
| 比赛 BGM | `race-bgm.wav` |
| 按钮确认 | `ui-click.wav` |
| 答对 / 答错 | `correct.wav` / `wrong.wav` |
| 喷射 | `boost.wav` |
| 碰撞 | `impact.wav` |
| 漂移 | `drift.wav` |
| 倒计时 | `countdown.wav` |
| 冲线 | `finish.wav` |
| 对手强化预告 | `telegraph.wav` |

两段 BGM 均为 8.5 秒循环。正式文件转为 44.1 kHz PCM WAV，并进行静音修剪、响度统一和短边界淡化。运行时只请求本地文件，不依赖 CDN 或生成接口。

## 2. 合成音边界

落地音和引擎音继续使用项目合成实现。曾尝试生成对应采样，但服务连续容量限制后没有反复重试。因此不能宣称所有声音均来自 Seed Audio；`public/audio/race-loop.wav` 是较早保留的循环资源，当前双场景逻辑使用 `menu-bgm.wav` 与 `race-bgm.wav`。

## 3. 音频矩阵与事件映射

- UI：选车、开始、暂停、继续、重开和静音。
- 答题：正确、错误、连对能量和路段奖励。
- 车辆：喷射、漂移、路障碰撞、跳台落地、合成引擎。
- 对手：强化前预告。
- 比赛：倒计时、冲线庆祝。
- 音乐：车库轻松循环与比赛高能量循环分离。

`src/game/audio.ts` 使用 `music`、`sfx`、`ui`、`engine` 和 `master` 分组。玩法代码发出事件，音频管理器负责样本与合成回退，不让 UI 各自创建音频对象。

## 4. 循环、解锁与清理

- 第一次选车、拖动或按钮操作后解锁 AudioContext 并启动车库音乐。
- 开赛后交叉切换到比赛音乐；任何时刻只保留一个音乐 voice。
- 暂停挂起、继续恢复；重开和 dispose 停止旧 source。
- 静音作用于 master，而不是只关闭某一个分组。
- 页面失焦按游戏暂停规则处理；失败不能阻塞比赛。

## 5. 高频事件规则

漂移使用实际强度阈值穿越，不用过窄的数值窗口；触发冷却为 2.8 秒。加速、碰撞和对手预告同样按事件播放，不在每一帧重复创建采样。诊断分别记录 `sampleEvents` 和 `fallbackEvents`，避免把“文件加载成功”误写成“声音已播放”。

## 6. 修改后的验收

```bash
npm run test:audio
npm run verify:local -- --full-race
```

检查：真实手势解锁、双 BGM 切换、8.5 秒循环不叠加、答题/碰撞/漂移同步、暂停/重开清理、静音、解码错误和完整比赛事件计数。仅看到 WAV 文件存在不能作为音频验收。
