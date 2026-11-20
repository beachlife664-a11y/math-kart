# 资源与生成记录

- `audio/seed/`：11 个 Seed Audio 原始 WAV 母带。
- `generation-log.json`：从实际制作过程清洗出的图像、Hyper3D 和音频提示词/参数；含成功、重试和否决迭代，不含 URL、密钥或本机路径。
- `runtime-manifest.json`：全部 `public/` 运行文件的字节数与 SHA-256，由 `node scripts/hash-assets.mjs` 生成。

## 本机原始资料

`concepts/` 和 `models/` 保存用户确认过的山体参考图、海岸坡崖原模及 LOD 中间版本。这些文件只用于美术再加工，不是运行依赖，已被 `.gitignore` 排除并保留在制作者本机。

精确复刻只需要 `public/` 中的正式运行资源和本目录保留的清单，不需要重新调用生成服务，也不需要下载原始建模中间稿。
