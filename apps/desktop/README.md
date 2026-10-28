# 沈幼楚桌面客户端（apps/desktop）

Electron + React + TypeScript 桌面客户端。当前为 **M1：登录、会话增删查、会话内消息与 SSE 流式回复、记忆列表、活动记录、每账号 LLM 配置**，语音、视觉、Live2D 仅保留挂载点与 TODO 注释。

界面已改为**微信式三栏布局**（左侧导航 / 会话列表 / 主内容区），并在「形象」页提供两条路线：

- **立绘（优先）**：导入外部 AI 生成的半身像与表情差分（基础 / 开心 / 难过 / 生气 / 惊讶 / 闭眼 / 说话），也可以直接在页面里用 ComfyUI 或云 API 生成；导入后头像、会话列表、聊天与通话页统一使用；缺图时自动回退基础表情或矢量形象。
- **捏脸（备用）**：肤色、脸型、发型发色、五官、妆容与穿搭可调，带 4 套预设与随机/恢复默认。

聊天页顶部的「通话」进入通话页：参考豆包式布局——柔和渐变背景、圆形形象、顶部「••• / 语音通话·计时 / 字」、中间状态与字幕、底部麦克风/摄像头/挂断；表情与动作收进「•••」面板。输入文字或点麦克风说话（设置里配置 ASR 后）后，她回复并朗读——配置云端 TTS 时用真实音频驱动口型，否则回退系统语音按节奏开合。

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

覆盖内容（58 个用例）：

- SSE 帧解析（`event:` / `data:` 多行、无 data 帧、JSON 字段提取、非法 JSON 容错）；
- 流式拼帧（一帧跨多次 push、一次 push 多帧、结尾残留半帧、未知事件忽略）；
- UTF-8 Base64 编解码（中文、emoji、空串，与 Node `Buffer` 结果对齐）；
- token 存储（读写往返、损坏 JSON、结构不符、清空、存储被禁用时降级为未登录）；
- 形象参数（脏数据归一化与数值夹取、预设合法性、可复现随机、按用户隔离的本地存储、损坏数据降级）；
- 立绘表情（请求表情 → 基础 → 任意图的回退顺序、空集、心情映射、槽位唯一性）；
- 形象来源（加载中优先、任一立绘存在即选立绘、空集回退矢量）。
- 出图配置与提示词（脏配置归一化、数值夹取、表情提示词拼接、整组生成顺序）；
- 出图请求校验（只允许 http/https、提示词必填、尺寸/步数/CFG/seed 夹取）；
- 出图适配器（用本地 HTTP 服务模拟 OpenAI b64 与 ComfyUI 提交/轮询/取图）；
- 语音：TTS/ASR 参数校验、`/audio/speech` 与 `/audio/transcriptions` 的 multipart 请求、语音配置归一化。

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
            ├── SettingsPanel.tsx     # 设置页（账户/形象/连接/模型/语音/危险操作）
            ├── LlmSettingsCard.tsx   # 设置页「模型（LLM）」卡片
            ├── avatar/               # 捏脸：参数模型、SVG 渲染、编辑器、本地存储
            ├── portrait/             # 立绘：表情模型、导入压缩、抠图、IndexedDB、出图、通话页
            ├── voice/                # TTS/ASR 配置、系统语音、音频 analyser、录音
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

## 模型（LLM）配置（每账号独立）

设置页「模型（LLM）」卡片用于给当前账号配置 OpenAI 兼容的聊天服务。配置存在后端，换设备登录同一账号仍生效；没有保存自己的配置时回退服务端环境变量，再回退确定性占位回复。

- **字段**：启用开关、Base URL（含 `/v1`）、模型、API Key、Max tokens（1–4096）、Temperature（0–2）、超时秒数（1–120）。
- **Key**：密码框只写不读；已保存时占位提示「已保存，留空不修改」，留空保存会保留原 Key。后端只返回 `hasApiKey`，任何接口都不回显明文。
- **来源徽标**：「用户配置」表示使用本账号保存的配置；「服务端默认」表示没有保存自己的配置、正在用服务端 `LLM_*` 环境变量；「未配置」表示没有可用的用户配置或环境变量，走确定性占位回复。旁边的「Key 已保存」只表示后端存了 Key。
- **保存与生效**：点「保存」后从下一条消息生效，不需要重启后端；启用时必须填 Base URL 与模型。
- **测试连接**：**使用已保存的配置**，不是输入框里尚未保存的值；改完参数先保存再测试。成功显示耗时与模型名，失败显示后端返回的截断原因。
- **恢复服务端默认**：删除本账号保存的配置与 Key，回退到服务端环境变量/占位回复；若服务端环境变量本身配置了 Key，重置后仍会显示「Key 已保存」；操作前会二次确认。
- **安全**：Key 存在服务端 MySQL（当前明文，仅服务端可读，接口不回显），不写入本机 `localStorage`；共用后端时仍应注意数据库备份与访问权限。

