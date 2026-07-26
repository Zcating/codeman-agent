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

import { type Accessor } from "solid-js";
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

  constructor() {
    // Register built-in plugins with their metadata.
    // The actual initialize effects are provided by the stores (skills/mcp)
    // to avoid circular imports. These are placeholders - real effects injected
    // by the stores when they call _updateInitializeEffect.
    this.registerBuiltin({
      id: "skills",
      initialize: Effect.void,
      route: { path: "/plugins/skills", label: "Skills" },
      sidebar: { icon: "book", order: 3, visible: true },
    });
    this.registerBuiltin({
      id: "mcp",
      initialize: Effect.void,
      route: { path: "/plugins/mcp", label: "MCP" },
      sidebar: { icon: "plug", order: 4, visible: true },
    });
  }

  private registerBuiltin(descriptor: PluginDescriptor): void {
    const pendingState: PluginState = Object.freeze({ status: "pending" });
    this.plugins.set(descriptor.id, {
      descriptor,
      state: pendingState,
    });
  }

  register(descriptor: PluginDescriptor): void {
    if (this.plugins.has(descriptor.id)) {
      // Idempotent: already registered, do not overwrite
      return;
    }
    const pendingState: PluginState = Object.freeze({ status: "pending" });
    this.plugins.set(descriptor.id, {
      descriptor,
      state: pendingState,
    });
  }

  getState(): Accessor<RegistryState> {
    return () => ({ plugins: this.buildPluginStates() });
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
   * Updates the initialize effect for a registered plugin.
   * Used by plugin stores to inject their actual initialization logic.
   */
  _updateInitializeEffect(id: PluginId, initialize: Effect.Effect<void, AppError>): void {
    const plugin = this.plugins.get(id);
    if (plugin) {
      this.plugins.set(id, {
        descriptor: { ...plugin.descriptor, initialize },
        state: plugin.state,
      });
    }
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

      // Transition pending plugins to initializing and collect effects
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

      return { ok: true as const, failures };
    });
  }

  private buildPluginStates(): PluginStates {
    const result = new Map<PluginId, PluginState>();
    for (const [id, plugin] of this.plugins) {
      result.set(id, plugin.state);
    }
    return result;
  }

  _resetForTest(): void {
    const pendingState: PluginState = Object.freeze({ status: "pending" });
    for (const [id, plugin] of this.plugins) {
      this.plugins.set(id, { descriptor: plugin.descriptor, state: pendingState });
    }
  }

  _registerForTest(descriptor: PluginDescriptor): void {
    // For tests: remove existing and re-register with new descriptor
    const pendingState: PluginState = Object.freeze({ status: "pending" });
    this.plugins.delete(descriptor.id);
    this.plugins.set(descriptor.id, {
      descriptor,
      state: pendingState,
    });
  }
}

// ─── Singleton registry instance ────────────────────────────────────────────

export const pluginRegistry = new PluginRegistryImpl();

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns a Solid accessor for the current registry state.
 * The accessor returns a frozen snapshot; individual plugin states are also frozen.
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
