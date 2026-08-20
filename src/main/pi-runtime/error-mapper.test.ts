import { describe, expect, it } from "vitest";
import { mapPiError } from "./error-mapper.js";

describe("mapPiError", () => {
  describe("model_provider", () => {
    it("maps ModelProvider._tag to ModelProvider error", () => {
      const input = { _tag: "ModelProvider", message: "provider failed", statusCode: 500 };
      const result = mapPiError(input);
      expect(result._tag).toBe("ModelProvider");
    });

    it("maps CredentialSynchronizationError to CredentialStore error", () => {
      const err = new (class CredentialSynchronizationError extends Error {
        constructor() {
          super("credential sync failed");
          this.name = "CredentialSynchronizationError";
        }
      })();
      const result = mapPiError(err);
      expect(result._tag).toBe("CredentialStore");
    });
  });

  describe("model_auth", () => {
    it("maps ModelAuth._tag to ModelAuth error", () => {
      const input = { _tag: "ModelAuth", message: "auth failed" };
      const result = mapPiError(input);
      expect(result._tag).toBe("ModelAuth");
    });

    it("maps 401 status to ModelAuth error", () => {
      const input = { statusCode: 401, message: "unauthorized" };
      const result = mapPiError(input);
      expect(result._tag).toBe("ModelAuth");
    });

    it("maps AuthCommandError to ModelAuth error", () => {
      const err = new (class AuthCommandError extends Error {
        constructor() {
          super("auth command failed");
          this.name = "AuthCommandError";
        }
      })();
      const result = mapPiError(err);
      expect(result._tag).toBe("ModelAuth");
    });
  });

  describe("model_rate_limit", () => {
    it("maps ModelRateLimit._tag to ModelRateLimit error", () => {
      const input = { _tag: "ModelRateLimit", message: "rate limited" };
      const result = mapPiError(input);
      expect(result._tag).toBe("ModelRateLimit");
    });

    it("maps 429 status to ModelRateLimit error", () => {
      const input = { statusCode: 429, message: "too many requests" };
      const result = mapPiError(input);
      expect(result._tag).toBe("ModelRateLimit");
    });
  });

  describe("model_context_length", () => {
    it("maps ModelContextLength._tag to ModelContextLength error", () => {
      const input = { _tag: "ModelContextLength", message: "context too long" };
      const result = mapPiError(input);
      expect(result._tag).toBe("ModelContextLength");
    });

    it("maps 413 status to ModelContextLength error", () => {
      const input = { statusCode: 413, message: "payload too large" };
      const result = mapPiError(input);
      expect(result._tag).toBe("ModelContextLength");
    });
  });

  describe("model_timeout", () => {
    it("maps ModelTimeout._tag to ModelTimeout error", () => {
      const input = { _tag: "ModelTimeout", message: "timeout" };
      const result = mapPiError(input);
      expect(result._tag).toBe("ModelTimeout");
    });

    it("maps 504 status to ModelTimeout error", () => {
      const input = { statusCode: 504, message: "gateway timeout" };
      const result = mapPiError(input);
      expect(result._tag).toBe("ModelTimeout");
    });
  });

  describe("model_protocol", () => {
    it("maps ModelProtocol._tag to ModelProtocol error", () => {
      const input = { _tag: "ModelProtocol", message: "protocol error" };
      const result = mapPiError(input);
      expect(result._tag).toBe("ModelProtocol");
    });
  });

  describe("session_not_found", () => {
    it("maps SessionNotFound._tag to SessionNotFound error", () => {
      const input = { _tag: "SessionNotFound", message: "session not found" };
      const result = mapPiError(input);
      expect(result._tag).toBe("SessionNotFound");
    });

    it("maps SessionImportFileNotFoundError to SessionNotFound error", () => {
      const err = new (class SessionImportFileNotFoundError extends Error {
        constructor() {
          super("session file not found");
          this.name = "SessionImportFileNotFoundError";
        }
      })();
      const result = mapPiError(err);
      expect(result._tag).toBe("SessionNotFound");
    });
  });

  describe("session_permission", () => {
    it("maps SessionPermission._tag to SessionPermission error", () => {
      const input = { _tag: "SessionPermission", message: "permission denied" };
      const result = mapPiError(input);
      expect(result._tag).toBe("SessionPermission");
    });

    it("maps MissingSessionCwdError to SessionPermission error", () => {
      const err = new (class MissingSessionCwdError extends Error {
        constructor() {
          super("session cwd missing");
          this.name = "MissingSessionCwdError";
        }
      })();
      const result = mapPiError(err);
      expect(result._tag).toBe("SessionPermission");
    });
  });

  describe("session_filesystem", () => {
    it("maps SessionFilesystem._tag to SessionFilesystem error", () => {
      const input = { _tag: "SessionFilesystem", message: "filesystem error" };
      const result = mapPiError(input);
      expect(result._tag).toBe("SessionFilesystem");
    });
  });

  describe("tool_execute", () => {
    it("maps ToolExecute._tag to ToolExecute error", () => {
      const input = { _tag: "ToolExecute", message: "tool failed", toolName: "bash" };
      const result = mapPiError(input);
      expect(result._tag).toBe("ToolExecute");
    });
  });

  describe("tool_argument", () => {
    it("maps ToolArgument._tag to ToolArgument error", () => {
      const input = { _tag: "ToolArgument", message: "invalid args", toolName: "read" };
      const result = mapPiError(input);
      expect(result._tag).toBe("ToolArgument");
    });
  });

  describe("tool_unavailable", () => {
    it("maps ToolUnavailable._tag to ToolUnavailable error", () => {
      const input = { _tag: "ToolUnavailable", message: "tool not found", toolName: "foo" };
      const result = mapPiError(input);
      expect(result._tag).toBe("ToolUnavailable");
    });
  });

  describe("compaction", () => {
    it("maps Compaction._tag to Compaction error", () => {
      const input = { _tag: "Compaction", message: "compaction failed" };
      const result = mapPiError(input);
      expect(result._tag).toBe("Compaction");
    });
  });

  describe("extension_load", () => {
    it("maps ExtensionLoad._tag to ExtensionLoad error", () => {
      const input = { _tag: "ExtensionLoad", message: "extension failed", extensionPath: "/path" };
      const result = mapPiError(input);
      expect(result._tag).toBe("ExtensionLoad");
    });
  });

  describe("credential_store", () => {
    it("maps CredentialStore._tag to CredentialStore error", () => {
      const input = { _tag: "CredentialStore", message: "credential error" };
      const result = mapPiError(input);
      expect(result._tag).toBe("CredentialStore");
    });
  });

  describe("resource_load", () => {
    it("maps ResourceLoad._tag to ResourceLoad error", () => {
      const input = { _tag: "ResourceLoad", message: "resource failed" };
      const result = mapPiError(input);
      expect(result._tag).toBe("ResourceLoad");
    });
  });

  describe("pi_runtime", () => {
    it("maps PiRuntime._tag to PiRuntime error", () => {
      const input = { _tag: "PiRuntime", message: "runtime error" };
      const result = mapPiError(input);
      expect(result._tag).toBe("PiRuntime");
    });
  });

  describe("unknown fallback", () => {
    it("maps unknown error to Unknown", () => {
      const input = { foo: "bar" };
      const result = mapPiError(input);
      expect(result._tag).toBe("Unknown");
    });

    it("maps null to Unknown", () => {
      const result = mapPiError(null);
      expect(result._tag).toBe("Unknown");
    });

    it("maps primitive string to Unknown", () => {
      const result = mapPiError("some error string");
      expect(result._tag).toBe("Unknown");
    });
  });
});
