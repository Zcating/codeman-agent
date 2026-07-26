//! Plugin registry types — ADR-0035 / plugin-registry-startup-initialization.md Task A.
//
// Re-exports and type definitions for the plugin registry public API.

// ─── Plugin status ─────────────────────────────────────────────────────────

/** Discriminated plugin lifecycle status. */
export type PluginStatus = "pending" | "initializing" | "ready" | "failed";

// ─── Re-exports from main module ────────────────────────────────────────────

export type {
  PluginDescriptor,
  PluginRouteMetadata,
  PluginSidebarMetadata,
  PluginState,
  PluginStates,
  RegistryState,
  PluginMetadata,
  InitializeAllResult,
} from "./plugin-registry";
