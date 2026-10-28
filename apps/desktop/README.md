# 沈幼楚桌面客户端（apps/desktop）

Electron + React + TypeScript 桌面客户端。当前为 **M1：登录、会话增删查、会话内消息与 SSE 流式回复、记忆列表、活动记录**，语音、视觉、Live2D 仅保留挂载点与 TODO 注释。

界面已改为**微信式三栏布局**（左侧导航 / 会话列表 / 主内容区），并在「形象」页提供两条路线：

- **立绘（优先）**：导入外部 AI 生成的半身像与表情差分（基础 / 开心 / 难过 / 生气 / 惊讶 / 闭眼 / 说话），导入后头像、会话列表、聊天与通话页统一使用；缺图时自动回退基础表情或矢量形象。
- **捏脸（备用）**：肤色、脸型、发型发色、五官、妆容与穿搭可调，带 4 套预设与随机/恢复默认。

聊天页顶部的「通话」进入通话页：大图立绘、表情手动切换、有闭眼图时自动眨眼、呼吸感动画。语音链路仍是 M2 占位，这一版先验证“形象在通话中的表现”。

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

覆盖内容（33 个用例）：

- SSE 帧解析（`event:` / `data:` 多行、无 data 帧、JSON 字段提取、非法 JSON 容错）；
- 流式拼帧（一帧跨多次 push、一次 push 多帧、结尾残留半帧、未知事件忽略）；
- UTF-8 Base64 编解码（中文、emoji、空串，与 Node `Buffer` 结果对齐）；
- token 存储（读写往返、损坏 JSON、结构不符、清空、存储被禁用时降级为未登录）；
- 形象参数（脏数据归一化与数值夹取、预设合法性、可复现随机、按用户隔离的本地存储、损坏数据降级）；
- 立绘表情（请求表情 → 基础 → 任意图的回退顺序、空集、心情映射、槽位唯一性）。

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
            ├── main.tsx              # 渲染进程入口
            ├── App.tsx               # 登录/注册 + 微信式工作区与路由
            ├── ConversationSidebar.tsx  # 会话列表（搜索/新建/删除）
            ├── ChatView.tsx          # 会话详情：历史消息、SSE 流式、语音占位、通话入口
            ├── LookPage.tsx          # 形象页：立绘 / 捏脸两个 tab
            ├── MemoryPanel.tsx       # 记忆页
            ├── ActivityPanel.tsx     # 活动记录页
            ├── SettingsPanel.tsx     # 设置页（账户/形象/连接/危险操作）
            ├── avatar/               # 捏脸：参数模型、SVG 渲染、编辑器、本地存储
            ├── portrait/             # 立绘：表情模型、导入压缩、IndexedDB、通话页
            ├── ui/                   # 内联图标与时间格式
            ├── api/client.ts         # REST 封装与类型定义
            ├── env.d.ts              # vite/client 与 window.desktop 类型声明
            └── styles.css            # 微信式浅色主题（无外部字体/图片）
