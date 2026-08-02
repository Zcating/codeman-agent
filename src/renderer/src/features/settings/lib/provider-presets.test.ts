
// Adapted from CC-Switch (https://github.com/farion1231/cc-switch), MIT License, Copyright (c) 2025 Jason Young

import { describe, it, expect } from "vitest";
import { PROVIDER_PRESETS } from "@codeman-frontend/features/settings/lib/provider-presets";
import type { ModelMeta } from "@codeman-frontend/shared/lib/types";

describe("PROVIDER_PRESETS", () => {
  it("至少包含 15 个主流厂商预设", () => {
    expect(PROVIDER_PRESETS.length).toBeGreaterThanOrEqual(15);
  });

  it("每个 preset 的 id 非空且唯一", () => {
    const ids = PROVIDER_PRESETS.map((p) => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
    ids.forEach((id) => expect(id).toBeTruthy());
  });

  it("每个 preset 的 label 非空", () => {
    PROVIDER_PRESETS.forEach((p) => expect(p.label).toBeTruthy());
  });

  it("每个 preset 的 baseUrl 非空且以 http 开头", () => {
    PROVIDER_PRESETS.forEach((p) => {
      expect(p.baseUrl).toBeTruthy();
      expect(p.baseUrl.startsWith("http://") || p.baseUrl.startsWith("https://")).toBe(true);
    });
  });

  it("每个 preset 的 models 非空且包含 defaultModel", () => {
    PROVIDER_PRESETS.forEach((p) => {
      expect(p.models).toBeDefined();
      expect(p.models.length).toBeGreaterThan(0);
      const hasDefault = p.models.some((m) => m.id === p.defaultModel);
      expect(hasDefault).toBe(true);
    });
  });

  it("每个 preset 的 category 为合法值", () => {
    const validCategories = ["official", "cn_official", "third_party", "aggregator"] as const;
    PROVIDER_PRESETS.forEach((p) => {
      expect(validCategories).toContain(p.category);
    });
  });

  it("models 中的每个 ModelMeta shape 合法 (id/label 非空, deprecated/thinking 为 boolean)", () => {
    PROVIDER_PRESETS.forEach((p) => {
      p.models.forEach((m: ModelMeta) => {
        expect(m.id).toBeTruthy();
        expect(m.label).toBeTruthy();
        expect(typeof m.deprecated).toBe("boolean");
        expect(typeof m.thinking).toBe("boolean");
      });
    });
  });

  it("覆盖主流 cn_official 厂商 (DeepSeek, Kimi, MiniMax, Zhipu, 豆包等)", () => {
    const cnIds = PROVIDER_PRESETS
      .filter((p) => p.category === "cn_official")
      .map((p) => p.id);
    expect(cnIds).toContain("deepseek");
    expect(cnIds).toContain("kimi");
    expect(cnIds).toContain("minimax");
    expect(cnIds).toContain("zhipu");
  });

  it("覆盖 aggregator 厂商 (OpenRouter, SiliconFlow, ModelScope 等)", () => {
    const aggIds = PROVIDER_PRESETS
      .filter((p) => p.category === "aggregator")
      .map((p) => p.id);
    expect(aggIds).toContain("openrouter");
    expect(aggIds).toContain("siliconflow");
  });

  it("覆盖 official 厂商 (Claude)", () => {
    const officialIds = PROVIDER_PRESETS
      .filter((p) => p.category === "official")
      .map((p) => p.id);
    expect(officialIds).toContain("claude");
  });
});
