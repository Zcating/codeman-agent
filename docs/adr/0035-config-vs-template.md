# ADR-0026: 以 `.repos/my-app` 模板为基线整改 codeman-agent 配置

- **Status**: Accepted
- **Date**: 2026-07-22
- **Branch**: `chore/config-vs-template`
- **Supersedes**: —
- **Related**: (codeman-* prefix), (5+1 folder whitelist)

## Context

项目最初从 Tauri + Solid + TypeScript 模板迁移到 Electron + Solid + TypeScript + Effect-TS，但 .repos/my-app（electron-vite + Solid 官方模板）与 codeman-agent 的配置存在多处不一致：

- VSCode 仍推荐 Tauri 插件
- README 还是 Tauri 模板
- electron-builder.yml 缺 macOS / Linux target、缺 auto-update 配置
- 缺 build/ 图标资源
- .editorconfig / .vscode/launch.json 缺失
- .npmrc 缺 electron_builder_binaries_mirror

此外 baseline 已有 ~45 个 typecheck + lint 预存错误（Schema.Type 已弃用 / curly 规则 / mojibake），与配置整改无直接关系但阻碍验证。

## Decision

以 `.repos/my-app/` 为对照基线，把 codeman-agent 的配置对齐到模板。同时把 baseline typecheck / lint 修复纳入本次范围（用户授权），确保每笔 commit 都有可验证的绿色 baseline。

## 9 个原子 commit 摘要（含 1 个基于错误假设的 skip）

1. `e145c37 chore(typecheck): fix pre-existing electron typecheck errors` — `Schema.Type` 改 `Schema.Schema.Type` + 删除 unused consts + SettingsV15 alias
2. `1ac4167 chore(typecheck): fix pre-existing e2e typecheck errors` — fixture type 补全 + workspaceId → workspaceLabel + 删除 unused fn
3. `36a22c5 chore(lint): fix pre-existing oxlint violations` — 28+ curly auto-fix + `scripts/prepare-effect.mjs` mojibake
4. `7526bfa chore: replace Tauri residue in .vscode and README.md` — extensions.json + README 重写
5. ~~`tsconfig.electron.json` moduleResolution 修复~~ — **跳过**：TS 7 已移除 `"node"` moduleResolution（TS5108），`bundler` 是合法选择，无需修改
6. `d22aec4 chore(npm): add electron_builder_binaries_mirror to .npmrc`
7. `55a618b chore: add .editorconfig`
8. `072ebe0 chore(vscode): add launch.json for main + renderer debug`
9. `da0acdf feat(build): align electron-builder.yml with template (Win/mac/Linux + icons + auto-update)`
10. (本 ADR)

## Consequences

- ✅ Win/mac/Linux 三平台产物可出（缺真 brand icon 时会 fallback 到模板占位图）
- ✅ electron-updater 通道已开启（URL 占位 https://example.com/auto-updates）
- ✅ `publish` 字段从 `null` 改为 generic provider，URL 占位 `https://example.com/auto-updates`（待用户提供真实 update server）
- ✅ `npmRebuild: false` 沿用模板默认（跳过原 pnpm 包安装时的 npm rebuild，加速 install；better-sqlite3 等 native module 已在 postinstall 用 `electron-builder install-app-deps` 处理）
- ✅ baseline lint / typecheck 干净，0 错误；4 warnings 是预存问题（empty pattern / require-yield / no-unassigned-vars / react(forbid-elements)），留给后续清理
- ✅ asar 白名单显式排除 electron.vite.config.ts / vite.config.ts / .env 等敏感配置

## 待用户后续处理

- **图标**：当前 `build/icon.{ico,icns,png}` 是从 `.repos/my-app/build/` 临时拷贝的占位，需替换为真 brand icon
- **auto-update URL**：`https://example.com/auto-updates` 占位，需用户提供真实 update server
- **macOS notarize**：当前 `notarize: false`，正式发布前需开启（需 Apple Developer ID）
- **`package.json` author**：electron-builder 警告 `author is missed`，可加 `"author": "zcati <zcating@qq.com>"`
- **oxlint Solid 规则加固**：oxlint 0.56 无等价 `eslint-plugin-solid` 插件；可考虑 (a) 退回 ESLint 用于 Solid 文件 (b) 等 oxlint stable 的 plugin API (c) 写自定义 plugin
- **`.repos/my-app` 自身清理**：模板里仍含 `pnpm-lock.yaml` / `node_modules` 等（gitignore 后），确认 `.repos/` 在主仓库 `.gitignore` 中即可

## Alternatives Considered

- **不引入 baseline fix**：会导致 typecheck / lint 永远红，无法验证本次配置 commit 是否引入回归。已被用户否决（"并入本次范围"）
- **退回 ESLint + Prettier 整套**：性能不如 oxlint + oxfmt；规则库更全但 CI 时间翻倍。未采用
- **手写 oxlint Solid plugin**：oxlint 0.56 plugin API 未稳定，开发成本高。当前记录为后续项
