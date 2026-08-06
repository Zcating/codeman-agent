
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@solidjs/testing-library";
import { Effect } from "effect";
import { SkillsSection } from "@codeman-frontend/features/settings/routes/sections/skills-section";
import { mockState } from "@codeman-frontend/__mocks__/ipc-mock";
import type { SkillManifest } from "@codeman-frontend/shared/lib/types";

import { appStore, _resetAppStoreForTest } from "@codeman-frontend/shared/stores/app.store";

vi.mock("@codeman-frontend/features/settings/lib/settings-saver", () => ({
  settingsSaver: { scheduleSave: vi.fn() },
}));

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
      return Reflect.get(t, p);
    },
    set(t, p, v) {
      if (p === "value") {
        store.value = v;
        return true;
      }
      return Reflect.set(t, p, v);
    },
  });
  return { createStore: () => [storeProxy, setStore] };
});

let _manifests: SkillManifest[] = [];
vi.mock("@codeman-frontend/plugins/skills/stores/skills.store", () => {
  return {
    skillsManifests$: () => _manifests,
    setManifests: (next: SkillManifest[]) => { _manifests = next; },
    resetManifests: vi.fn(),
    _resetSkillsStoreForTest: () => { _manifests = []; },
  };
});

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
    expect(screen.queryByText(/Click Refresh/i)).not.toBeInTheDocument();
    expect(screen.getByText(/startup/i)).toBeInTheDocument();
  });

  it("renders skill description and path", async () => {
    _manifests = [mockSkill];
    render(() => <SkillsSection />);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.getByText("A test skill for validation")).toBeInTheDocument();
    expect(screen.getByText(/\/Users\/test\/\.agents\/skills\/test-skill\/SKILL\.md/i)).toBeInTheDocument();
  });

  it("skill toggle checkbox is an input via data-testid", async () => {
    _manifests = [mockSkill];
    render(() => <SkillsSection />);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const input = screen.getByTestId("skill-toggle-test-skill");
    expect(input).toBeInstanceOf(HTMLInputElement);
    expect((input as HTMLInputElement).type).toBe("checkbox");
  });

  it("clicking skill toggle updates appStore.enabledSkills", async () => {
    _manifests = [mockSkill];
    render(() => <SkillsSection />);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const input = screen.getByTestId("skill-toggle-test-skill") as HTMLInputElement;
    const setSpy = vi.spyOn(appStore, "set");
    fireEvent.click(input);
    expect(setSpy).toHaveBeenCalled();
    const callArg = setSpy.mock.calls[0][0];
    expect(callArg).toHaveProperty("enabledSkills");
    expect(Array.isArray(callArg.enabledSkills)).toBe(true);
  });

  it("clicking skill toggle triggers settingsSaver.scheduleSave", async () => {
    const { settingsSaver } = await import("@codeman-frontend/features/settings/lib/settings-saver");
    _manifests = [mockSkill];
    render(() => <SkillsSection />);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const input = screen.getByTestId("skill-toggle-test-skill");
    fireEvent.click(input);
    expect(settingsSaver.scheduleSave).toHaveBeenCalled();
  });
});
