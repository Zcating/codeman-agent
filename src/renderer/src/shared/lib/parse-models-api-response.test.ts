
import { describe, it, expect } from "vitest";
import { parseModelsApiResponse } from "@codeman-frontend/shared/lib/parse-models-api-response";

describe("parseModelsApiResponse", () => {
  it("parses MiniMax-style response (id only, no name) → label falls back to id", () => {
    const response = {
      object: "list",
      data: [
        {
          id: "MiniMax-M3",
          object: "model",
          created: 1780272000,
          owned_by: "minimax",
        },
        {
          id: "MiniMax-M2.7-highspeed",
          object: "model",
          created: 1773799200,
          owned_by: "minimax",
        },
      ],
    };
    const models = parseModelsApiResponse(response);
    expect(models).toEqual([
      {
        id: "MiniMax-M3",
        label: "MiniMax-M3",
        deprecated: false,
        thinking: false,
      },
      {
        id: "MiniMax-M2.7-highspeed",
        label: "MiniMax-M2.7-highspeed",
        deprecated: false,
        thinking: false,
      },
    ]);
  });

  it("uses `name` as label when present", () => {
    const response = {
      object: "list",
      data: [
        {
          id: "gpt-4o",
          object: "model",
          created: 1721260800,
          owned_by: "openai",
          name: "GPT-4o",
        },
      ],
    };
    const models = parseModelsApiResponse(response);
    expect(models).toEqual([
      {
        id: "gpt-4o",
        label: "GPT-4o",
        deprecated: false,
        thinking: false,
      },
    ]);
  });

  it("preserves context_window when provided as a finite number", () => {
    const response = {
      data: [
        { id: "m1", name: "M1", context_window: 128_000 },
        { id: "m2", name: "M2" }, 
      ],
    };
    const models = parseModelsApiResponse(response);
    expect(models[0].contextWindow).toBe(128_000);
    expect(models[1].contextWindow).toBeUndefined();
    expect("contextWindow" in models[1]).toBe(false);
  });

  it("ignores non-finite context_window (NaN, Infinity, strings)", () => {
    const response = {
      data: [
        { id: "m1", name: "M1", context_window: NaN },
        { id: "m2", name: "M2", context_window: Infinity },
        { id: "m3", name: "M3", context_window: "128000" },
      ],
    };
    const models = parseModelsApiResponse(response);
    for (const m of models) {
      expect(m.contextWindow).toBeUndefined();
    }
  });

  it("treats whitespace-only name as missing → label falls back to id", () => {
    const response = {
      data: [
        { id: "m1", name: "   " },
        { id: "m2", name: "" },
      ],
    };
    const models = parseModelsApiResponse(response);
    expect(models[0].label).toBe("m1");
    expect(models[1].label).toBe("m2");
  });

  it("trims surrounding whitespace from a real `name`", () => {
    const response = {
      data: [{ id: "m1", name: "  MiniMax M3  " }],
    };
    const models = parseModelsApiResponse(response);
    expect(models[0].label).toBe("MiniMax M3");
  });

  it("returns [] for non-object response", () => {
    expect(parseModelsApiResponse(null)).toEqual([]);
    expect(parseModelsApiResponse(undefined)).toEqual([]);
    expect(parseModelsApiResponse("string")).toEqual([]);
    expect(parseModelsApiResponse(42)).toEqual([]);
  });

  it("returns [] when `data` is missing or not an array", () => {
    expect(parseModelsApiResponse({})).toEqual([]);
    expect(parseModelsApiResponse({ data: null })).toEqual([]);
    expect(parseModelsApiResponse({ data: "not-array" })).toEqual([]);
  });

  it("skips items with missing/empty/non-string id", () => {
    const response = {
      data: [
        { id: "", name: "NoId" },
        { id: null },
        { id: 123 },
        { id: "ok", name: "Real" },
        null,
        "string-item",
      ],
    };
    const models = parseModelsApiResponse(response);
    expect(models).toEqual([
      {
        id: "ok",
        label: "Real",
        deprecated: false,
        thinking: false,
      },
    ]);
  });

  it("sets deprecated=false and thinking=false on all parsed models", () => {
    const response = {
      data: [
        { id: "m1" },
        { id: "m2", name: "M2" },
        { id: "m3", context_window: 8000 },
      ],
    };
    const models = parseModelsApiResponse(response);
    for (const m of models) {
      expect(m.deprecated).toBe(false);
      expect(m.thinking).toBe(false);
    }
  });
});