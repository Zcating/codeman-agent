import { describe, it, expect } from "@effect/vitest";
import { Effect } from "effect";
import { sanitizeSummary } from "./sanitize";

describe("sanitizeSummary", () => {
  it("returns original text when no sensitive literals present", () =>
    Effect.gen(function* () {
      const input = "This is a normal summary with no secrets.";
      const result = sanitizeSummary(input);
      expect(result).toBe(input);
    }),
  );

  it("redacts sk- prefixed keys (length >= 20)", () =>
    Effect.gen(function* () {
      const input = "The API key sk-abcdef1234567890 was used.";
      const result = sanitizeSummary(input);
      expect(result).toBe("The API key sk-***REDACTED*** was used.");
    }),
  );

  it("redacts Bearer token values", () =>
    Effect.gen(function* () {
      const input = "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456";
      const result = sanitizeSummary(input);
      expect(result).toBe("Authorization: Bearer ***REDACTED***");
    }),
  );

  it("redacts apiKey quoted values", () =>
    Effect.gen(function* () {
      const input = 'apiKey: "deadbeef-cafe-1234-5678-90abcdef0000"';
      const result = sanitizeSummary(input);
      expect(result).toBe('apiKey: "***REDACTED***"');
    }),
  );

  it("does not falsely redact short strings", () =>
    Effect.gen(function* () {
      const inputs = ["a", "sk-", "Bearer ", "sk-abc", "Bearer xyz"];
      for (const input of inputs) {
        const result = sanitizeSummary(input);
        expect(result).toBe(input);
      }
    }),
  );
});
