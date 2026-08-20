import { app } from "electron";
import { join } from "node:path";

export const PI_DIR = ".pi";

export function getAuthJsonPath(): string {
  return join(app.getPath("home"), PI_DIR, "auth.json");
}

export function getSettingsJsonPath(): string {
  return join(app.getPath("home"), PI_DIR, "settings.json");
}

export function getModelsJsonPath(): string {
  return join(app.getPath("home"), PI_DIR, "models.json");
}
