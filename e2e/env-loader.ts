










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
