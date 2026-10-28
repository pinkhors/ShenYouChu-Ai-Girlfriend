# AGENTS.md

本文件是本仓库的协作规则，面向所有自动化代理与贡献者。规则优先于个人习惯；与 `docs/03-development-standards.md` 冲突时以本文为准。

## 编码与文件

- **所有 Markdown（`*.md`）必须使用 UTF-8 编码写入**，便于直接阅读；禁止 GBK/ANSI/GB18030。
- 写 `.md` 优先使用文件工具（write/edit），不要用 PowerShell `Set-Content`/`Out-File` 的默认编码批量重写整篇文档，避免引入 BOM 或整文件换行 churn。
- 仓库换行规范见 `.gitattributes`：源码 LF；`*.ps1` / `*.cmd` / `*.bat` 保持 CRLF。
- Windows PowerShell 5.1 按系统 ANSI 读取脚本：`.ps1` 内容保持 ASCII，或存为带 BOM 的 UTF-8；中文一律用 `[char]` 码点构造。
- 二进制文件（jar、图片、docx）不做编码转换。

## 工作区边界

- 只操作 `D:\XiaoChenProject\ShenYouChu-Ai-Girlfriend` 内的文件；不修改工作区外的任何路径。
- 前端依赖（`package.json`、锁文件、`node_modules`、包管理器缓存）只允许出现在 `apps/desktop`（或未来 `apps/*`）内，仓库根禁止创建。
- 后端代码在 `services/core`，由根 `pom.xml` 聚合；跨前后端的脚本放 `scripts/`。

## 提交与验证

- 所有变更提交到本地 Git；提交信息格式 `type(scope): summary`。
- 后端改动必须通过 `mvn -DskipTests package`，并尽量运行纯逻辑测试（Mockito 测试在受限沙箱会因管道限制失败，本机可运行）。
- 前端改动必须通过 `apps/desktop` 下 `tsc --noEmit`。
- 文档改动不得省略对应规范/契约文件的同步更新。

## 沙箱已知限制（不要浪费轮次重试）

- 禁止创建 `remote-https` 管道 → `git push` 必须由用户在本机执行。
- 禁止子进程管道 → esbuild/electron-vite 构建、Mockito 初始化、Electron 启动在本环境不可用。
- Docker 管道被拒绝 → 容器的启停由用户执行；后端可用 `java -jar` 作为后台作业常驻。