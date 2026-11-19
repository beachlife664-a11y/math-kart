# 资源与生成记录

- `concepts/`：用户确认过的玩具山体参考图。
- `models/`：海岸坡崖原模及桌面/手机变体。
- `audio/seed/`：11 个 Seed Audio 原始 WAV 母带。
- `generation-log.json`：从实际制作过程清洗出的图像、Hyper3D 和音频提示词/参数；含成功、重试和否决迭代，不含 URL、密钥或本机路径。
- `runtime-manifest.json`：全部 `public/` 运行文件的字节数与 SHA-256，由 `node scripts/hash-assets.mjs` 生成。

精确复刻使用 `public/` 和这里的既有文件，不需要重新调用生成服务。
