//! e2e/env-loader.ts — 读 .env 文件,把 key=value 解析为 Record。
//!
//! .env 格式:每行 `KEY=VALUE`,VALUE 可选地用单/双引号包裹,允许 # 开头注释。
//! 不支持多行值 / 转义(本项目测试用例不涉及)。
//!
//! 为什么不用 dotenv 包:playwright worker 是 Node ESM 进程,.env 仅在
//! 1-2 个 spec 中用,加一个 dev-dep 跟 ADR-0010 的 "minimal deps" 约定相悖。
//! 手写 25 行解析器覆盖本项目需要的全部语法,无新依赖。
//!
//! 找不到 .env 时返回空 Record,调用方决定如何降级 (warn / skip / throw)。

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadEnvFile(envPath = ".env"): Record<string, string> {
  const absPath = resolve(process.cwd(), envPath);
  if (!existsSync(absPath)) {
    return {};
  }

  const content = readFileSync(absPath, "utf-8");
  const env: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const eq = line.indexOf("=");
    if (eq < 0) {
      continue;
    }

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();

    // 剥掉匹配的成对引号(单或双)。
    if (value.length >= 2) {
      const first = value[0];
      const last = value[value.length - 1];
      if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
        value = value.slice(1, -1);
      }
    }

    env[key] = value;
  }

  return env;
}
