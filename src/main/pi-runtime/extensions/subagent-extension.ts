import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  createAgentSession,
  SessionManager,
  ModelRuntime,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

export const delegateTaskTool = defineTool({
  name: "delegate_task",
  label: "Delegate Task",
  description:
    "Delegate a task to a specialized sub-agent running in isolation. " +
    "The sub-agent gets a fresh context and its own model configuration. " +
    "Parameters: agentType (the sub-agent type), prompt (what to do), cwd (optional working directory).",
  parameters: Type.Object({
    agentType: Type.String({ description: "Type/name of the sub-agent to delegate to" }),
    prompt: Type.String({ description: "Task description for the sub-agent" }),
    cwd: Type.Optional(Type.String({ description: "Working directory for the sub-agent (defaults to current)" })),
  }),
  async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
    const cwd = params.cwd ?? process.cwd();

    try {
      const modelRuntime = await ModelRuntime.create();
      const settingsManager = SettingsManager.create(cwd, cwd);
      const sessionManager = SessionManager.create(cwd, cwd);

      const { session } = await createAgentSession({
        cwd,
        sessionManager,
        modelRuntime,
        settingsManager,
        tools: ["read", "bash", "grep", "find", "ls"],
      });

      session.subscribe(() => {});
      await session.prompt(params.prompt);

      session.dispose();

      return {
        content: [
          {
            type: "text",
            text: `Delegated to ${params.agentType} in ${cwd}`,
          },
        ],
        details: { agentType: params.agentType, cwd, sessionId: session.sessionId, sessionFile: session.sessionFile },
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Delegate failed: ${(e as Error).message}` }],
        details: { agentType: params.agentType, cwd, error: (e as Error).message },
      };
    }
  },
});

export default function subagentExtension(pi: ExtensionAPI): void {
  pi.registerTool(delegateTaskTool);
}