```

## 界面与捏脸（本机）

- **布局**：左侧深色导航栏（聊天 / 形象 / 记忆 / 活动 / 设置）→ 会话列表 → 主内容区；窄窗口下隐藏右侧关系胶囊，编辑页改为单列。
- **捏脸**：`avatar/avatarConfig.ts` 定义 13 个参数（枚举 + 0..1 连续值），`GirlfriendAvatar` 用分层 SVG 渲染半写实预览；`AvatarEditor` 提供色板、滑杆、分段选择、4 套预设、随机与恢复默认。
- **持久化**：按用户写入 `localStorage`（key `shenyouchu.avatar.v1.<userId>`），不新增后端接口；换设备不同步，删除账号时同步清除本机形象。
- **可替换渲染**：编辑器只依赖 `AvatarConfig`；接入生成式写实渲染（本地 SD/ComfyUI 或商用数字人）时替换 `GirlfriendAvatar`，参数与存储不变。

## 立绘与通话（本机）

- **导入**：`portrait/` 下管理表情槽位（基础 / 开心 / 难过 / 生气 / 惊讶 / 闭眼 / 说话），图片导入时压到长边 1400px 的 WebP，存 IndexedDB（key = userId），不新增后端接口。
- **展示优先级**：有立绘则头像、会话列表、聊天、通话页统一用图；缺某个表情时按“请求表情 → 基础 → 任意图 → 矢量形象”回退。
- **通话页**：聊天头部「通话」进入；支持手动表情、闭眼图自动眨眼、呼吸感动画与通话计时；语音/TTS 仍未接入，是形象演示。
- **清理**：设置页「清除形象」会同时清空立绘与捏脸参数；删除账号时一并清理。

> 说明：这里的“半写实”目前是矢量预览或外部导入的 AI 图，不是真人级生成；照片/视频克隆真人形象涉及肖像权与深度合成标识，未纳入本期。

### 立绘素材建议

- 尺寸：竖版 3:4，长边 ≥ 1200px；导入时会压到 1400px 的 WebP，单张上限 12MB；
- 构图：正面或微侧半身，头肩完整，手不要入镜（后续做动作会穿帮）；
- 背景：透明或纯色，避免复杂场景；
- 一致性：先用同一 seed / 参考图（IP-Adapter、InstantID）生成基础图，再只改表情做 img2img 或局部重绘；表情差分的提示词只替换表情词，其他描述保持不变；
- 示例提示词（中文工具可直接用）：

```text
半写实风格，25 岁亚洲女性，温柔小傲娇，长直黑发，琥珀色眼睛，
米白色针织衫，正面半身像，柔和室内光，浅灰纯色背景，细腻皮肤质感，
同一角色，同一构图，表情：【微笑 / 低落 / 生气 / 惊讶 / 闭眼 / 张嘴说话】
```

- 商用注意：Flux dev 为非商用许可，商用请换 SDXL 或可商用模型；不要用真人明星/他人照片做参考。


## 关键设计选择

- **安全基线**：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`；预加载只暴露 `platform` 与 `apiBaseUrl`，不暴露任何密钥、令牌读写或通用 IPC。
- **预加载用 CJS**：`package.json` 为 `"type": "module"`，而 Electron 在 `sandbox: true` 下不支持 ESM 预加载脚本，因此 `electron.vite.config.ts` 显式把 preload 构建为 `out/preload/index.cjs`（主进程按该文件名加载）。
- **主进程路径用 `app.getAppPath()`**：主进程产物是 ESM，没有 `__dirname`，所以 preload 与生产 `index.html` 都基于 `app.getAppPath()` 解析。
- **凭证存储**：M0 用 `localStorage`（可刷新恢复、零 IPC），后续改为主进程 `safeStorage`；`tokenStore` 的 get/set/clear 签名保持不变即可平滑迁移。
- **接口对齐现有后端**：按 `services/core` 的实际实现对接（`/api/v1` 前缀；会话与消息列表均已按 cursor 分页，信封为 `{ items, nextCursor }`；错误体为 `{ code, message, requestId }`）。
- **不设置 renderer `base`**：electron-vite 在生产构建时会自动把渲染进程 `base` 置为 `'./'`，使 `file://` 下的资源相对路径可用；显式覆盖反而会触发告警。
- **不引入** UI 库、状态库、路由库；不使用 `any`，不安全处用 `unknown` 收窄；所有事件处理器显式标注类型。

## 遗留项

- **AI 出图未接入**：本期只做“导入现成图”，ComfyUI / 云 API 的生成入口留到下一步；导入图即最终展示图；
- **通话页只有形象演示**：没有音频、TTS 与逐字口型；“说一句”只是切换说话表情，接真实语音后把 TTS 与 viseme 接到同一状态机；
- **不接微信/QQ**：个人微信与 QQ 没有官方聊天/通话 API，非官方 hook 违反平台协议；若要“在微信里用”，需走微信小程序路线（本期未做）；
- TODO(M2 视觉)、TODO(M3 Live2D)：仅注释占位，未实现；语音为 M2 占位链路（文本 Base64 → ASR → 轮次 → TTS），真实模型接入见 docs/05；
- TODO(M3 安全存储)：`tokenStore` 迁移到 `safeStorage` + 受限 IPC；
- 生产构建后按需补严格 CSP（`index.html` 现无 CSP meta，因为开发期 React Refresh 需要内联脚本）；
- 形象参数与立绘都只在本机保存，多端同步需要后端新增 profile 表与对象存储接口；

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
