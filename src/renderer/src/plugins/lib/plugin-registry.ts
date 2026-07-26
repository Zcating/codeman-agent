//! Plugin registry core — ADR-0035 / plugin-registry-startup-initialization.md Task A.
//!
//! Manages renderer-side plugin lifecycle: explicit registration, parallel
//! initialization, per-plugin failure capture, idempotent ready behavior, and
//! Solid readonly status accessor.
//!
//! Registry does NOT:
//! - Perform dynamic module discovery
//! - Provide dispose/retry APIs
//! - Aggregate tools or prompts
//! - Depend on concrete skills/MCP stores (avoids circular imports)

import { createSignal, type Accessor } from "solid-js";
import { Effect } from "effect";
import { Unknown, type AppError } from "@codeman-frontend/shared/lib/errors";

// ─── Plugin descriptor ──────────────────────────────────────────────────────

/**
 * Stable plugin identifier (e.g. "skills", "mcp").
 * Used as registry key, log prefix, and test assertion anchor.
 */
export type PluginId = string;

/**
 * Route metadata for plugin navigation.
 */
export interface PluginRouteMetadata {
  readonly path: string;
  readonly label: string;
}

/**
 * Sidebar metadata for plugin visibility and ordering.
 */
export interface PluginSidebarMetadata {
  readonly icon: string;
  readonly order: number;
  readonly visible: boolean;
}

/**
 * Plugin descriptor — the contract that each plugin must satisfy.
 * Later descriptor work will extend this with richer capabilities.
 */
export interface PluginDescriptor {
  /** Stable, unique plugin identifier. */
  readonly id: PluginId;
  /**
   * Plugin initialization effect.
   * Must return `Effect<void, AppError>` — failure is captured per-plugin
   * and does not block other plugins or the overall `initializeAll`.
   */
  readonly initialize: Effect.Effect<void, AppError>;
  /** Route metadata for navigation. */
  readonly route: PluginRouteMetadata;
  /** Sidebar metadata for plugin visibility and ordering. */
  readonly sidebar: PluginSidebarMetadata;
}

// ─── Plugin state ───────────────────────────────────────────────────────────

/** Discriminated union of possible plugin states. */
export type PluginState =
  | { readonly status: "pending" }
  | { readonly status: "initializing" }
  | { readonly status: "ready" }
  | { readonly status: "failed"; readonly error: AppError };

/** Readonly map of plugin states keyed by plugin id. */
export type PluginStates = ReadonlyMap<PluginId, PluginState>;

// ─── Registry state ──────────────────────────────────────────────────────────

/** Full registry state exposed via Solid accessor. */
export interface RegistryState {
  readonly plugins: PluginStates;
}

/** Plugin metadata (immutable, not affected by runtime state). */
export interface PluginMetadata {
  readonly id: PluginId;
  readonly route: PluginRouteMetadata;
  readonly sidebar: PluginSidebarMetadata;
}

// ─── Registry result ─────────────────────────────────────────────────────────

/**
 * Result of `initializeAll` — always succeeds after all plugins settle,
 * regardless of individual plugin outcomes.
 */
export interface InitializeAllResult {
  readonly ok: true;
  /** Plugins that failed during initialization. */
  readonly failures: ReadonlyMap<PluginId, AppError>;
}

// ─── Internal registry ───────────────────────────────────────────────────────

interface InternalPlugin {
  readonly descriptor: PluginDescriptor;
  state: PluginState;
}

class PluginRegistryImpl {
  private plugins = new Map<PluginId, InternalPlugin>();

  // Module-owned Solid signal for reactive state updates
  private _stateSignal = createSignal<RegistryState>({ plugins: new Map() });

  constructor() {
    // Register built-in plugins with their metadata and proper icons.
    // The actual initialize effects are provided by the stores (skills/mcp)
    // to avoid circular imports. Callers use registerPlugin to inject real effects.
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

  /**
   * Public registration API — allows replacing a plugin's descriptor/initialize effect.
   * Use this to inject the actual initialize effect from plugin stores.
   */
  registerPlugin(descriptor: PluginDescriptor): void {
    // Always reset to pending when explicitly replacing via public API
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

  /**
   * Builds the initializeAll effect.
   * Runs all pending plugins in parallel, skipping already-ready plugins (idempotent).
   */
  buildInitializeAllEffect(): Effect.Effect<InitializeAllResult, never> {
    const registry = this;

    return Effect.gen(function* () {
      // Build list of plugins that need initialization (pending only)
      const pendingPlugins: Array<{ id: PluginId; descriptor: PluginDescriptor }> = [];
      for (const [id, plugin] of registry.plugins) {
        if (plugin.state.status === "pending") {
          pendingPlugins.push({ id, descriptor: plugin.descriptor });
        }
      }

      // If no pending plugins, return early (all already ready)
      if (pendingPlugins.length === 0) {
        return { ok: true as const, failures: new Map() };
      }

      // FIX 1: Set ALL pending plugins to frozen "initializing" state BEFORE Promise.all
      for (const { id, descriptor } of pendingPlugins) {
        const initializingState: PluginState = Object.freeze({ status: "initializing" });
        registry.plugins.set(id, { descriptor, state: initializingState });
      }
      // Notify state change after transitioning to initializing
      registry.notifyStateChange();

      // Collect initialize effects for all pending plugins
      const initEffects = pendingPlugins.map(({ descriptor }) => descriptor.initialize);

      // Run all in parallel using Promise.all and collect exit results
      const exitResults = yield* Effect.promise(() =>
        Promise.all(initEffects.map((eff) => Effect.runPromiseExit(eff))),
      );

      // Process results and update plugin states with frozen objects
      const failures = new Map<PluginId, AppError>();
      for (let i = 0; i < pendingPlugins.length; i++) {
        const { id, descriptor } = pendingPlugins[i];
        const exit = exitResults[i];

        if (exit._tag === "Failure") {
          // Failed - extract AppError from cause
          const cause = exit.cause;
          const appError = cause._tag === "Fail" ? cause.error : new Unknown({ message: String(cause) });
          // Create new frozen state object
          const newState: PluginState = Object.freeze({ status: "failed", error: appError });
          registry.plugins.set(id, { descriptor, state: newState });
          failures.set(id, appError);
        } else {
          // Succeeded - create new frozen state object
          const newState: PluginState = Object.freeze({ status: "ready" });
          registry.plugins.set(id, { descriptor, state: newState });
        }
      }

      // Notify final state change
      registry.notifyStateChange();

      return { ok: true as const, failures };
    });
  }

  private notifyStateChange(): void {
    // Build fresh state and update the signal
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

  // For test use only - allows replacing a plugin for testing
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

// ─── Singleton registry instance ────────────────────────────────────────────

export const pluginRegistry = new PluginRegistryImpl();

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns a Solid accessor for the current registry state.
 * Returns the same accessor instance — subscribers observe transitions.
 */
export const getRegistryState = (): Accessor<RegistryState> => pluginRegistry.getState();

/**
 * Returns immutable plugin metadata (route/sidebar) keyed by plugin id.
 * Does not depend on runtime state.
 */
export const getPluginMetadata = (): ReadonlyMap<PluginId, PluginMetadata> =>
  pluginRegistry.getMetadata();

/**
 * Initializes all registered plugins in parallel.
 * Each plugin failure is captured in the result's `failures` map.
 * The returned Effect always succeeds after all plugins settle.
 */
export const initializeAll = (): Effect.Effect<InitializeAllResult, never> =>
  pluginRegistry.buildInitializeAllEffect();

// Re-export types
export type { PluginStatus } from "./plugin-registry.types";
