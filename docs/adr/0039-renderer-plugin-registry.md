# 0035 — Renderer Plugin Registry：启动初始化与导航元数据

**Status**: accepted · **Date**: 2026-07-26

renderer 以显式注册的 `skills` 与 `mcp` Plugin 组成 Plugin Registry，在首屏渲染前并行完成 Plugin Initialization；单个 Plugin 失败只记录自身失败状态，不阻塞 Agent 进入。Plugin descriptor 同时提供 route/sidebar metadata，实际 TanStack Router route 仍静态声明，避免运行时动态重建 code-based route tree。

## Considered Options

- **启动时逐页刷新**：拒绝，因为能力发现依赖用户进入页面和手动操作，聊天首用时可能缺少 Skills。
- **任意 Plugin 失败阻塞首屏**：拒绝，MCP 连接失败不应让整个 Agent 无法打开。
- **初始化失败全部静默降级**：拒绝，Registry 必须保留逐 Plugin 状态和错误，避免把失败误判成正常空数据。
- **运行时动态添加 route**：拒绝，当前 TanStack Router 是 code-based route tree；Registry 只统一导航元数据，route component 仍由静态 router 声明。
- **Registry 聚合 runtime tools/system prompt**：不纳入本次决策，继续由现有 Skills/MCP 模块和 runtime 负责。
