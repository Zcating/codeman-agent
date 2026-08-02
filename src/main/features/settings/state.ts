import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { sanitize, type Settings, type Provider } from "./settings-schema";
import { camelToSnake, snakeToCamel } from "./case-conversion";
import { enforceDefaultModelInvariant } from "./provider-invariant";

export class SettingsState {
  private cache: Settings | null = null;
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  load(): Settings {
    if (this.cache !== null) { return this.cache; }
    let raw: unknown = {};
    if (existsSync(this.filePath)) {
      try {
        raw = JSON.parse(readFileSync(this.filePath, "utf-8"));
      } catch {
        raw = {};
      }
    }
    this.cache = sanitize(snakeToCamel(raw) as Partial<Settings>);
    this.save();
    return this.cache;
  }

  update(patch: Partial<Settings>): Settings {
    this.load();
    this.cache = sanitize({ ...this.cache!, ...patch });
    this.cache = {
      ...this.cache!,
      providers: this.cache!.providers.map((p) => ({
        ...p,
        llm: enforceDefaultModelInvariant(p.llm),
      })),
    };
    this.save();
    return this.cache!;
  }

  deleteProvider(id: string): Provider[] {
    this.load();
    const next: Settings = {
      ...this.cache!,
      providers: this.cache!.providers.filter((p: Provider) => p.id !== id),
    };
    this.cache = sanitize(next);
    this.save();
    return [...this.cache!.providers];
  }

  private save(): void {
    if (this.cache === null) { return; }
    writeFileSync(this.filePath, JSON.stringify(camelToSnake(this.cache), null, 2), "utf-8");
  }
}
