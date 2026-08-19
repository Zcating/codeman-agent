# 0021 — precommit gate 架构(staged glob 按类型分流)

- **Status**: accepted
- **Date**: 2026-06-26
- **Scope**: codeman-agent 提交门禁 (`vp staged` -> 多个 precommit 脚本)
- **Related**: ADR-0020(test helpers 提取 / 前端 coverage gate),
  ADR-0013(IPC contract 同步)

## Context

### 触发 1:后端需要质量门

ADR-0020 把前端(`*.{ts,tsx,mjs}`)的提交门禁从 "tests pass" 升级到 "perFile 90% statements
threshold met"。但后端 (`src-tauri/**/*.rs`) **没有对应门禁**——`vite.config.ts::staged`
只匹配前端 glob,任何 `*.rs` 改动都跳过 precommit,直接进 commit。

后端的代码质量靠 CI (GitHub Actions + `cargo test`) 兜底,本地 commit 无任何卡点,
导致 `cargo test` 红代码也能 merge 到 master。

### 触发 2:staged glob 已经分流,脚本里再判类型是冗余

最初的 precommit 脚本设计把 "前端的 staged 文件" 和 "后端的 staged 文件" 都丢进
同一个 `scripts/precommit.mjs`,在脚本里再用 regex 区分 `\.ts$` / `\.rs$`。但
`vite.config.ts::staged` 本身就是 **glob 驱动的**——每个 glob pattern 已经按文件类型
分流了,**下游脚本不需要再判类型**。

把脚本拆成两个,各自只接收自己类型的文件,逻辑更清晰、单元测试更容易、维护更简单。

## Decision

### D1.vite.config.ts::staged 用 glob 按文件类型分发到独立脚本

```ts
staged: {
  "*.{ts,tsx,mjs}": "node scripts/precommit.mjs",      // 前端门禁
  "*.rs":            "node scripts/precommit-rust.mjs", // 后端门禁
},
```

每个 glob pattern 对应一个独立脚本。脚本收到 `process.argv.slice(2)` 是**已经按
glob 过滤过的路径列表**,不需要再检查扩展名 / 文件类型。

**反面(已拒绝)**: 单一 `precommit.mjs` + 内部 regex 分流。
1. **职责不单一**:一个脚本同时管前端 + 后端,体积膨胀
2. **冗余类型检测**:staged glob 已经分流,regex 是 noise
3. **CI 路径不友好**: 后端开发者改 `*.rs` 不该触发前端 typecheck;拆分后门禁独立

### D2.前端门禁 = `scripts/precommit.mjs`(per)

收到 `*.{ts,tsx,mjs}` 文件:
1. **typecheck**(全项目,跟 staged 文件无关——per)
2. **`vitest related <staged>`**——跑 staged 文件 import graph 内的测试
3. **`--coverage --coverage.include=<src>` × N**——coverage scope 缩到 staged 源文件
4. **perFile 90% statements** 阈值(`vite.config.ts::test.coverage.thresholds`)

文件 ROLE 仍在脚本内区分(不影响 D1 原则):
- `*.ts` / `*.tsx` 非 test/spec → **source**(参与 coverage 阈值)
- `*.test.ts` / `*.spec.tsx` → **test**(只参与 `related`,不进 coverage)
- `*.d.ts` → **type-only**(过滤掉,无 runtime,不该进 coverage)

### D3.后端门禁 = `scripts/precommit-rust.mjs`

收到 `*.rs` 文件:
1. **`cargo clippy --all-targets -- -D warnings`**——静态检查 + lint,warnings 变 errors
2. **`cargo test`**——全量测试(Rust 没有 `--related` 等价物)
3. **`cargo llvm-cov --json --output-path coverage.json`**——生成 JSON coverage 报告
4. **`node scripts/check-rust-coverage.mjs <staged>`**——perFile 90% lines 阈值

