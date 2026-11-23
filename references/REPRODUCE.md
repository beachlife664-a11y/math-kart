# 全新环境复刻指南

## 1. 前置要求

- Node.js `^20.19.0` 或 `>=22.12.0`；推荐 Node.js 22 LTS。
- npm 10+。
- 使用 Skill 的复制与结构校验脚本需要 Python 3；复制出游戏项目后，仅运行游戏不需要 Python、Blender、Hyper3D、Seed Audio、API Key 或全局 npm 包。
- 仅重新生成缩略图或压缩 GLB 贴图时，才需要 Python 3 与 Pillow。

首次 `npm ci` 需要访问 `https://registry.npmjs.org/`。依赖安装后，页面及所有模型、贴图和音频均从本地加载。

## 2. 一键安装与运行

```bash
git clone https://github.com/beachlife664-a11y/math-kart.git math-kart-skill
python3 math-kart-skill/scripts/create_project.py --destination ./math-kart-project
cd math-kart-project
node scripts/setup.mjs
npm run preview:static
```

打开 `http://127.0.0.1:28474/`。

安装脚本执行顺序：

1. 按 `assets/runtime-manifest.json` 校验 `public/` 中每个文件的字节数与 SHA-256。
2. 用 `npm ci --no-audit --no-fund` 按 lockfile 安装依赖。
3. 执行 Vite 生产构建。
4. 同步最新 `public/` 到 `dist/preview/`，防止运行旧模型副本。

也可以手动执行等价命令：

```bash
npm run verify:assets
npm ci
npm run build
npm run prepare:preview
npm run preview:static
```

自定义监听地址：

```bash
HOST=0.0.0.0 PORT=8080 npm run preview:static
```

## 3. 开发模式

```bash
npm ci
npm run dev -- --host 127.0.0.1 --port 28473
```

普通生产入口不暴露诊断；开发环境及带 `?qa=1` 的生产 URL 才启用测试钩子。不要把 QA URL 当作正式玩家入口发布。

## 4. 完整验证

```bash
node scripts/setup.mjs --with-tests
npm run verify:local
```

验证脚本会构建项目、启动独立 Node 静态服务器，并依次执行：

- 运行资源 SHA-256 校验；
- TypeScript 与 ESLint；
- 11 项玩法、布局和镜头测试，以及 2 项音频/碰撞测试；
- P1 真实答题拉开、P2 追赶后的分屏与合并镜头；
- Chromium、Firefox、WebKit；
- 普通玩家入口与无 QA 暴露检查；
- 桌面/手机实际画布截图、像素和渲染预算；
- 证据清单完整性。

额外完整两圈录像：

```bash
npm run verify:local -- --full-race
```

默认使用 28474 端口。已有服务时可执行：

```bash
PORT=28476 npm run verify:local -- --full-race
```

## 5. 静态部署

`npm run build && npm run prepare:preview` 后，将 **`dist/preview/` 内全部内容**上传到静态网站根目录。不要只上传 `index.html` 或 JS/CSS，否则模型、音频和贴图会缺失。

普通静态托管不需要 Node 服务器；任意支持静态文件的 HTTP 服务均可。直接双击 `index.html` 使用 `file://` 不属于支持范围，因为浏览器会限制模型和音频请求。

## 6. 资源修改后的同步规则

修改 `public/` 后必须重新执行：

```bash
node scripts/hash-assets.mjs
npm run verify:assets
npm run prepare:preview
```

只运行 `npm run build` 不会刷新预览目录内的模型副本，这是本项目的明确防旧资源规则。

## 7. 常见问题

### `Node.js ... is required`

安装符合版本的 Node.js 后重新打开终端，再运行 `node -v` 检查。

### 端口被占用

```bash
PORT=28476 npm run preview:static
```

测试则使用 `PORT=28476 npm run verify:local`。

### Playwright 找不到浏览器

```bash
npx playwright install --no-shell chromium firefox webkit
```

Linux CI 或最小系统可增加 `--with-deps`。

### 资源哈希不匹配

不要通过重新生成哈希清单掩盖缺失或损坏。先恢复仓库中的对应文件；只有有意修改资源后才运行 `hash-assets.mjs`。

### 想重新生成 Hyper3D 或音频

这不是运行游戏的必要步骤。按 [ASSET_PIPELINE.md](ASSET_PIPELINE.md)、[AUDIO_PIPELINE.md](AUDIO_PIPELINE.md) 和游戏项目中的 `assets/generation-log.json` 进行再创作，并自行提供服务账号与授权。新结果不能替代当前已验证资源而不重新验收。