示例：DeepSeek 填 `https://api.deepseek.com/v1` + `deepseek-chat`；DashScope 填 `https://dashscope.aliyuncs.com/compatible-mode/v1` + `qwen-plus`。

> 服务端默认（`ENV`）的 Key 不会复制到用户配置。卡片处于「服务端默认」且已有 Key 时，若想改成用户配置，需要填自己的 Key；只想继续用服务端默认则不要保存。后端在“首次保存 + 启用 + 留空 Key + ENV 带 Key”时也会返回 400，不只是前端拦截。

> Base URL 由用户填写，服务端只校验 http/https、主机名与无 query/fragment；自用/小范围可接受，公开多租户部署前应增加私网/云元数据地址拦截与出站代理，避免 SSRF。

## 立绘与通话（本机）

- **导入**：`portrait/` 下管理表情槽位（基础 / 开心 / 难过 / 生气 / 惊讶 / 闭眼 / 说话），图片导入时压到长边 1400px 的 WebP，存 IndexedDB（key = userId），不新增后端接口。
- **AI 出图（可选）**：形象页「AI 生成」面板支持 ComfyUI（本地 `/prompt` + `/history` + `/view`，需要 checkpoint）和 OpenAI 兼容的 `images/generations`（地址含 `/v1`、模型、Key）。请求走主进程 IPC，避开渲染进程 CORS；整组表情逐张生成并写入槽位，可中途停止。
- **展示优先级**：有立绘则头像、会话列表、聊天、通话页统一用图；缺某个表情时按“请求表情 → 基础 → 任意图 → 矢量形象”回退。
- **聊天页**：粉色陪伴主题，顶部大面积人物；「形象 → 聊天页人物 → 抠出人物」会把基础立绘去背景（边缘漫水填充 + 裁剪），聊天页优先使用这张抠图，其次基础立绘，最后矢量形象。
- **通话页**：豆包式浅色布局；圆形形象会随心情/表情切换，有闭眼图自动眨眼，说话时呼吸/口型；表情与动作收进「•••」面板；点麦克风录音、再点发送。摄像头/视频按钮目前是置灰占位。
- **语音（可选）**：设置页「语音」卡片可把 TTS 切到 OpenAI 兼容 `/audio/speech`（地址含 `/v1`、模型、音色、Key）；返回的音频用 `AnalyserNode` 取音量包络驱动口型，失败时自动回退系统语音。
- **点麦克风说话（可选）**：ASR 走 OpenAI 兼容 `/audio/transcriptions`（默认 `whisper-1`）；填了识别地址后点麦克风开始录音，再点一次识别并自动发送。不配置时点麦克风会提示并切到文字输入，不会请求麦克风。录音会上传到配置的服务。
- **清理**：设置页「清除形象」会同时清空立绘与捏脸参数；删除账号时一并清理。

> 限制：没有配置 ASR 时通话是“文字输入 + 语音输出”；摄像头/视频按钮只是占位，没有接入；口型在云端 TTS 下由音频驱动，系统语音下只是节奏驱动，不是音素级 viseme；密钥以明文存本机，仅适合自用/小圈子。

### 通话形象：加载、切换与回退

**数据源**

- 用户立绘：IndexedDB `shenyouchu-portraits`，key 为当前 `userId`，最多 7 个表情槽位；
- 矢量形象：localStorage `shenyouchu.avatar.v1.<userId>`；
- 本期“模型”指立绘图片，不是 3D/VRM；3D 未纳入。

**触发条件**

