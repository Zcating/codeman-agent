# Phase-3-Schema E2E Parity Review

**Reviewed**: `feature/phase-3-schema-005` @ `0acc7bb11ae44088e502b7a06b45c74f0e344cd7`
**Subject**:R 3 gate — 5 file-tools `typebox → Schema.Struct + JsonSchema.fromAST` JSON Schema parity verification
**Date**: 2026-07-11
**Verdict**: ⚠️ **Documentation gate complete; executable e2e gate blocked in this environment**

## Conclusion

**PR 3 gate: ⛔ 5/5 file-tools parity is not fully verified by the current e2e run.**

Existing specs cover the practical mock-LLM `tool_use` path for `read_file` error handling, `edit_file` error handling, and `search_files` happy-path behavior. `write_file` is only covered by a text-only mock response in `08-file-tools-mock.spec.ts`, and `delete_file` has no explicit e2e coverage.

The requested command was executed:

```txt
vp run e2e:single -- e2e/05-file-tools.spec.ts e2e/08-file-tools-mock.spec.ts
```

It did not reach the specs because global setup failed before Electron launch:

```txt
No Electron build available. Expected ...\node_modules\electron\dist\electron.exe + ...\dist-electron\main\index.js.
Run `pnpm run build` (= electron-vite build) first.
```

No new e2e tests were added because credible mock-LLM `tool_use` tests would need a runnable baseline and QA fixture support; adding unverified tests here would be padding rather than a gate.

---

## Tool-by-tool parity table

| Tool | Pre-PR-3 schema (`Type.Object({...})`) | Post-PR-3 schema (`Schema.Struct({...})` → `JsonSchema.fromAST(ast)`) | Parity verified | Test file |
|------|---------------------------------------|------------------------------------------------------------------------|-----------------|-----------|
| `read_file` | `workspace_id?: string`, `path: string` | `workspace_id: workspaceIdField`, `path: Schema.String` | ⚠️ error-path only via mock-LLM `tool_use` sandbox violation | `e2e/08-file-tools-mock.spec.ts:94` |
| `write_file` | `workspace_id?: string`, `path: string`, `content: string` | `workspace_id: workspaceIdField`, `path: Schema.String`, `content: Schema.String` | ⚠️ text-only mock response; not an AgentTool/AJV `tool_use` assertion | `e2e/08-file-tools-mock.spec.ts:66` |
| `edit_file` | `workspace_id?: string`, `path: string`, `old_text: string`, `new_text: string`, `replace_all: boolean` | `workspace_id: workspaceIdField`, `path: Schema.String`, `old_text: Schema.String`, `new_text: Schema.String`, `replace_all: Schema.Boolean` | ✅ mock-LLM `tool_use` error path validates schema and handler flow | `e2e/05-file-tools.spec.ts:65` |
| `search_files` | `workspace_id?: string`, `glob: string`, `content_pattern?: string` | `workspace_id: workspaceIdField`, `glob: Schema.String`, `content_pattern: Schema.optional(Schema.String)` | ✅ mock-LLM `tool_use` happy path returns matching file + line | `e2e/05-file-tools.spec.ts:120` |
| `delete_file` | `workspace_id?: string`, `path: string` | `workspace_id: workspaceIdField`, `path: Schema.String` | ⚠️ not explicitly covered in e2e | — |

---

## Findings

### Schema migration status

All 5 tools are defined as `Schema.Struct` inputs in `src/features/file-tools/lib/file-tools.ts:81` through `src/features/file-tools/lib/file-tools.ts:114`, and all 5 `AgentTool.parameters` values are produced through `toToolParameters(...)`.

`src/shared/lib/tool-schema.ts:24` bridges Effect Schema to pi-ai by calling:

```ts
JsonSchema.fromAST(schema.ast, { definitions: {} }) as unknown as TSchema
```

The unit parity guard in `src/shared/lib/tool-schema.test.ts:51` through `src/shared/lib/tool-schema.test.ts:69` verifies representative output shape and optional-field behavior for the `JsonSchema.fromAST` helper path.

### Existing e2e coverage

- `e2e/05-file-tools.spec.ts:65` covers `edit_file` through a mock-LLM `tool_use` error path.
- `e2e/05-file-tools.spec.ts:120` covers `search_files` through a mock-LLM `tool_use` happy path.
- `e2e/08-file-tools-mock.spec.ts:94` covers `read_file` through a mock-LLM `tool_use` sandbox-violation path.
- `e2e/08-file-tools-mock.spec.ts:66` mentions `write_file + read_file`, but the file itself documents this as a text-only mock response, not a `tool_use` round trip.
- No current e2e spec references `delete_file` behavior.

### Execution status

The e2e baseline is blocked by local environment setup before tests run. The failure is unrelated to schema parity and occurs in `e2e/global-setup-warm.ts` when checking for the local Electron binary.

---

## Cross-references

-R 3 migration target: `typebox → Schema.Struct + JsonSchema.fromAST` for file-tool schemas.
- `src/features/file-tools/lib/file-tools.ts:81`: `ReadFileSchema`.
- `src/features/file-tools/lib/file-tools.ts:87`: `WriteFileSchema`.
- `src/features/file-tools/lib/file-tools.ts:94`: `EditFileSchema`.
- `src/features/file-tools/lib/file-tools.ts:103`: `SearchFilesSchema`.
- `src/features/file-tools/lib/file-tools.ts:110`: `DeleteFileSchema`.
- `src/shared/lib/tool-schema.ts:24`: `JsonSchema.fromAST(schema.ast, { definitions: {} })` bridge.
- `src/shared/lib/tool-schema.test.ts:51`: unit parity guard for the helper.
- `e2e/05-file-tools.spec.ts`, `e2e/08-file-tools-mock.spec.ts`: existing mock-LLM e2e coverage.

---

## Follow-ups

1. Restore e2e local prerequisites (`vp run install` / Electron binary availability, then `vp run build` if needed) and rerun:

   ```txt
   vp run e2e:single -- e2e/05-file-tools.spec.ts e2e/08-file-tools-mock.spec.ts
   ```

2. Add a `write_file` mock-LLM `tool_use` happy-path e2e test once QA fixtures are runnable.
3. Add a `delete_file` happy-path e2e test if Electron's recycle-bin path is stable enough in CI.
4. Optionally add a byte-equivalence unit test comparing a representative pre-PR-3 typebox JSON Schema object with the post-PR-3 `JsonSchema.fromAST` output.
