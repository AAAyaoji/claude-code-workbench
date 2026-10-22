# Claude Code 集成设计(Phase 3)

> 本文档基于 Claude Code CLI v2.1.301 的**实际测试**,记录 stream-json 协议、进程通信模型与权限处理的限制。是 Phase 3+ 编码的技术依据。

## 1. 实测协议结论

所有结论均通过真实运行 `claude` 命令验证,非文档推断。

**启动必需参数**:`-p --output-format stream-json` 必须搭配 `--verbose`,否则报错:
`Error: When using --print, --output-format=stream-json requires --verbose`。

**输入格式**(`--input-format stream-json`,每行一个 JSON):
```json
{"type":"user","message":{"role":"user","content":[{"type":"text","text":"..."}]}}
```

**输出事件**(stdout 的 JSONL,每行一个对象):

| 事件 | 关键字段 | 用途 |
|------|----------|------|
| `system:init` | `session_id`, `cwd`, `model`, `tools[]`, `permissionMode`, `slash_commands[]` | 会话元数据、工具清单 |
| `system:thinking_tokens` | (DeepSeek 思考 token 流) | 思考过程(可忽略或展示) |
| `system:hook_started` / `hook_response` | — | 钩子事件(忽略) |
| `assistant` | `message.content[]`:`{type:"thinking"}` / `{type:"text",text}` / `{type:"tool_use",id,name,input}` | 助手回复、工具调用 |
| `user` | `message.content[]`:`{type:"tool_result",tool_use_id,is_error,content}` | 工具执行结果 |
| `result:success` | `stop_reason`, `session_id`, `total_cost_usd`, `usage`, `permission_denials[]` | 回合结束 |

**关键实测事实**:
- 会话 ID 来自 `system:init.session_id`,并出现在每个事件中
- 工具调用:`assistant` 里的 `tool_use` 块 → 对应 `user` 里的 `tool_result`(用 `tool_use_id` 关联)
- 会话恢复:`--resume <session_id>` 有效,模型能记住上一轮上下文(已实测)

## 2. 进程通信模型

主进程 `spawn('claude', [...])`,通过子进程 stdin/stdout 做双向 JSONL 通信:

```
spawn: claude -p --input-format stream-json --output-format stream-json --verbose [--resume <id>] [--allowedTools ...]
  cwd = 选定的项目目录
  stdin  <- 写入用户消息(JSONL)
  stdout -> 逐行读取事件,通过 webContents.send 推送给渲染进程
  stderr -> 收集诊断信息(不暴露 token)
```

- 会话是**持久进程**:一个 claude 子进程持续存活,多轮对话复用同一进程
- 发送消息 = 向 stdin 写一行 JSON;接收 = 读 stdout 直到 `result` 事件
- 中断 = 终止子进程(`child.kill()`);退出会话 = 正常关闭 stdin 并等待退出

## 3. 事件类型定义(TS)

```ts
// 输入
type UserInput = { type: 'user'; message: { role: 'user'; content: TextBlock[] } }
// 输出(核心子集)
type ClaudeEvent =
  | { type: 'system'; subtype: 'init'; session_id: string; cwd: string; model: string; tools: string[]; permissionMode: string }
  | { type: 'assistant'; session_id: string; message: AssistantMessage }
  | { type: 'user'; session_id: string; message: { content: ToolResultBlock[] } }
  | { type: 'result'; subtype: 'success'; session_id: string; stop_reason: string; total_cost_usd: number }
  | { type: 'system'; subtype: string }  // thinking_tokens / hook_* 等
```

## 4. 权限处理:限制与降级方案

**实测限制**:在当前 DeepSeek 端点环境下,`--permission-mode manual` + `--permission-prompts host` 与 `--permission-prompts none` **均不拦截工具执行**——工具被直接执行,权限请求事件不产生(`permission_denials` 恒为空)。

**结论**:CLI 的运行时权限拦截在本环境不可用。因此 Phase 3 采用**降级方案**:

1. **工具白名单**:启动时传 `--allowedTools`,在应用层静态限制可用的工具(后续在 Settings 暴露配置)
2. **执行透明化**:UI 实时显示每个 `tool_use` 事件(工具名 + 参数 + 执行结果),让敏感操作对用户完全可见
3. **诚实边界**:不伪装"运行时确认"能力;真正的逐次确认需待 CLI 权限协议在本环境可用后再接入

## 5. 会话生命周期

```
创建 → spawn claude 子进程(cwd=项目目录,可选 --resume)
运行 → 多轮 stdin/stdout 双向通信
中断 → child.kill()(立即终止)
结束 → 关闭 stdin,等待子进程退出,记录 session_id
恢复 → 用保存的 session_id 再次 spawn,带 --resume <id>
```

会话 ID 与项目路径的关联先存内存,后续阶段持久化到 SQLite。

## 6. 错误处理

- spawn 失败(找不到 claude):主进程返回结构化错误,UI 显示
- 子进程意外退出:捕获 `exit` 事件,推送 `session:exited` 事件,UI 更新状态
- stdout 解析失败:跳过无法解析的行,记录计数,不中断整体流程
- stderr:仅收集诊断,不展示给 UI(可能含敏感信息),不写日志文件
