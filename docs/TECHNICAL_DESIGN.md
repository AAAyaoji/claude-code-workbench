# Claude Code Workbench — 技术设计文档

> 本文档是项目的技术依据。切换对话、继续开发或排查问题时,以此为准,避免反复变更技术栈。
> 最后更新:2026-10-21

## 1. 项目概述

**Claude Code Workbench** 是一个 Windows 桌面应用,以现有的 Claude Code CLI 为核心,提供现代化、可视化的本地开发工作台。它不是新的 AI 模型,也不重新实现 Claude Code,而是复用现有的 CLI、登录状态、权限配置与运行环境,把命令行操作封装为图形界面。

核心能力(按优先级):
1. 启动 Claude Code、双向流式交互、会话管理与任务中断
2. 本地多项目管理(文件系统 + Git 状态)
3. Skills / MCP 的统一管理入口

## 2. 目标、非目标与反目标

**目标**
- 用图形界面完成日常 Claude Code 开发工作,不再完全依赖 Git Bash
- 管理本地多个项目,并为每个项目保留独立的会话上下文
- 提供 Skills / MCP 的可视化管理

**非目标(本阶段不做)**
- 不重新实现 AI 模型或 Claude Code 本身
- 不覆盖或破坏现有 `~/.claude` 配置、登录状态与权限设置

**反目标(即使技术可行也不做)**
- 不把 API Key / 登录凭证写入普通日志、前端代码或本地数据库
- 不让渲染进程任意访问文件系统或执行命令(所有敏感操作走主进程 + 白名单 IPC)
- 不做「嵌入一个终端窗口」式的伪集成

## 3. 已确认技术栈

| 层 | 选型 | 理由 |
|----|------|------|
| 桌面框架 | **Electron** | 环境现成(Node v24 已装),主进程可直接 spawn Claude CLI 子进程并解析 stream-json 双向流 |
| 前端 | **React + TypeScript** | 生态成熟、类型安全 |
| 本地数据 | **node:sqlite**(Node 24 内置) | 同步、嵌入式 SQLite,零原生依赖、零 ABI 问题(替代 better-sqlite3,理由见「约束与风险」) |
| UI 交互原语 | **Radix UI** | 无样式无障碍原语,行为稳定,视觉层自建不受上游绑架 |
| 视觉设计系统 | **自建 CSS variables design tokens** | 完全掌控视觉,主题切换成本最低 |
| 组件样式 | **CSS Modules** | 作用域隔离、零额外依赖 |
| 主题 | **深色为初始主题**,预留浅色 | 通过 tokens 切换 |
| 构建 | **electron-vite** | 统一构建主进程/preload/渲染进程 |

**明确不使用**:Tailwind、Ant Design/MUI 等模板化组件库、Rust/Tauri(环境无 Rust 工具链)。

## 4. 架构与进程模型

采用 Electron 三进程模型,严格隔离:

```
┌─────────────────────────────────────────────┐
│  Main Process (Node)                         │
│  - 窗口生命周期、应用退出清理                  │
│  - spawn 管理 Claude Code CLI 子进程          │
│  - 文件系统 / Git / SQLite 访问               │
│  - ipcMain.handle 处理所有敏感操作            │
└──────────────▲──────────────────────────────┘
               │ IPC (invoke / handle, 白名单)
┌──────────────┴──────────────────────────────┐
│  Preload (contextBridge)                     │
│  - 仅暴露经过封装的 window.api 白名单接口      │
└──────────────▲──────────────────────────────┘
               │ window.api.*
┌──────────────┴──────────────────────────────┐
│  Renderer (React, 沙箱内)                    │
│  - 无 Node 能力、无直接文件系统访问            │
│  - 只通过 window.api 调用主进程能力           │
└─────────────────────────────────────────────┘
```

**安全模型**
- `contextIsolation: true`、`nodeIntegration: false`
- preload 用 `contextBridge` 只暴露白名单 API,渲染进程无法访问 `ipcRenderer`、`require` 或 Node 内置模块
- 主进程对每个 IPC 入参做校验,不信任渲染进程传值
- 敏感信息(API token)只存在于 `~/.claude/settings.json`,应用只读、不展示、不落日志

## 5. Claude Code CLI 集成设计(核心)

基于已确认的 CLI 能力(`claude --help`,v2.1.301),采用 **Agent SDK 协议**,而非嵌入终端:

