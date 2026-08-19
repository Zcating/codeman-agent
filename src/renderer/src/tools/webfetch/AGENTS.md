# webfetch — HTTP/HTTPS fetch tool

`tools/` 是 6+1 白名单的新成员，与 `features/` 同级，存放 LLM-facing AgentTool 定义。每个 `tools/<name>/` 根级仅允许 `index.ts` + `AGENTS.md`，文件扁平不允许嵌套子目录。

## 文件清单

| 文件 | 用途 |
|------|------|
| `schemas.ts` | Effect Schema: `WebfetchParamsSchema` |
| `schemas.test.ts` | schema 边界值/拒绝测试 |
| `html-to-markdown.ts` | HTML→Markdown(Turndown) + HTML→plain-text |
| `html-to-markdown.test.ts` | html-to-markdown 转换测试 |
| `webfetch.ts` | `webfetchTool` AgentTool 定义 |
| `webfetch.test.ts` | 工具完整测试 (IPC mock) |
| `index.ts` | barrel 导出 |

外部依赖: `src/shared/apis/webfetch.api.ts` (Service Tag + Live Layer)。

## 命名约定

- Schema field: camelCase (`url`, `format`, `timeout`)
- Tool name: 单字 `webfetch` (非 snake_case,因 HTTP fetch 是单动词)
- IPC channel: `"webfetch:fetch"`
- Method on window.codeman: `webfetch(args)`

## 限制

| 项 | 值 |
|----|-----|
| 协议 | http:// 和 https:// 仅 |
| 超时 | 5–120s (默认 30s) |
| 响应大小 | ≤5MB |
| SSRF | private/loopback CIDR 黑名单(由 main 端 `ssrf.ts` 执行) |
| 格式 | markdown(默认) / text / html |

## Task B 边界

- `src/main/features/webfetch/handler.ts` — IPC handler(非 renderer 关心)
- `src/main/features/webfetch/ssrf.ts` — SSRF 黑名单检查
- `src/main/ipc.ts` — `ipcMain.handle("webfetch:fetch", ...)`
- `src/preload/index.ts` — `codeman.webfetch` 暴露
- `src/renderer/__mocks__/ipc-mock.ts` — 测试 mock
