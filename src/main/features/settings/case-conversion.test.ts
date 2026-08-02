import { describe, it, expect } from "vitest";
import { snakeToCamel, camelToSnake } from "./case-conversion.js";

describe("case-conversion", () => {
  describe("snakeToCamel", () => {
    it("converts top-level snake_case keys to camelCase", () => {
      const input = { default_model: "claude", api_key: "sk-123" };
      const result = snakeToCamel(input) as Record<string, unknown>;
      expect(result).toEqual({ defaultModel: "claude", apiKey: "sk-123" });
    });

    it("converts nested object keys to camelCase", () => {
      const input = {
        window: { remember_position: true, default_size: { width: 800 } },
      };
      const result = snakeToCamel(input) as Record<string, unknown>;
      expect(result).toEqual({
        window: { rememberPosition: true, defaultSize: { width: 800 } },
      });
    });

    it("converts keys inside array objects", () => {
      const input = {
        providers: [
          { api_key: "sk-1", llm: { default_model: "m1" } },
          { api_key: "sk-2", llm: { default_model: "m2" } },
        ],
      };
      const result = snakeToCamel(input) as Record<string, unknown>;
      expect(result).toEqual({
        providers: [
          { apiKey: "sk-1", llm: { defaultModel: "m1" } },
          { apiKey: "sk-2", llm: { defaultModel: "m2" } },
        ],
      });
    });

    it("passes through primitives, null, undefined, arrays as-is", () => {
      expect(snakeToCamel(null)).toBeNull();
      expect(snakeToCamel(undefined)).toBeUndefined();
      expect(snakeToCamel("hello")).toBe("hello");
      expect(snakeToCamel(42)).toBe(42);
      expect(snakeToCamel([1, 2, 3])).toEqual([1, 2, 3]);
      // already camelCase keys should be untouched
      const already = { defaultModel: "claude" };
      expect(snakeToCamel(already)).toEqual({ defaultModel: "claude" });
    });
  });

  describe("camelToSnake", () => {
    it("converts top-level camelCase keys to snake_case", () => {
      const input = { defaultModel: "claude", apiKey: "sk-123" };
      const result = camelToSnake(input) as Record<string, unknown>;
      expect(result).toEqual({ default_model: "claude", api_key: "sk-123" });
    });

    it("converts nested object keys to snake_case", () => {
      const input = {
        window: { rememberPosition: true, defaultSize: { width: 800 } },
      };
      const result = camelToSnake(input) as Record<string, unknown>;
      expect(result).toEqual({
        window: { remember_position: true, default_size: { width: 800 } },
      });
    });

    it("converts keys inside array objects", () => {
      const input = {
        providers: [
          { apiKey: "sk-1", llm: { defaultModel: "m1" } },
          { apiKey: "sk-2", llm: { defaultModel: "m2" } },
        ],
      };
      const result = camelToSnake(input) as Record<string, unknown>;
      expect(result).toEqual({
        providers: [
          { api_key: "sk-1", llm: { default_model: "m1" } },
          { api_key: "sk-2", llm: { default_model: "m2" } },
        ],
      });
    });

    it("passes through primitives, null, undefined, arrays as-is", () => {
      expect(camelToSnake(null)).toBeNull();
      expect(camelToSnake(undefined)).toBeUndefined();
      expect(camelToSnake("hello")).toBe("hello");
      expect(camelToSnake(42)).toBe(42);
      expect(camelToSnake([1, 2, 3])).toEqual([1, 2, 3]);
      // already snake_case keys should be untouched
      const already = { default_model: "claude" };
      expect(camelToSnake(already)).toEqual({ default_model: "claude" });
    });
  });
});
