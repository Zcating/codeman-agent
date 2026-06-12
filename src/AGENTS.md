# src/ — 前端 (Solid.js + TypeScript)

单页 Vite 应用,渲染到两个 Tauri 窗口。**不引入路由库**——`App.tsx` 用 URL hash(`#/settings`)在 `<Widget />` 和 `<SettingsApp />` 之间切换。两个视图共享同一组 store 实例,同一时刻只挂载一个。

## 目录布局

```
src/
├── index.tsx              # Solid 渲染入口
├── App.tsx                # Hash 路由 + onMount 时拉起 stores
├── components/
│   ├── Widget.tsx         # 280×100 浮窗外壳
│   ├── BalanceView.tsx    # DeepSeek 显示(¥ 87.42 + 自动续费)
│   ├── PlanQuotaView.tsx  # MiniMax 显示(1.2M / 5.0M + 进度条)
│   ├── StaleBadge.tsx     # "stale" 角标,1 秒一跳
│   ├── Switcher.tsx       # 两个圆点的厂商切换器
│   ├── SettingsApp.tsx    # 设置窗根组件
│   └── settings/          # 每个设置 tab 一个文件(共 5 个)
├── lib/
│   ├── tauri.ts           # 唯一调用 invoke()/listen() 的文件
│   ├── types.ts           # Rust 域类型的 TS 镜像
│   ├── format.ts          # 纯展示函数(货币、时间、过期判断)
│   └── units.ts           # compactNumber / formatWithCommas
├── stores/
│   ├── settings.ts        # 通过 getSettings() 镜像后端设置
│   └── snapshot.ts        # 事件总线 → Solid 信号
├── styles/
│   ├── widget.css         # 280×100 暗色磨砂玻璃
│   └── settings.css       # 浅/深色自适应,常规边框
└── assets/                # Vite 打包的 SVG
```

## 硬性规则

- **`lib/tauri.ts` 是唯一允许 import `@tauri-apps/api` 的地方。** 所有 `invoke` 调用走里面的类型化包装。`invoke()` 写在别处,契约就漂了。
- **绝不要把 API key 反射回 DOM。** `ApiKeys` 组件在 `setApiKey` 返回后立刻清空输入框;密码字段永不显示已存的值。这是安全不变量,不是 UX 选择。
- **不要直接读 `tauri-plugin-store`。** 总是 `await getSettings()`,让 `stores/settings.ts` 把结果镜像进 Solid 信号。组件订阅信号。
- **`setState` 不许出现在 store 外。** 共享状态走 `stores/settings.ts` 和 `stores/snapshot.ts`。组件内部局部状态可以,跨组件状态不行。
- **用 `kind` 判别快照。** 收窄用 `lib/format.ts` 里的 `balanceOf(snap)` / `planQuotaOf(snap)`;不要在组件里手写 `kind === "balance"`。

## 模式

- **Hash 路由。** `App.tsx` 监听 `hashchange` 重新渲染。加新视图 = 在 `lib/types.ts` 加 `View` 变体 + 在 `App.tsx` 加一个 `Show` 分支。**不要**引入路由库。
- **事件订阅一次性。** `startSnapshotStore()` 幂等(`started` 标志),在 `App.tsx.onMount` 和 `Widget.tsx.onMount` 各调一次以容错。v1 监听器跟随整个 App 生命周期——见 `useSnapshotEventsCleanup`(v1 里是空操作)。
- **热键捕获归一化为同一 DSL。** 前端 `normaliseChord()`(`components/settings/Hotkeys.tsx`)和 Rust 端 `src-tauri/src/hotkeys.rs::parse` 必须接受同样的和弦串。扩展一边就必须扩展另一边。
- **浮窗窗口是可拖拽的。** 头部有 `data-tauri-drag-region`;body 拦截单击做切换、右键弹上下文菜单。**不要**自己写拖拽处理器——Tauri 原生行为就是契约。

## 查阅指南

| 任务 | 文件 |
|---|---|
| 新增 Tauri 命令包装 | `lib/tauri.ts`(类型在 `lib/types.ts`) |
| 新增设置 tab | `components/settings/<Name>.tsx`,在 `SettingsApp.tsx` 的 `SECTIONS` 注册 |
| 调整浮窗外观 | `components/Widget.tsx` + `styles/widget.css` |
| 新增域类型 | `lib/types.ts`(镜像 Rust 类型) |
| 反应式异常 | `stores/snapshot.ts`——先查监听器注册,不要先查组件 |
| 新增视图(非 widget/settings) | `App.tsx` 的 `currentView()` + `lib/types.ts` 的 `View` |

## 反模式(明确禁止)

- 在 `lib/tauri.ts` 之外用 `invoke(...)`。
- 用 `as any` 绕过 `noUnusedLocals` / `strictNullChecks`——去修类型。
- 组件代码里 import `node:*`——那属于 `scripts/`。
- CSS 类名不带 `.widget-*` / `.settings-*` / `.form-*` 前缀。两份 CSS 用了独立的 CSS 变量命名空间,**不要**在同一条规则里混 `--widget-*` 和 `--settings-*`。
- 加 React 的 `useState`。这是 Solid,等价物是 `createSignal` 和 store。`noUnusedLocals` 抓不到这个,但读者会。