文件 ROLE 仍在脚本内区分:
- `src-tauri/src/**/*.rs` → **production source**(参与 coverage 阈值)
- `src-tauri/tests/...` / `src-tauri/examples/...` / `src-tauri/benches/...` →
  **non-production**(已通过 `cargo test` 验证,不参与 coverage 阈值)

### D4.cargo-llvm-cov 是后端 coverage 工具

选用 `cargo-llvm-cov`(per 用户决策):

| 候选                | 平台支持                  | 阈值门                  | 选 / 弃              |
| ------------------- | ------------------------- | ----------------------- | -------------------- |
| **cargo-llvm-cov**  | Win/Mac/Linux(LLVM 跨平台) | `--fail-under-lines N` aggregate + JSON perFile 脚本 | **选** |
| cargo-tarpaulin     | 主要 Linux/Mac(Windows 不稳)| `--fail-under N` aggregate | 弃(Windows 不可靠) |
| 不上 coverage       | —                         | —                       | 弃(无量化护栏) |

`cargo-llvm-cov` 借助 `llvm-tools-preview`(已装),通过 `cargo install cargo-llvm-cov`
一键安装,产出 JSON 可被 `scripts/check-rust-coverage.mjs` 解析做 perFile 阈值。

### D5.perFile 阈值通过 JSON 解析实现(不用 `--fail-under-lines`)

`cargo llvm-cov --fail-under-lines 90` 只检查 **aggregate**,会让一个文件从 30% 拉到
另一个文件的 100% 掩盖。前端用 vitest 4.x 的 `thresholds.perFile: true` 实现 perFile,
后端 cargo-llvm-cov 没原生支持 → 用 JSON + 脚本补:

```js
// scripts/check-rust-coverage.mjs
const coverage = JSON.parse(fs.readFileSync("src-tauri/coverage.json", "utf-8"));
// data[0].files[].filename (绝对路径) + summary.lines.percent
const filesByPath = new Map(coverage.data[0].files.map(f => [
  f.filename.replace(/\\/g, "/"), f,
]));
for (const staged of sourceFiles) {
  const data = filesByPath.get(staged);
  if (!data) { missing.push(staged); continue; }
  if (data.summary.lines.percent < 90) failed.push({ staged, ... });
}
```

未在 report 中的文件视作"无测试覆盖" → fail(强迫开发者补测试,不能跳过)。

### D6.后端 CI 改动

`package.json` 新增 3 个 script(对应 D3 的 4 步):

```json
"tauri:lint":           "cd src-tauri && cargo clippy --all-targets -- -D warnings",
"tauri:test":           "cd src-tauri && cargo test",
"tauri:coverage":       "cd src-tauri && cargo llvm-cov --json --output-path coverage.json --quiet",
"tauri:coverage:check": "node scripts/check-rust-coverage.mjs"
```

手动跑 / CI:
```bash
vp run tauri:lint          # 静态检查
vp run tauri:test          # 测试
vp run tauri:coverage      # coverage JSON
vp run tauri:coverage:check -- src-tauri/src/foo.rs  # perFile 90%
```

## Why not...

### Why not 一个 `precommit.mjs` 包含前端 + 后端

已在 D1 解释。**staged glob 已经按类型分流**,脚本再判 regex 是冗余且反职责。

### Why not 在 precommit 里跑 `cargo check` 替代 `cargo test`

`cargo check` 是轻量 typecheck,不 link、不跑测试,~10s。但 lint 不完整
(很多 clippy lint 需要 build artifact)。`cargo clippy --all-targets` 是
主流 Rust 项目的门禁选择(包含单元测试 + integration test 的 lint)。

### Why not 跑 `cargo test` 时也按 staged 过滤

cargo 没有 `--related` 等价物:
- `cargo test <name>` 按 test 名称过滤(不按 source)
- `cargo test --package X` 按 package 过滤(monorepo 适用,本项目单 crate 不适用)
- `cargo nextest` 按 binary 过滤,需要改依赖

