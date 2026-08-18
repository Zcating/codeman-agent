import { Context, Deferred, Effect, Layer } from "effect";

export class RejectedError extends Error {
  readonly _tag = "RejectedError";
  constructor(message = "用户拒绝执行") {
    super(message);
    this.name = "RejectedError";
  }
}

export class NotFoundError extends Error {
  readonly _tag = "NotFoundError";
  constructor(message = "Permission request not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export interface AskInput {
  readonly sessionID: string;
  readonly tool: string;
  readonly command: string;
  readonly cwd: string;
  readonly risk: {
    readonly kind: "low" | "high";
    readonly reasons: Array<{ tag: string; message: string }>;
  };
}

export interface ReplyInput {
  readonly requestID: string;
  readonly reply: "once" | "always" | "reject";
}

interface PendingEntry {
  readonly info: AskInput & { requestID: string };
  readonly deferred: Deferred.Deferred<undefined, RejectedError>;
}

export interface PermissionService {
  readonly ask: (input: AskInput) => Effect.Effect<void, RejectedError>;
  readonly reply: (input: ReplyInput) => Effect.Effect<void, NotFoundError>;
  readonly list: () => ReadonlyArray<AskInput & { requestID: string }>;
}

export class PermissionServiceTag extends Context.Tag("PermissionService")<PermissionService, PermissionService>() {}

const state = {
  pending: new Map<string, PendingEntry>(),
  approved: new Map<string, Array<{ permission: string; action: "allow" }>>(),
};

const emit = (channel: string, payload: unknown): void => {
  try {
    const { BrowserWindow } = require("electron");
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, payload);
        return;
      }
    }
  } catch {}
};

export const PermissionServiceLive = Layer.succeed(PermissionServiceTag, {
  ask: (input) =>
    Effect.gen(function* () {
      const requestID = crypto.randomUUID();
      const deferred = yield* Deferred.make<undefined, RejectedError>();
      const entry: PendingEntry = {
        info: { ...input, requestID },
        deferred,
      };
      state.pending.set(requestID, entry);

      if (input.risk.kind === "low") {
        yield* Deferred.succeed(deferred, undefined);
        state.pending.delete(requestID);
        return;
      }

      emit("runCommand:permission:asked", { ...input, requestID });

      return yield* Effect.ensuring(
        Deferred.await(deferred),
        Effect.sync(() => {
          state.pending.delete(requestID);
        }),
      );
    }),

  reply: (input) =>
    Effect.gen(function* () {
      const entry = state.pending.get(input.requestID);
      if (!entry) return yield* Effect.fail(new NotFoundError());

      state.pending.delete(input.requestID);

      if (input.reply === "always") {
        const list = state.approved.get(entry.info.tool) ?? [];
        state.approved.set(entry.info.tool, [...list, { permission: entry.info.command, action: "allow" }]);
      }

      if (input.reply === "reject") {
        yield* Deferred.fail(entry.deferred, new RejectedError());
        for (const [id, other] of state.pending) {
          if (other.info.sessionID === entry.info.sessionID) {
            state.pending.delete(id);
            yield* Deferred.fail(other.deferred, new RejectedError());
          }
        }
      } else {
        yield* Deferred.succeed(entry.deferred, undefined);
      }

      emit("runCommand:permission:replied", { requestID: input.requestID, reply: input.reply });
    }),

  list: () => {
    return Array.from(state.pending.values()).map((e) => e.info);
  },
} as PermissionService);
