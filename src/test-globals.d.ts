//! Test-time global type augmentations.
//!
//! `vitest.setup.ts` 在项目根, `tsconfig.json` 的 `include: ["src"]` 看不到它,
//! 所以其 `import "@testing-library/jest-dom"` 的**运行时** matcher 注册对 tsc 不可见。
//! 解决方案: 在 `src/` 下放一个 `.d.ts` 文件做**类型层面的副作用 import**,
//! 让 tsc 知道 `expect(...).toBeInTheDocument()` / `toBeDisabled()` 等 matcher 存在。
//!
//! 这是 jest-dom 6.x 推荐的 setup 模式 (per @testing-library/jest-dom README):
//!
//! > If you are using Vitest, you can add this file to your tsconfig.json's
//! > `include` array, or simply create a `.d.ts` file anywhere in the project.
//! > The side-effect import is what augments the global `Assertion` type.
//!
//! 不需要 runtime 代码 —— `vitest.setup.ts` 已经做了运行时注册 (`import "@testing-library/jest-dom"`),
//! 这里纯粹是**给 tsc 看**。

import "@testing-library/jest-dom";
