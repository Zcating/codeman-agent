import type { AgentSession, CreateAgentSessionOptions, SessionManager, ModelRuntime, SettingsManager } from "@earendil-works/pi-coding-agent";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime as ModelRuntimeClass,
  SessionManager as SessionManagerClass,
  SettingsManager as SettingsManagerClass,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";

import { webfetchTool } from "./tools/webfetch";
import skillsExtension from "./extensions/skills-extension";
import subagentExtension from "./extensions/subagent-extension";
import mcpExtension from "./extensions/mcp-extension";
import codemanAgentExtension from "./extensions/codeman-agent-extension";

export interface PiRuntimeInitOptions {
  cwd?: string;
  agentDir?: string;
}

export class PiRuntime {
  private static _instance: PiRuntime | null = null;

  private _sessionManager: SessionManager | null = null;
  private _modelRuntime: ModelRuntime | null = null;
  private _settingsManager: SettingsManager | null = null;
  private _initialized = false;
  private _resourceLoader: DefaultResourceLoader | null = null;

  static getInstance(): PiRuntime {
    if (PiRuntime._instance === null) {
      PiRuntime._instance = new PiRuntime();
    }
    return PiRuntime._instance;
  }

  reset(): void {
    this._sessionManager = null;
    this._modelRuntime = null;
    this._settingsManager = null;
    this._initialized = false;
    this._resourceLoader = null;
    PiRuntime._instance = null;
  }

  async init(options: PiRuntimeInitOptions = {}): Promise<void> {
    if (this._initialized) {
      throw new Error("PiRuntime already initialized");
    }

    const cwd = options.cwd ?? process.cwd();
    const agentDir = options.agentDir ?? getAgentDir();

    this._modelRuntime = await ModelRuntimeClass.create();
    this._sessionManager = SessionManagerClass.create(cwd, agentDir);
    this._settingsManager = SettingsManagerClass.create(cwd, agentDir);

    const loader = new DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager: this._settingsManager!,
      extensionFactories: [
        skillsExtension,
        subagentExtension,
        mcpExtension,
        codemanAgentExtension,
      ],
    });
    await loader.reload();
    this._resourceLoader = loader;

    this._initialized = true;
  }

  getSessionManager(): SessionManager {
    if (!this._initialized || !this._sessionManager) {
      throw new Error("PiRuntime not initialized");
    }
    return this._sessionManager;
  }

  getModelRuntime(): ModelRuntime {
    if (!this._initialized || !this._modelRuntime) {
      throw new Error("PiRuntime not initialized");
    }
    return this._modelRuntime;
  }

  getSettingsManager(): SettingsManager {
    if (!this._initialized || !this._settingsManager) {
      throw new Error("PiRuntime not initialized");
    }
    return this._settingsManager;
  }

  isInitialized(): boolean {
    return this._initialized;
  }

  async createSession(options: Partial<CreateAgentSessionOptions> = {}): Promise<AgentSession> {
    if (!this._initialized) {
      throw new Error("PiRuntime not initialized");
    }

    const sessionManager = options.sessionManager ?? this._sessionManager!;
    const modelRuntime = options.modelRuntime ?? this._modelRuntime!;
    const settingsManager = options.settingsManager ?? this._settingsManager!;
    const resourceLoader = this._resourceLoader!;

    const result = await createAgentSession({
      cwd: options.cwd ?? this._sessionManager!.getCwd(),
      sessionManager,
      modelRuntime,
      settingsManager,
      resourceLoader,
      customTools: [webfetchTool],
      tools: ["read", "bash", "edit", "write", "grep", "find", "ls", "webfetch"],
      ...options,
    });

    return result.session;
  }
}
