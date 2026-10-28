# 沈幼楚桌面客户端（apps/desktop）

Electron + React + TypeScript 桌面客户端。当前为 **M1：登录、会话增删查、会话内消息与 SSE 流式回复、记忆列表、活动记录**，语音、视觉、Live2D 仅保留挂载点与 TODO 注释。

## 前置条件

后端必须先启动并监听 **48080**（`services/core`，`SERVER_PORT` 默认 48080，接口前缀 `/api/v1`）：

```bash
# 在仓库根启动依赖基础设施与后端（见根 README 与 docker-compose.yaml）
curl http://127.0.0.1:48080/api/v1/auth/me   # 返回 401 即表示服务已在运行
```

Node.js 20+ 与 npm。前端依赖只安装在 `apps/desktop/node_modules`，与后端 `services/core` 完全独立；**依赖、锁文件与包管理器缓存只允许在 `apps/desktop` 内创建，不要在仓库根生成 `package.json`、`node_modules`、pnpm/npm 缓存或锁文件**。

## 安装与运行

```bash
cd apps/desktop

# 1) 安装依赖（只装一次，只影响 apps/desktop/node_modules）
npm install

# 2) 开发模式（热更新，自动拉起 Electron）
npm run dev

# 3) 类型检查（严格模式，noUnusedLocals/noUnusedParameters 已开启）
npm run typecheck

# 4) 生产构建（产物在 apps/desktop/out/{main,preload,renderer}）
npm run build
```

> npm 默认执行依赖的 postinstall。若 Electron 二进制下载失败，设置 `ELECTRON_MIRROR` 后重新执行 `npm install`。

## 后端地址配置（VITE_API_BASE_URL）

渲染进程按以下优先级解析后端地址（见 `src/renderer/src/api/client.ts`）：

1. `import.meta.env.VITE_API_BASE_URL`（Vite 环境变量，构建期注入）；
2. 预加载脚本读取的 `process.env.VITE_API_BASE_URL`（启动进程时的环境变量，经 `window.desktop.apiBaseUrl` 暴露）；
3. 默认值 `http://127.0.0.1:48080`（仅开发用）。

因此指向其它后端最简单的方式是在启动前导出变量，无需改代码、无需 `.env` 文件：

```bash
# Windows PowerShell
$env:VITE_API_BASE_URL = "http://192.168.1.10:48080"; npm run dev

# bash
VITE_API_BASE_URL=http://192.168.1.10:48080 npm run dev
```

也可以写入 `apps/desktop/.env.local`（`VITE_API_BASE_URL=...`）。electron-vite 把渲染进程的 `envDir` 默认设为**项目根目录**，即与 `electron.vite.config.ts` 同级，因此 `.env*` 应放在 `apps/desktop/` 下；只有 `VITE_` / `RENDERER_VITE_` 前缀的变量会暴露给渲染进程。注意 `.env` 文件只作用于渲染进程的 `import.meta.env`，预加载脚本读的是真实进程环境变量，所以上面的方式 2 仅对进程环境变量生效。

当前生效的后端地址会显示在界面顶栏，便于排障。

## 前端纯逻辑测试

不需要 Electron 或 esbuild，直接用 TypeScript 编译器 + Node 内置测试运行器：

```cmd
cd apps\desktop
npm test
```

覆盖内容（18 个用例）：

- SSE 帧解析（`event:` / `data:` 多行、无 data 帧、JSON 字段提取、非法 JSON 容错）；
- 流式拼帧（一帧跨多次 push、一次 push 多帧、结尾残留半帧、未知事件忽略）；
- UTF-8 Base64 编解码（中文、emoji、空串，与 Node `Buffer` 结果对齐）；
- token 存储（读写往返、损坏 JSON、结构不符、清空、存储被禁用时降级为未登录）。

原理：`tsc -p tsconfig.test.json` 编译到 `out-tsc/`，脚本在其中写入 `{"type":"commonjs"}`
标记（因为包本身是 `"type": "module"`），再用 `node --test` 运行。因此这些测试在受限环境
（无法运行 Electron/构建脚本）下也能执行。

## 目录结构