| 需求 | 实现方式 |
|------|----------|
| 启动会话 | 主进程 spawn `claude --print --output-format stream-json --input-format stream-json`,cwd 设为目标项目目录 |
| 流式输出 | 解析 stdout 的 JSONL 流,区分 assistant 文本 / tool_use / tool_result / error |
| 用户输入 | 向 stdin 写入 JSONL 消息 |
| 会话恢复 | `--resume <session-id>` / `--continue` / `--session-id <uuid>` / `--fork-session` |
| 权限确认 | `--permission-mode` + `--permission-prompts host`,权限请求以 JSON 消息发给 host(即本应用),由我们弹 UI 决定 allow/deny |
| 任务中断 | 后台会话模式 `--bg` 配合 `claude stop <id>`,或直接终止子进程 |
| 会话命名 | `--name <name>` 显示在会话列表 |

**关键约束**
- Claude Code 必须在正确的项目工作目录下启动(spawn 时设置 `cwd`)
- 沿用现有 `~/.claude` 配置(登录、模型、权限),应用不注入、不覆盖
- 会话历史本体仍由 Claude Code 存储于 `~/.claude/projects/<路径编码>/<uuid>.jsonl`,应用只读展示,不重复持久化

**已知限制与降级方案**
- stream-json 协议较复杂,需完整实现消息分发与权限回复;若某类事件无法可靠解析,降级为展示原始文本块,而不是伪装成已支持
- 权限 UI 需要应用自行实现(host 模式);若权限事件暂未接入,降级为 `--permission-mode` 预设值并在设置页暴露开关

## 6. 目录结构

```
claude-code-workbench/
├── docs/TECHNICAL_DESIGN.md
├── package.json
├── electron.vite.config.ts
├── tsconfig.json / tsconfig.node.json / tsconfig.web.json
└── src/
    ├── main/            # 主进程
    │   ├── index.ts     #   入口、窗口生命周期
    │   └── ipc.ts       #   IPC 处理器
    ├── preload/         # 预加载
    │   ├── index.ts     #   contextBridge 白名单
    │   └── index.d.ts   #   window.api 类型
    └── renderer/        # 渲染进程 (React)
        ├── index.html
        └── src/
            ├── main.tsx
            ├── App.tsx
            ├── styles/      # tokens.css + global.css
            ├── components/  # Sidebar、ui/ 基础组件
            └── views/       # Projects/Sessions/Skills/MCP/Settings
```

## 7. 设计系统

**设计方向**:面向资深开发者的「本地开发工作台」,参考 VS Code / Cursor / Linear 的克制与层次,但不复制。深色为基底,一个克制的靛蓝强调色,功能色语义化。避免卡片泛滥、渐变装饰与模板化视觉。

**颜色令牌**(核心值,详见 `src/renderer/src/styles/tokens.css`):
- 基底:深色蓝灰分层 `#0f1115`(app)/ `#15181f`(surface)/ `#1b1f27`(elevated)
- 文字:`#e7eaf0`(primary)/ `#a0a8b8`(secondary)/ `#667082`(muted)
- 强调:`#5b8cff`(accent,克制靛蓝)
- 功能:`#34c38b`(success)/ `#e0a13d`(warning)/ `#e05d5d`(error)

**字体**:系统字体栈(桌面原生质感,不加载 web 字体):
- UI:`Segoe UI, system-ui, -apple-system, sans-serif`
- 等宽(路径/代码):`Cascadia Code, JetBrains Mono, Consolas, monospace`

**布局**:左侧固定宽度导航栏(220px,图标 + 文字 + 选中态),右侧主内容区。后续项目页在内容区再细分「项目列表 + 文件树 + 聊天区」。

**原则**:留白充足、层次靠背景与边框而非阴影卡片、悬停/选中反馈简洁、所有成功/失败/加载状态可见。

## 8. 阶段计划

- **Phase 1**:环境检查与技术方案(已完成)
- **Phase 2**:应用基础框架 — 脚手架、三进程安全通信、窗口、导航、design tokens、五个基础页面(当前)
- **Phase 3**:Claude Code 交互 — 子进程管理、stream-json 双向流、会话、中断、权限 UI
- **Phase 4**:项目管理 — 文件系统、项目列表、Git 状态
- **Phase 5**:Skills / MCP 管理
- **Phase 6**:Git 操作、设置完善、打包

## 9. 约束与风险

- Electron 二进制下载在受限网络可能较慢/失败,必要时配置 `ELECTRON_MIRROR`
- 数据库采用 `node:sqlite`(Node 24 内置,Electron 45 内嵌 Node 24.22 已实测可用)。原 better-sqlite3 方案因本机缺 Python/VS Build Tools 且无 Electron ABI 150 预编译二进制而弃用(2026-10-21 变更)
- node:sqlite 返回 `[Object: null prototype]` 对象,数据访问层(db.ts)统一转成普通对象再经 IPC 返回
- Windows 下路径处理需兼容 Git Bash 的 POSIX 路径与 Windows 路径
- 不硬编码 Git Bash / Claude Code 安装路径,运行时探测
