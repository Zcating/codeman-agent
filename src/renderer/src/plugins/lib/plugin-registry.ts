
import { createSignal, type Accessor } from "solid-js";
import { Effect } from "effect";
import { Unknown, type AppError } from "@codeman-frontend/shared/lib/errors";


export type PluginId = string;

export interface PluginRouteMetadata {
  readonly path: string;
  readonly label: string;
}

/**
 * PluginIconName — union of all valid Lucide icon names.
 *
 * Derives from `typeof import("lucide-solid")` so any new icon added to
 * lucide-solid is automatically allowed. Forces compile-time safety on
 * plugin descriptors: a typo'd icon name (`"Clokc"`) or a removed icon
 * fails typecheck instead of crashing the sidebar render with
 * "Unknown icon for plugin" — see chat-sidebar.tsx renderPluginIcon
 * (the regression caught in commit c8e4331).
 */
export type PluginIconName = keyof typeof import("lucide-solid");

export interface PluginSidebarMetadata {
  readonly icon: PluginIconName;
  readonly order: number;
  readonly visible: boolean;
}

export interface PluginDescriptor {
  readonly id: PluginId;
  readonly initialize: Effect.Effect<void, AppError>;
  readonly route: PluginRouteMetadata;
  readonly sidebar: PluginSidebarMetadata;
}


export type PluginState =
  | { readonly status: "pending" }
  | { readonly status: "initializing" }
  | { readonly status: "ready" }
  | { readonly status: "failed"; readonly error: AppError };

export type PluginStates = ReadonlyMap<PluginId, PluginState>;


export interface RegistryState {
  readonly plugins: PluginStates;
}

export interface PluginMetadata {
  readonly id: PluginId;
  readonly route: PluginRouteMetadata;
  readonly sidebar: PluginSidebarMetadata;
}


export interface InitializeAllResult {
  readonly ok: true;
  readonly failures: ReadonlyMap<PluginId, AppError>;
}


interface InternalPlugin {
  readonly descriptor: PluginDescriptor;
  state: PluginState;
}

class PluginRegistryImpl {
  private plugins = new Map<PluginId, InternalPlugin>();

  private _stateSignal = createSignal<RegistryState>({ plugins: new Map() });

  constructor() {
    this.registerBuiltin({
      id: "skills",
      initialize: Effect.void,
      route: { path: "/plugins/skills", label: "Skills" },
      sidebar: { icon: "WandSparkles", order: 3, visible: true },
    });
    this.registerBuiltin({
      id: "mcp",
      initialize: Effect.void,
      route: { path: "/plugins/mcp", label: "MCP" },
      sidebar: { icon: "Cable", order: 4, visible: true },
    });
  }

  private registerBuiltin(descriptor: PluginDescriptor): void {
    const pendingState: PluginState = Object.freeze({ status: "pending" });
    this.plugins.set(descriptor.id, {
      descriptor,
      state: pendingState,
    });
    this.notifyStateChange();
  }

  registerPlugin(descriptor: PluginDescriptor): void {
    const newState: PluginState = Object.freeze({ status: "pending" });

    this.plugins.set(descriptor.id, {
      descriptor,
      state: newState,
    });
    this.notifyStateChange();
  }

  getState(): Accessor<RegistryState> {
    return this._stateSignal[0];
  }

  getMetadata(): ReadonlyMap<PluginId, PluginMetadata> {
    const result = new Map<PluginId, PluginMetadata>();
    for (const [id, plugin] of this.plugins) {
      result.set(id, {
        id,
        route: plugin.descriptor.route,
        sidebar: plugin.descriptor.sidebar,
      });
    }
    return result;
  }

  buildInitializeAllEffect(): Effect.Effect<InitializeAllResult, never> {
    const registry = this;

    return Effect.gen(function* () {
      const pendingPlugins: Array<{ id: PluginId; descriptor: PluginDescriptor }> = [];
      for (const [id, plugin] of registry.plugins) {
        if (plugin.state.status === "pending") {
          pendingPlugins.push({ id, descriptor: plugin.descriptor });
        }
      }

      if (pendingPlugins.length === 0) {
        return { ok: true as const, failures: new Map() };
      }

      for (const { id, descriptor } of pendingPlugins) {
        const initializingState: PluginState = Object.freeze({ status: "initializing" });
        registry.plugins.set(id, { descriptor, state: initializingState });
      }
      registry.notifyStateChange();

      const initEffects = pendingPlugins.map(({ descriptor }) => descriptor.initialize);

      const exitResults = yield* Effect.promise(() =>
        Promise.all(initEffects.map((eff) => Effect.runPromiseExit(eff))),
      );

      const failures = new Map<PluginId, AppError>();
      for (let i = 0; i < pendingPlugins.length; i++) {
        const { id, descriptor } = pendingPlugins[i];
        const exit = exitResults[i];

        if (exit._tag === "Failure") {
          const cause = exit.cause;
          const appError = cause._tag === "Fail" ? cause.error : new Unknown({ message: String(cause) });
          const newState: PluginState = Object.freeze({ status: "failed", error: appError });
          registry.plugins.set(id, { descriptor, state: newState });
          failures.set(id, appError);
        } else {
          const newState: PluginState = Object.freeze({ status: "ready" });
          registry.plugins.set(id, { descriptor, state: newState });
        }
      }

      registry.notifyStateChange();

      return { ok: true as const, failures };
    });
  }

  private notifyStateChange(): void {
    const pluginStates = new Map<PluginId, PluginState>();
    for (const [id, plugin] of this.plugins) {
      pluginStates.set(id, plugin.state);
    }
    this._stateSignal[1]({ plugins: pluginStates });
  }

  _resetForTest(): void {
    const pendingState: PluginState = Object.freeze({ status: "pending" });
    for (const [id, plugin] of this.plugins) {
      this.plugins.set(id, { descriptor: plugin.descriptor, state: pendingState });
    }
    this.notifyStateChange();
  }

  _registerForTest(descriptor: PluginDescriptor): void {
    const pendingState: PluginState = Object.freeze({ status: "pending" });
    this.plugins.delete(descriptor.id);
    this.plugins.set(descriptor.id, {
      descriptor,
      state: pendingState,
    });
    this.notifyStateChange();
  }
}


export const pluginRegistry = new PluginRegistryImpl();


export const getRegistryState = (): Accessor<RegistryState> => pluginRegistry.getState();

export const getPluginMetadata = (): ReadonlyMap<PluginId, PluginMetadata> =>
  pluginRegistry.getMetadata();

export const initializeAll = (): Effect.Effect<InitializeAllResult, never> =>
  pluginRegistry.buildInitializeAllEffect();

export type { PluginStatus } from "./plugin-registry.types";