```text
apps/desktop/
├── electron.vite.config.ts      # main / preload / renderer 三段构建配置
├── tsconfig.json                # 全量严格检查（含 main、preload、renderer、构建配置）
├── tsconfig.node.json           # Node 侧窄口径检查（无 DOM 类型）
└── src/
    ├── main/index.ts            # 主进程：BrowserWindow 与生命周期
    ├── preload/index.ts         # contextBridge 只暴露 { platform, apiBaseUrl }
    └── renderer/
        ├── index.html
        └── src/
            ├── main.tsx         # 渲染进程入口
            ├── App.tsx          # 登录/注册 + 会话列表（全部中文文案）
            ├── env.d.ts         # vite/client 与 window.desktop 类型声明
            ├── styles.css       # 深色基础样式（无外部字体/图片）
            ├── api/client.ts    # REST 封装与类型定义
            └── auth/tokenStore.ts
```

## 关键设计选择

- **安全基线**：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`；预加载只暴露 `platform` 与 `apiBaseUrl`，不暴露任何密钥、令牌读写或通用 IPC。
- **预加载用 CJS**：`package.json` 为 `"type": "module"`，而 Electron 在 `sandbox: true` 下不支持 ESM 预加载脚本，因此 `electron.vite.config.ts` 显式把 preload 构建为 `out/preload/index.cjs`（主进程按该文件名加载）。
- **主进程路径用 `app.getAppPath()`**：主进程产物是 ESM，没有 `__dirname`，所以 preload 与生产 `index.html` 都基于 `app.getAppPath()` 解析。
- **凭证存储**：M0 用 `localStorage`（可刷新恢复、零 IPC），后续改为主进程 `safeStorage`；`tokenStore` 的 get/set/clear 签名保持不变即可平滑迁移。
- **接口对齐现有后端**：按 `services/core` 的实际实现对接（`/api/v1` 前缀；消息列表已按 cursor 分页，会话列表当前仍返回数组；错误体为 `{ code, message, requestId }`）。
- **不设置 renderer `base`**：electron-vite 在生产构建时会自动把渲染进程 `base` 置为 `'./'`，使 `file://` 下的资源相对路径可用；显式覆盖反而会触发告警。
- **不引入** UI 库、状态库、路由库；不使用 `any`，不安全处用 `unknown` 收窄；所有事件处理器显式标注类型。

## 遗留项

- TODO(M2 视觉)、TODO(M3 Live2D)：仅注释占位，未实现；语音为 M2 占位链路（文本 Base64 → ASR → 轮次 → TTS），真实模型接入见 docs/05；
- TODO(M3 安全存储)：`tokenStore` 迁移到 `safeStorage` + 受限 IPC；
- 生产构建后按需补严格 CSP（`index.html` 现无 CSP meta，因为开发期 React Refresh 需要内联脚本）；
- 会话列表接口目前返回数组、契约文档 3.2 写的是 cursor 分页（消息列表已按 cursor 分页实现），需后端或文档择一收敛；

## 本机联调步骤与故障排查

```cmd
:: 1) 后端必须在运行（默认 48080）
curl http://127.0.0.1:48080/actuator/health

:: 2) 安装依赖（Electron 二进制较大，国内建议先设镜像）
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npm install
npm run typecheck
npm run build
npm run dev
```

常见问题：

| 现象 | 原因 | 处理 |
|---|---|---|
| `npm install` 在 electron 处 `ECONNRESET` | Electron 二进制默认从 GitHub 下载 | 设置 `ELECTRON_MIRROR` 后重装 |
| `electron-vite` / `tsc` 不是内部或外部命令 | 依赖未装完（安装中断） | 删除 `apps/desktop/node_modules` 后重新 `npm install` |
| 界面提示登录状态失效 | 后端 401（token 过期或后端重启） | 重新登录；后端重启不会清库，用户仍在 |
| 消息不流式、直接整段出现 | 用了 `/turns` 而非 `/turns/stream`，或代理缓冲 SSE | 确认前端走 `streamTurn`，代理需关闭缓冲 |
| 中文回复乱码 | 终端编码非 UTF-8 | 后端已强制 UTF-8；终端执行 `chcp 65001` |

说明：桌面端只依赖 `/api/v1` 接口，不直接访问数据库；后端地址可用 `VITE_API_BASE_URL` 覆盖。
