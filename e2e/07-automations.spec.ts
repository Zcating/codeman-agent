import { test, expect, assert, invoke, type TauriPage } from "./fixtures";
import type { AutomationRule, AutomationExecution } from "../src/shared/lib/automation-types";
import type { Settings } from "../src/renderer/shared/lib/types";

const uuid = () =>
  `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function getDefaultProvider(page: TauriPage): Promise<{ providerId: string; modelId: string }> {
  const settings = await invoke<Settings>(page, "getSettings");
  const provider = (settings.providers ?? []).find((p) => p.enabled && p.llm?.models?.length);
  if (!provider || !provider.llm?.models?.length) {
    throw new Error("No enabled provider with models found — ensure at least one provider is configured before running automations e2e");
  }
  return { providerId: provider.id, modelId: provider.llm.models[0].id };
}

async function createWorkspace(page: TauriPage, label = `ws-${uuid()}`) {
  const root = `/tmp/codeman-e2e-automations-${process.pid}-${uuid()}`;
  return invoke<{ id: string }>(page, "addWorkspace", { label, rootPath: root });
}

async function cleanupAutomations(page: TauriPage): Promise<void> {
  const rules = await invoke<AutomationRule[]>(page, "automations:list");
  for (const rule of rules) {
    try {
      await invoke(page, "automations:delete", { id: rule.id });
    } catch { }
  }
}

test.describe("07 — Automations", () => {
  test.beforeEach(async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    await cleanupAutomations(page);
  });

  test.afterEach(async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    await cleanupAutomations(page);
  });

  test("S1: Plugin tab visible + rule creation via IPC + rule appears in list", async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    const { providerId, modelId } = await getDefaultProvider(page);
    const ws = await createWorkspace(page);
    await page.goto("/plugins/automations");
    await assert.visible(page.locator("h2"), { timeout: 15_000 });
    await assert.visible(
      page.locator("h2").filter({ hasText: /automations/i }),
      { timeout: 5_000 },
    );

    const rule: AutomationRule = {
      id: uuid(),
      name: `LLM Rule ${uuid()}`,
      enabled: true,
      schedule: { kind: "interval", everyMs: 60_000 },
      action: {
        kind: "llm",
        systemPrompt: "You are a helpful assistant.",
        userPrompt: "Say hello in one word.",
        providerId,
        modelId,
        timeoutMs: 30_000,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await invoke(page, "automations:create", { rule });
    const rules = await invoke<AutomationRule[]>(page, "automations:list");
    expect(
      rules.some((r) => r.id === rule.id),
      "Created rule should appear in automations:list",
    ).toBe(true);

    const listRules = await invoke<AutomationRule[]>(page, "automations:list");
    expect(
      listRules.some((r) => r.id === rule.id),
      "Created rule should appear via automations:list IPC channel",
    ).toBe(true);
  });

  test.skip("S1-Timing: 1 min interval fires twice + execution history shows 2 records", async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    const { providerId, modelId } = await getDefaultProvider(page);
    await createWorkspace(page);

    const rule: AutomationRule = {
      id: uuid(),
      name: `Interval 1min ${uuid()}`,
      enabled: true,
      schedule: { kind: "interval", everyMs: 60_000 },
      action: {
        kind: "llm",
        systemPrompt: "You are a test assistant.",
        userPrompt: "Reply with OK.",
        providerId,
        modelId,
        timeoutMs: 30_000,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await invoke(page, "automations:create", { rule });
    await new Promise((r) => setTimeout(r, 125_000));

    const executions = await invoke<AutomationExecution[]>(page, "automations:list-executions", { ruleId: rule.id, limit: 10 });
    expect(executions.length, "After 2×1min intervals, at least 2 executions should be recorded").toBeGreaterThanOrEqual(2);
  });

  test.skip("S2: Missed run detection — app closed 5 min, restarted, shows 'missed' status + Run now", async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    const { providerId, modelId } = await getDefaultProvider(page);

    const rule: AutomationRule = {
      id: uuid(),
      name: `Missed Run Test ${uuid()}`,
      enabled: true,
      schedule: { kind: "interval", everyMs: 300_000 },
      action: {
        kind: "llm",
        systemPrompt: "You are a test assistant.",
        userPrompt: "Reply with OK.",
        providerId,
        modelId,
        timeoutMs: 30_000,
      },
      createdAt: Date.now() - 600_000,
      updatedAt: Date.now(),
    };

    await invoke(page, "automations:create", { rule });
    await new Promise((r) => setTimeout(r, 5_000));

    const executions = await invoke<AutomationExecution[]>(page, "automations:list-executions", { ruleId: rule.id, limit: 5 });
    const missed = executions.filter((e) => e.status === "missed");
    expect(missed.length, "At least one execution should have status=missed after 5 min gap").toBeGreaterThan(0);

    await invoke(page, "automations:run-missed", { id: rule.id });
    await new Promise((r) => setTimeout(r, 3_000));
    const afterMissed = await invoke<AutomationExecution[]>(page, "automations:list-executions", { ruleId: rule.id, limit: 5 });
    const manualReplay = afterMissed.filter((e) => e.triggerKind === "missed-replay");
    expect(manualReplay.length, "After Run now, a missed-replay execution should appear").toBeGreaterThan(0);
  });

  test("S3: Script action — in-workspace success + out-of-workspace SandboxViolation", async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    const ws = await createWorkspace(page, `ws-script-${uuid()}`);

    const inWorkspaceRule: AutomationRule = {
      id: uuid(),
      name: `Script In-WS ${uuid()}`,
      enabled: true,
      schedule: { kind: "interval", everyMs: 60_000 },
      action: {
        kind: "script",
        language: "shell",
        source: "echo 'hello from automations'",
        workspaceId: ws.id,
        timeoutMs: 10_000,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await invoke(page, "automations:create", { rule: inWorkspaceRule });
    await invoke(page, "automations:run-now", { id: inWorkspaceRule.id });
    await new Promise((r) => setTimeout(r, 5_000));

    const inWorkspaceExecs = await invoke<AutomationExecution[]>(page, "automations:list-executions", { ruleId: inWorkspaceRule.id, limit: 5 });
    const inWorkspaceSuccess = inWorkspaceExecs.filter((e) => e.status === "success");
    expect(inWorkspaceSuccess.length, "Script action within workspace should succeed").toBeGreaterThan(0);

    const outWorkspaceRule: AutomationRule = {
      id: uuid(),
      name: `Script Out-Of-WS ${uuid()}`,
      enabled: true,
      schedule: { kind: "interval", everyMs: 60_000 },
      action: {
        kind: "script",
        language: "shell",
        source: "echo 'should not run'; cat /etc/passwd",
        workspaceId: "/etc",
        timeoutMs: 10_000,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await invoke(page, "automations:create", { rule: outWorkspaceRule });
    await invoke(page, "automations:run-now", { id: outWorkspaceRule.id });
    await new Promise((r) => setTimeout(r, 5_000));

    const outWorkspaceExecs = await invoke<AutomationExecution[]>(page, "automations:list-executions", { ruleId: outWorkspaceRule.id, limit: 5 });
    const outWorkspaceFailure = outWorkspaceExecs.filter((e) => e.status === "failure" && (e.error ?? "").toLowerCase().includes("sandbox"));
    expect(outWorkspaceFailure.length, "Script action outside workspace should fail with SandboxViolation").toBeGreaterThan(0);
  });

  test.skip("S4: Reentrancy — 30s interval rule with 60s timeout, two rapid triggers, second skipped", async ({ tauriEnv }) => {
    const { page } = tauriEnv;
    const { providerId, modelId } = await getDefaultProvider(page);

    const rule: AutomationRule = {
      id: uuid(),
      name: `Reentrancy ${uuid()}`,
      enabled: true,
      schedule: { kind: "interval", everyMs: 30_000 },
      action: {
        kind: "llm",
        systemPrompt: "You are a slow test assistant. Sleep for 45 seconds then reply OK.",
        userPrompt: "Wait 45 seconds then say done.",
        providerId,
        modelId,
        timeoutMs: 60_000,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await invoke(page, "automations:create", { rule });
    await invoke(page, "automations:run-now", { id: rule.id });
    await new Promise((r) => setTimeout(r, 2_000));
    await invoke(page, "automations:run-now", { id: rule.id });
    await new Promise((r) => setTimeout(r, 70_000));

    const allExecs = await invoke<AutomationExecution[]>(page, "automations:list-executions", { ruleId: rule.id, limit: 10 });
    const skipped = allExecs.filter((e) => e.status === "skipped");
    expect(skipped.length, "Second reentrant trigger should be queued and eventually show skipped (queue head still running)").toBeGreaterThan(0);
  });
});
