# src/features/file-tools/ — File Tools Feature（文件工具域）

> **Scope：** V2 文件工具 AgentTool schema + types。本目录无 UI，无 runtime 接入。
> 本目录结构遵循 [ADR-0010](../../docs/adr/0010-frontend-5-1-folder-whitelist.md) 的 5 子目录白名单。

## 目录布局（ADR-0013）

```
src/features/file-tools/
├── index.ts              # Barrel: exports tools + FileMatch type（feature 根级唯一允许的文件之一）
├── AGENTS.md             # 本文件
└── lib/                  # 纯代码 / 工具 schema 定义
    ├── file-tools.ts     # Tool definitions (read/write/edit/search/delete + fileTools)
    └── file-tools.test.ts # Unit tests (vitest + mockState)
```

## 本 Feature 包含的内容

- **Tool schemas**（`lib/file-tools.ts`）：5 个 pi-ai `AgentTool` 对象。
  - `readFileTool`：读取工作区文件（UTF-8，≤10MB）。
  - `writeFileTool`：写入文件到工作区（原子写，≤10MB）。
  - `editFileTool`：替换文件中的文本（唯一匹配或 replaceAll）。
  - `searchFilesTool`：按 glob 模式搜索文件，可选内容过滤（≤100 结果）。
  - `deleteFileTool`：移动文件到回收站（可恢复，非永久删除）。

- **TS 类型**（从 `src/shared/lib/types.ts` 重新导出）：
  - `Workspace`、`FileMatch`。

## 工具约束（Rust 层强制）

- **沙箱隔离**：所有工具仅限在 `workspaceId` 对应的 `root_path` 内操作。
  Rust `SandboxViolation` 错误会透传到 TS `AppError`。
- **10 MB 大小上限**：Rust 层检查，超过返回 `AppError`。
- **UTF-8 编码**：非 UTF-8 文件返回编码错误。
- **阻塞扩展名**：`.exe` / `.dll` / `.sys` / `.ini` 等系统文件在 Rust 层拒绝。
- **符号链接**：指向 workspace 外的 symlink 在 Rust 层拒绝。

## 本 Feature 不包含的内容

- **无工具执行。** 工具是纯 schema 声明。执行由 chat runtime 的 `agent.subscribe` 监听器分发——该逻辑在 `src/features/chat/lib/runtime.ts` 中，不在本目录。
- **无 IPC。** 所有文件 IPC（`read_file` / `write_file` / `edit_file` / `search_files` / `delete_file`）位于 `FileService`（`src/shared/lib/ipc.ts`）。工具通过 `FileService` 方法调用 IPC，不直接调用 `window.codeman.invoke`。
- **无 UI 组件。** 本 feature 只有 `lib/` 子目录。

## 工具注册方式

```ts
// src/features/chat/lib/runtime.ts
import { fileTools } from "../../file-tools/lib/file-tools";

new Agent({
  transport,
  initialState: {
    systemPrompt: ...,
    model,
    tools: fileTools as any,   // ← 在此注册
    messages: [],
  },
});
```

## 测试

`lib/file-tools.test.ts` 使用 vitest + `mockState`（`src/__mocks__/ipc-mock.ts`）来 mock Electron IPC。

```bash
vp run test src/features/file-tools
```

集成测试（E2E）位于 `e2e/05-file-tools.spec.ts`（未来实现）。

## 从本 Feature 导入

```ts
// 仅导入工具数组
import { fileTools } from "@/features/file-tools/lib/file-tools";

// 通过 barrel 导入单个工具
import { readFileTool, writeFileTool } from "@/features/file-tools";

// 导入类型
import type { FileMatch } from "@/features/file-tools";
```

## 关键约束

- 禁止在 `lib/file-tools.ts` 内添加 HTTP 调用或直接 IPC。
- 禁止在此添加 UI 组件——文件工具 UI（若有）属于 `src/features/chat/components/`。
- 禁止在此创建 5 子目录白名单外的子目录（无 `components/` / `routes/` / `stores/` / `hooks/` 等）。
- 禁止在 5 个子目录外添加文件——file-tools feature 根级只允许 `index.ts` + `AGENTS.md`。
- 所有工具 `parameters` 必须以 `workspaceId: workspaceIdField` 开头（`workspaceIdField` 在 `lib/file-tools.ts` 导出，`Schema.optional(Schema.String)`）。Runtime 通过 `createFileTools(workspaceId)` wrapper 在 schema 校验前注入；LLM 也可以显式给（LLM 值优先）。Field 名遵循 ADR-0013.1 camelCase wire-format（schema field = IPC arg key = chat 系统 prompt hint 单一真相源）。

## ADR 参考

- [ADR-0013](./docs/adr/0013-file-io-tools.md)：V2 文件工具决策纪要
- [ADR-0010](./docs/adr/0010-frontend-5-1-folder-whitelist.md)：5+1 文件夹白名单
- [ADR-0003](./docs/adr/0003-effect-ts-logic-layer.md)：Effect-TS 逻辑层规范
- [ADR-0009](./docs/adr/0009-chinese-developer-language-strategy.md)：中文开发文档策略

## Wave 笔记

- **Wave 3**（2026-06-17）：T11-T15 批量实现 5 个文件工具
