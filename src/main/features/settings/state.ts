import { Effect } from "effect";
import { nodeFileSystem } from "../../lib/file-system-node.js";
import { sanitize, type Settings, type Provider } from "./settings-schema";
import { enforceDefaultModelInvariant } from "./provider-invariant";

type FileSystemSync = typeof nodeFileSystem;

export class SettingsState {
  private cache: Settings | null = null;
  private readonly filePath: string;
  private readonly fs: FileSystemSync;

  constructor(filePath: string, fs: FileSystemSync = nodeFileSystem) {
    this.filePath = filePath;
    this.fs = fs;
  }

  load(): Settings {
    if (this.cache !== null) { return this.cache; }
    let raw: unknown = {};
    const exists = Effect.runSync(this.fs.checkExists(this.filePath));
    if (exists) {
      try {
        raw = JSON.parse(Effect.runSync(this.fs.readTextFile(this.filePath)));
      } catch {
        raw = {};
      }
    }
    this.cache = sanitize(raw as Partial<Settings>);
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
    Effect.runSync(this.fs.writeTextFile(this.filePath, JSON.stringify(this.cache, null, 2)));
  }
}
