// SkillsSection — `/settings/skills` route component tests.
//
// Verifies:
// - No refresh button (data-testid="skills-refresh") is rendered
// - No "Refresh" label is rendered
// - Skills list renders with toggles when skills exist
// - Empty state renders when no skills exist
// - Empty state copy mentions startup scanning, not refresh

import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@solidjs/testing-library";
import { Effect } from "effect";
import { SkillsSection } from "@codeman-frontend/features/settings/routes/sections/skills-section";
import { mockState, SettingsV15 } from "@codeman-frontend/__mocks__/ipc-mock";
import type { SkillManifest } from "@codeman-frontend/shared/lib/types";

import { appStore, _resetAppStoreForTest } from "@codeman-frontend/shared/stores/app.store";

// Mock solid-js/store — SkillsSection imports appStore, appStore uses createStore.
// jsdom lacks Solid reactive context, this mock provides minimal proxy.
vi.mock("solid-js/store", () => {
  let store: { value: unknown } = { value: null };
  const setStore = vi.fn((...args: unknown[]) => {
    const updater = args.length === 2 ? args[1] : args[0];
    if (typeof updater === "function") {
      store.value = (updater as (prev: unknown) => unknown)(store.value);
    } else {
      store.value = updater;
    }
  });
  const storeProxy = new Proxy(store, {
    get(t, p) {
      if (p === "value") {return store.value;}
      return (t as any)[p];
    },
    set(t, p, v) {
      if (p === "value") {
        store.value = v;
        return true;
      }
      (t as any)[p] = v;
      return true;
    },
  });
  return { createStore: () => [storeProxy, setStore] };
});

// Mock skills store — intercepts setManifests to keep manifests in memory
// so the signal reflects what we set via mockState.
let _manifests: SkillManifest[] = [];
vi.mock("@codeman-frontend/plugins/skills/stores/skills.store", () => {
  return {
    skillsManifests$: () => _manifests,
    setManifests: (next: SkillManifest[]) => { _manifests = next; },
    refreshManifests: vi.fn(),
    resetManifests: vi.fn(),
    _resetSkillsStoreForTest: () => { _manifests = []; },
  };
});

const baseSettings: SettingsV15 = {
  providers: [],
  schemaVersion: "1.5",
  defaultLlmProviderId: "minimax",
  userLanguage: "en",
  theme: "dark",
  startAtLogin: false,
  window: {
    rememberPosition: true,
    rememberSize: true,
    defaultSize: { width: 800, height: 600 },
    minSize: { width: 600, height: 400 },
  },
  systemPrompt: { default: "You are a helpful assistant.", userCanEdit: true },
  conversations: { autoArchiveAfterDays: 30, maxHistory: 1000 },
  llmProviders: [],
};

const mockSkill: SkillManifest = {
  name: "test-skill",
  description: "A test skill for validation",
  source: "user",
  path: "/Users/test/.agents/skills/test-skill/SKILL.md",
};

describe("SkillsSection — /settings/skills", () => {
  beforeEach(async () => {
    _resetAppStoreForTest();
    _manifests = [];
    mockState.settings = {
      ...baseSettings,
      enabledSkills: [],
    };
    mockState.resolved = undefined;
    mockState.v0FixtureActive = false;
    await Effect.runPromise(appStore.refresh());
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("does NOT render refresh button (data-testid='skills-refresh')", async () => {
    _manifests = [mockSkill];
    render(() => <SkillsSection />);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.queryByTestId("skills-refresh")).not.toBeInTheDocument();
  });

  it("does NOT render 'Refresh' label", async () => {
    _manifests = [mockSkill];
    render(() => <SkillsSection />);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.queryByText(/^Refresh$/i)).not.toBeInTheDocument();
  });

  it("renders skills list with toggle when skills exist", async () => {
    _manifests = [mockSkill];
    render(() => <SkillsSection />);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.getByText("test-skill")).toBeInTheDocument();
    expect(screen.getByTestId("skill-toggle-test-skill")).toBeInTheDocument();
  });

  it("renders source badge for user skill", async () => {
    _manifests = [mockSkill];
    render(() => <SkillsSection />);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.getByText("User")).toBeInTheDocument();
  });

  it("renders source badge for preinstalled skill", async () => {
    _manifests = [{ ...mockSkill, source: "preinstalled" as const }];
    render(() => <SkillsSection />);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.getByText("Pre-installed")).toBeInTheDocument();
  });

  it("renders empty state when no skills found", async () => {
    _manifests = [];
    render(() => <SkillsSection />);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.getByText(/No skills found/i)).toBeInTheDocument();
  });

  it("empty state copy mentions startup scanning, not refresh", async () => {
    _manifests = [];
    render(() => <SkillsSection />);
    await new Promise((resolve) => setTimeout(resolve, 10));
    // Should NOT contain refresh instruction
    expect(screen.queryByText(/Click Refresh/i)).not.toBeInTheDocument();
    // Should mention startup scanning
    expect(screen.getByText(/startup/i)).toBeInTheDocument();
  });

  it("renders skill description and path", async () => {
    _manifests = [mockSkill];
    render(() => <SkillsSection />);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.getByText("A test skill for validation")).toBeInTheDocument();
    expect(screen.getByText(/\/Users\/test\/\.agents\/skills\/test-skill\/SKILL\.md/i)).toBeInTheDocument();
  });
});
