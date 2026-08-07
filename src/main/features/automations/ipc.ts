// ADR-0053 TC — ipc.ts (Main 端)
// IPC handlers for automations — delegates to service.ts
import { ipcMain } from "electron";
import { runMain } from "../../runtime.js";
import {
  listRules,
  createRule,
  updateRule,
  deleteRule,
  toggleRule,
  runNow,
  runMissed,
  listExecutions,
  getExecution,
} from "./service.js";
import type { AutomationRule, AutomationId } from "../../../shared/lib/automation-types";
import type { AutomationExecutionStatus } from "./db.js";

export function registerAutomationIpc(): void {
  // automations:list
  ipcMain.handle("automations:list", async () => {
    return runMain(listRules());
  });

  // automations:create
  ipcMain.handle(
    "automations:create",
    async (_e, rule: AutomationRule) => {
      return runMain(createRule(rule));
    },
  );

  // automations:update
  ipcMain.handle(
    "automations:update",
    async (_e, rule: AutomationRule) => {
      return runMain(updateRule(rule));
    },
  );

  // automations:delete
  ipcMain.handle(
    "automations:delete",
    async (_e, args: { id: AutomationId }) => {
      return runMain(deleteRule(args.id));
    },
  );

  // automations:toggle
  ipcMain.handle(
    "automations:toggle",
    async (_e, args: { id: AutomationId; enabled: boolean }) => {
      return runMain(toggleRule(args.id, args.enabled));
    },
  );

  // automations:run-now
  ipcMain.handle(
    "automations:run-now",
    async (_e, args: { id: AutomationId }) => {
      return runMain(runNow(args.id));
    },
  );

  // automations:list-executions
  ipcMain.handle(
    "automations:list-executions",
    async (_e, args: { ruleId?: AutomationId; status?: AutomationExecutionStatus; limit?: number; offset?: number }) => {
      return runMain(listExecutions(args));
    },
  );

  // automations:get-execution
  ipcMain.handle(
    "automations:get-execution",
    async (_e, args: { id: string }) => {
      return runMain(getExecution(args.id));
    },
  );

  // automations:run-missed
  ipcMain.handle(
    "automations:run-missed",
    async (_e, args: { id: AutomationId }) => {
      return runMain(runMissed(args.id));
    },
  );
}