实用选择:**接受全量 `cargo test`**,增量编译让 warm target/ 后 ~5-10s。

### Why not 跳过 baseline 失败的 `.rs` 文件

不行。如果 "某个文件 0% 但 gate 跳过它",开发者可以加新文件零测试提交,
perFile 阈值失去意义。未在 report 中的文件 = 没测试 → fail。

## Consequences

### 正面

- **后端 commit 有真正质量门**——之前 `*.rs` 改动不触发任何门禁,现在 clippy +
  test + perFile coverage 全部生效
- **staged glob 是单点真相**——加新文件类型时,只需 `vite.config.ts` 加一行 glob +
  一个对应脚本,无须改旧脚本
- **perFile 90%** 与前端对称——`commands/filesystem.rs` 71% 跟 `settings.tsx` 92%
  同等待遇,统一 ≥90% 质量基线

### 负面 / 风险

- **后端 commit 慢 ~50-105s**——clippy (~10s) + test (~45s cold / ~5-10s warm) +
  coverage (~50s cold / ~5-10s warm)。首次 commit 慢,可接受
- **baseline 不达标**——当前 11 个 Rust 源文件中,7 个 < 90% (commands/mod.rs 0%,
  lib.rs 0%, main.rs 0%, state.rs 0%, mod.rs 67%, types.rs 73%, sandbox.rs 82%,
  settings.rs 86%, commands/filesystem.rs 71%)。开发者必须先补测试才能 commit
- **`scripts/check-rust-coverage.mjs` 用 `process.cwd()` 假设**——必须从 repo 根跑。
  `package.json` script 的 `cd src-tauri && cargo` 反向 cwd 到 backend,后续脚本
  又回到 root 跑 check。需要在文档里说清楚

### 不可逆性

推翻本 ADR 需:
- `vite.config.ts::staged` 删 `"*.rs"` 行 → 后端无门禁
- `scripts/precommit-rust.mjs` 删除
- `scripts/check-rust-coverage.mjs` 删除
- `package.json` 删 `tauri:lint` / `tauri:coverage` / `tauri:coverage:check`
- 撤回本 ADR

成本 = 4 文件删除 + 1 glob 行删除 + ADR 头部改动。**有可逆成本,标记可逆**。

### 跨文件影响清单

| 文件 | 改动 |
| --- | --- |
| `docs/adr/0021-precommit-gate-architecture.md` | 本 ADR(新增) |
| `vite.config.ts` | 新增 `"*.rs": "node scripts/precommit-rust.mjs"` staged glob + 注释 |
| `scripts/precommit.mjs` | 不变(per) |
| `scripts/precommit-rust.mjs` | 新建 — 后端门禁(clippy + test + coverage + check) |
| `scripts/check-rust-coverage.mjs` | 新建 — perFile 90% lines 阈值(JSON 解析) |
| `package.json` | 新增 3 个 script:`tauri:lint` / `tauri:coverage` / `tauri:coverage:check` |

**回归验证**:
- `vp run tauri:lint` exit 0(clippy 不应 fail,目前代码应该 clean)
- `vp run tauri:test` exit 0(60 pass + 1 ignore)
- `vp run tauri:coverage` 生成 `src-tauri/coverage.json`
- `node scripts/check-rust-coverage.mjs <staged>` 正确判定 perFile 阈值
- `node scripts/precommit-rust.mjs <staged>` 端到端跑通(全 4 步)
- `git commit` 触发 `vp staged`,命中 `*.rs` glob,跑 `precommit-rust.mjs`

## References

- § D1-D7:test helpers 提取 + 前端 perFile coverage gate(本 ADR 互补)
- § Effect-TS 逻辑层:Rust ↔ TypeScript IPC contract 同步
- `src-tauri/AGENTS.md` § "测试":`cargo test` 已存在的 pattern
- `cargo-llvm-cov` 文档:JSON output format + `--fail-under-lines` 限制
- vp-staged 文档:glob match + args forwarding
