import { describe, expect, it } from "vitest";
import { classifyError } from "./error-classifier.js";

describe("PiError.classify", () => {
  describe("pi SDK errors by constructor.name", () => {
    it("classifies CredentialSynchronizationError as credential_store", () => {
      const err = new (class CredentialSynchronizationError extends Error {
        constructor() {
          super("credential sync failed");
          this.name = "CredentialSynchronizationError";
        }
      })();
      expect(classifyError(err)).toBe("credential_store");
    });

    it("classifies MissingSessionCwdError as session_permission", () => {
      const err = new (class MissingSessionCwdError extends Error {
        constructor() {
          super("session cwd missing");
          this.name = "MissingSessionCwdError";
        }
      })();
      expect(classifyError(err)).toBe("session_permission");
    });

    it("classifies SessionImportFileNotFoundError as session_not_found", () => {
      const err = new (class SessionImportFileNotFoundError extends Error {
        constructor() {
          super("session file not found");
          this.name = "SessionImportFileNotFoundError";
        }
      })();
      expect(classifyError(err)).toBe("session_not_found");
    });

    it("classifies AuthCommandError as model_auth", () => {
      const err = new (class AuthCommandError extends Error {
        constructor() {
          super("auth command failed");
          this.name = "AuthCommandError";
        }
      })();
      expect(classifyError(err)).toBe("model_auth");
    });
  });

  describe("Effect errors by _tag", () => {
    it("classifies ModelProvider._tag as model_provider", () => {
      const err = { _tag: "ModelProvider", message: "provider error" };
      expect(classifyError(err)).toBe("model_provider");
    });

    it("classifies ModelAuth._tag as model_auth", () => {
      const err = { _tag: "ModelAuth", message: "auth error" };
      expect(classifyError(err)).toBe("model_auth");
    });

    it("classifies ModelRateLimit._tag as model_rate_limit", () => {
      const err = { _tag: "ModelRateLimit", message: "rate limit" };
      expect(classifyError(err)).toBe("model_rate_limit");
    });

    it("classifies ModelContextLength._tag as model_context_length", () => {
      const err = { _tag: "ModelContextLength", message: "context length" };
      expect(classifyError(err)).toBe("model_context_length");
    });

    it("classifies ModelTimeout._tag as model_timeout", () => {
      const err = { _tag: "ModelTimeout", message: "timeout" };
      expect(classifyError(err)).toBe("model_timeout");
    });

    it("classifies ModelProtocol._tag as model_protocol", () => {
      const err = { _tag: "ModelProtocol", message: "protocol error" };
      expect(classifyError(err)).toBe("model_protocol");
    });

    it("classifies SessionNotFound._tag as session_not_found", () => {
      const err = { _tag: "SessionNotFound", message: "session not found" };
      expect(classifyError(err)).toBe("session_not_found");
    });

    it("classifies SessionPermission._tag as session_permission", () => {
      const err = { _tag: "SessionPermission", message: "permission denied" };
      expect(classifyError(err)).toBe("session_permission");
    });

    it("classifies SessionFilesystem._tag as session_filesystem", () => {
      const err = { _tag: "SessionFilesystem", message: "filesystem error" };
      expect(classifyError(err)).toBe("session_filesystem");
    });

    it("classifies ToolExecute._tag as tool_execute", () => {
      const err = { _tag: "ToolExecute", message: "tool execute failed" };
      expect(classifyError(err)).toBe("tool_execute");
    });

    it("classifies ToolArgument._tag as tool_argument", () => {
      const err = { _tag: "ToolArgument", message: "argument invalid" };
      expect(classifyError(err)).toBe("tool_argument");
    });

    it("classifies ToolUnavailable._tag as tool_unavailable", () => {
      const err = { _tag: "ToolUnavailable", message: "tool not available" };
      expect(classifyError(err)).toBe("tool_unavailable");
    });

    it("classifies Compaction._tag as compaction", () => {
      const err = { _tag: "Compaction", message: "compaction failed" };
      expect(classifyError(err)).toBe("compaction");
    });

    it("classifies ExtensionLoad._tag as extension_load", () => {
      const err = { _tag: "ExtensionLoad", message: "extension load failed" };
      expect(classifyError(err)).toBe("extension_load");
    });

    it("classifies CredentialStore._tag as credential_store", () => {
      const err = { _tag: "CredentialStore", message: "credential store error" };
      expect(classifyError(err)).toBe("credential_store");
    });

    it("classifies ResourceLoad._tag as resource_load", () => {
      const err = { _tag: "ResourceLoad", message: "resource load failed" };
      expect(classifyError(err)).toBe("resource_load");
    });

    it("classifies PiRuntime._tag as pi_runtime", () => {
      const err = { _tag: "PiRuntime", message: "pi runtime error" };
      expect(classifyError(err)).toBe("pi_runtime");
    });
  });

  describe("HTTP status codes", () => {
    it("classifies 401 as model_auth", () => {
      const err = { statusCode: 401, message: "unauthorized" };
      expect(classifyError(err)).toBe("model_auth");
    });

    it("classifies 403 as model_auth", () => {
      const err = { statusCode: 403, message: "forbidden" };
      expect(classifyError(err)).toBe("model_auth");
    });

    it("classifies 429 as model_rate_limit", () => {
      const err = { statusCode: 429, message: "rate limited" };
      expect(classifyError(err)).toBe("model_rate_limit");
    });

    it("classifies 413 as model_context_length", () => {
      const err = { statusCode: 413, message: "payload too large" };
      expect(classifyError(err)).toBe("model_context_length");
    });

    it("classifies 504 as model_timeout", () => {
      const err = { statusCode: 504, message: "gateway timeout" };
      expect(classifyError(err)).toBe("model_timeout");
    });

    it("classifies 500 as model_provider", () => {
      const err = { statusCode: 500, message: "internal error" };
      expect(classifyError(err)).toBe("model_provider");
    });
  });

  describe("fallback to unknown", () => {
    it("returns unknown for null", () => {
      expect(classifyError(null)).toBe("unknown");
    });

    it("returns unknown for undefined", () => {
      expect(classifyError(undefined)).toBe("unknown");
    });

    it("returns unknown for plain object without识别 markers", () => {
      const err = { foo: "bar" };
      expect(classifyError(err)).toBe("unknown");
    });

    it("returns unknown for primitive values", () => {
      expect(classifyError("error string")).toBe("unknown");
      expect(classifyError(42)).toBe("unknown");
    });
  });
});
