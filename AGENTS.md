# codeman-agent — Agent 知识库

**生成时间:** 2026-06-11
**技术栈:** Tauri 2 (Rust) · Solid.js · TypeScript · Vite · pnpm 11
**目标平台:** 仅 Windows (v1)。跨平台 Tauri 移植可行,但不在范围内。

## 项目定位

一个 280×100 的无边框置顶浮窗,实时显示 LLM 厂商的计费状态,另带一个模态设置窗。v1 接入两个厂商:**DeepSeek**(余额)和 **MiniMax**(套餐配额)。

> 项目词汇见 `CONTEXT.md`,技术选型决策见 `docs/adr/0001-tauri-2-solidjs.md`。本文件是**操作层**——目录地图、命令、项目专属规则,不重复上述文档。

## 目录布局

```
.
├── src/                   # Solid.js 前端(详见 src/AGENTS.md)
├── src-tauri/             # Rust 后端(详见 src-tauri/AGENTS.md)
│   └── src/providers/     # 各厂商适配器(详见该子目录 AGENTS.md)
├── docs/adr/              # 架构决策记录
├── scripts/               # Node 侧开发脚本(kill-port)
├── public/                # 原样打包的静态资源
├── index.html             # Vite 入口;hash 路由(#/settings)
├── package.json
├── tsconfig.json
├── vite.config.ts
└── CONTEXT.md             # 词汇表(权威来源)
```

## 常用命令

```bash
# 仅前端
pnpm dev          # vite dev,端口 1420
pnpm typecheck    # tsc --noEmit
pnpm build        # vite build → dist/

# 整包(先清掉残留的 1420/1421 监听)
pnpm tauri dev    # 构建前端 + 运行 Rust 壳
pnpm tauri build  # 产出 MSI/NSIS 安装包
```

`predev` / `pretauri` 会跑 `scripts/kill-port.mjs 1420 1421`,防止上次强杀 dev 进程后端口被占。`vite.config.ts` 启用 `strictPort: true`——端口冲突是硬错误,设计如此。

## IPC 契约(总览)

- 所有命令定义在 `src-tauri/src/commands.rs`,经 `src/lib/tauri.ts` 再导出给前端。**新增命令必须同时改这两处。**
- 向前端推送的事件:
  - `snapshot-updated` → `SnapshotEnvelope`
  - `refresh-failed` → `{ provider, error }`
  - `low-threshold-breached` → `{ provider, snapshot }`
- 线上字段一律 **snake_case**(Rust serde 决定),TS 里也用 snake_case。`src/lib/types.ts` 是 `src-tauri/src/types.rs` 的镜像,任何漂移都视作 bug。

## 硬性规则(项目专属)

- **API key 绝不写入 `settings.json`。** 统一存到 Windows 凭据管理器,路径 `codeman-agent/<provider>/api_key`,通过 `keyring` crate 访问(见 `src-tauri/src/secrets.rs`)。前端只接收 `hasKey: boolean`。
- **`Secret<String>` 对日志不可见。** `Debug` / `Display` 都打印 `Secret(***)`。绝不要把 secret 拼进错误信息或日志。**只有适配器层可以调用 `.expose()`。**
- **统一 Bearer 认证。** 所有厂商都用 `Authorization: Bearer <key>`,在适配器内部从 `Secret` 构造。
- **单焦点轮询。** 调度器只拉**当前激活**的厂商(`AppState::fetch_active`)。切换时通过 `tokio::select!` 中止正在进行的请求;非激活厂商永远不应该被轮询。
- **设置写入前必须 sanitized。** `Settings::sanitized()` 把 `refresh_interval_secs` 下钳到 ≥5、`low_quota_threshold_pct` 钳到 `[0, 100]`、`low_balance_threshold` 下钳到 ≥0。所有接受用户输入的写路径(`commands::update_settings`)都必须先调它。
- **设置通过 `tauri-plugin-store` 持久化。** 文件:OS app-data 目录下的 `settings.json`。启动时读,每次变更写回。不引入自定义存储层。
- **无历史数据。** v1 只反映"当前状态"——不做快照历史记录,不做图表,不做时序。

## 约定

- Rust 文件以 `//!` 模块文档注释开头,一句话点明职责。注释要保持准确。
- TypeScript 文件同样以 `//!` 开头。
- 测试**内联**:Rust 用 `#[cfg(test)] mod tests`,TS 临时即兴(本项目 v1 不引测试框架)。`src-tauri/src/scheduler.rs` 内置 `FakeProvider` 测试替身;`*Adapter` 测试用 `wiremock`。
- `tauri::generate_handler!` 在 `src-tauri/src/lib.rs` 里枚举所有命令。新增命令必须同时改这里和 TS 包装。
- 前端**不直接 import Rust 类型**——只引用 `src/lib/types.ts` 里的 TS 形状。TS 文件就是线缆契约。

## 反模式(明确禁止)

- 用 `format!("{secret:?}")` 之类把 `secrets::*` 的值写进日志。
- 用 `String` 表示金额/数量值。货币用 `rust_decimal::Decimal`,配额计数用 `u64`,百分比这种**派生值**才用 `f64`。
- 用 `setState` 满天飞。共享状态必须走 `src/stores/*.ts` 的 Solid store,组件用 `createMemo` / signal getter 读。
- 前端代码直接调 `adapter.fetch`。必须经过 Tauri 命令(`test_provider`、`force_refresh`)。
- 给 `Snapshot` 加字段而不同时更新 Rust 枚举**和** TS 联合变体。`kind` 上的判别联合是前端唯一依赖的结构化类型。
- 跳过 `Provider` trait(`src-tauri/src/providers/mod.rs`)直接写新厂商。详见该子目录的 AGENTS.md。

## 已知坑

- **MiniMax 端点待定。** 适配器带占位 URL,返回 `ProviderError::EndpointNotConfigured` 直到 `CONTEXT.md` 文档化了经核验的 URL 并翻转为默认。
- `pnpm-workspace.yaml` 当前只写了一句 `esbuild: set this to true or false`——是占位文件,**不是**真正的 workspace。**不要往里加包。**
- `tauri.conf.json` 里 `CSP` 设为 `null`——开发期便利,不是基线。新建窗口时不要照抄。
- `Cargo.toml` 把 `rust_decimal` / `chrono` / `reqwest` 锁在带特定 features(`serde-with-str` / `serde` / `native-tls` / `json`)的版本。升版时通常要审视 features。
