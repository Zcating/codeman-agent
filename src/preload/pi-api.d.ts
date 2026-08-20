export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface PiSessionMeta {
  sessionId: string;
  sessionFile?: string;
  cwd?: string;
  createdAt?: number;
}

export interface PiApi {
  createSession: (opts?: { cwd?: string }) => Promise<{ sessionId: string; sessionFile: string }>;
  prompt: (opts: { sessionId: string; text: string; thinkingLevel?: ThinkingLevel }) => Promise<{ ok: boolean }>;
  abort: (sessionId: string) => Promise<{ ok: boolean }>;
  openSession: (path: string) => Promise<{ sessionId: string }>;
  listSessions: (opts?: { cwd?: string }) => Promise<readonly PiSessionMeta[]>;
  closeSession: (sessionId: string) => Promise<{ ok: boolean }>;
}