| 场景 | 行为 |
|---|---|
| 登录 / 切换账号 | 先清空上一位用户的立绘状态，再异步加载当前用户的；加载期间通话显示渐变占位 |
| 导入 / AI 生成 | 写入槽位并持久化后立即更新状态；通话若已打开会随 props 即时更新 |
| 打开通话 | 只读当前已加载状态，不额外请求网络 |
| 表情切换 / 眨眼 / 说话 | 请求表情 → 基础表情 → 任意已导入图 |
| 清除形象 / 删除账号 | 清空立绘与矢量；通话回退默认 |
| 单张图解码失败 | `AvatarPortrait` 捕获 `onError` 回退矢量，不阻塞通话 |

**优先级**

1. 加载中：渐变占位，不闪默认形象；
2. 用户立绘（按上面的表情回退链）；
3. 用户自定义矢量 `AvatarConfig`；
4. 默认矢量 `DEFAULT_AVATAR`。

**隔离与失败**

- 按 `userId` 隔离；未登录不能进通话，因此不会串用上一位用户的形象；
- IndexedDB 不可用、记录损坏或为空 → 视为没有立绘，直接回退矢量；
- 单张图片损坏只影响该表情，其余表情仍可用。

**完成判定**

- [ ] 新用户没有立绘时，通话显示默认矢量形象；
- [ ] 只导入基础图时，通话所有表情都用这张图；
- [ ] 导入多张表情后，开心/难过/闭眼/说话按槽位切换，缺失时回退基础；
- [ ] AI 生成整组后自动保存，并在通话中使用；
- [ ] 清除形象后，通话立即/重开后回退默认；
- [ ] 损坏图片或 IndexedDB 异常时不白屏、不崩溃，回退矢量；
- [ ] 两个账号互相看不到对方立绘；
- [ ] `tsc --noEmit` 与 `npm test` 通过，通话圆形形象比例目测正常。

### 出图配置示例

ComfyUI（本地）：

1. 启动 ComfyUI，默认 `http://127.0.0.1:8188`；
2. 确认 `models/checkpoints` 里有 SDXL checkpoint（例如 `sd_xl_base_1.0.safetensors`）；
3. 形象页 → 「AI 生成」→ 服务选 ComfyUI → 填地址与 checkpoint → 生成。

云 API（OpenAI 兼容）：

- 地址填到 `/v1` 为止，例如 `https://api.openai.com/v1`；
- 模型填供应商的图片模型名（`gpt-image-1` 用 `1024x1536`，其它模型按供应商要求调整尺寸）；
- Key 只存本机 localStorage；共用电脑时注意。

### 语音配置示例

云端 TTS（OpenAI 兼容）：

- 设置 → 语音 → 朗读方式选「云端 TTS」；
- 地址填到 `/v1`（例如 `https://api.openai.com/v1`），模型 `tts-1`，音色 `nova`；
- 填 Key 后，通话页的朗读会返回音频并用它驱动口型。

云端 ASR：

- 同一张卡片填「识别服务地址」（含 `/v1`）和模型（默认 `whisper-1`）；
- 保存后通话页点麦克风开始录音，再点一次识别并自动发送；录音以 webm/opus 上传；
- 不填地址则完全不请求麦克风。

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
- **出图走主进程**：preload 只暴露 `imagegen.generate` 一个通道，ComfyUI / 云 API 的请求与 Key 使用都在主进程完成；渲染层不直接跨域，也不把出图地址暴露给页面网络层。

## 遗留项

- **AI 出图是“能调通、待实测”**：ComfyUI 用固定 SDXL 基础工作流（不支持 LoRA/ControlNet），云 API 的参数/尺寸兼容性因供应商而异；没有真实服务时无法端到端验证；
- **语音是“可选、待实测”**：云端 TTS/ASR 需要自己填服务，未对真实供应商验证；系统语音拿不到音频，口型只能节奏驱动；音素级 viseme 未接；录音会把音频上传到配置的 ASR 服务；
- **密钥安全**：出图 / TTS / ASR 的 Key 都明文存 `localStorage`，只适合自用/小圈子；后续应迁到主进程 `safeStorage`；LLM 的 Key 存在服务端 MySQL（当前明文、接口不回显），不在本机保存；
- **不接微信/QQ**：个人微信与 QQ 没有官方聊天/通话 API，非官方 hook 违反平台协议；若要“在微信里用”，需走微信小程序路线（本期未做）；
- TODO(M2 视觉)、TODO(M3 Live2D)：仅注释占位，未实现；后端语音仍为 M2 占位链路（文本 Base64 → ASR → 轮次 → TTS），真实模型接入见 docs/05；
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
