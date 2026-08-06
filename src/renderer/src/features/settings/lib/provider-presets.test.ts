
// 数据来自 models.dev（scripts/extract-providers.mjs 生成 providers.json）

import { describe, it, expect } from "vitest";
import { PROVIDER_PRESETS } from "@codeman-frontend/features/settings/lib/provider-presets";

describe("PROVIDER_PRESETS", () => {
  it("包含 4 个主流 cn_official 厂商预设", () => {
    expect(PROVIDER_PRESETS.length).toBe(4);
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
      p.models.forEach((m) => {
        expect(m.id).toBeTruthy();
        expect(m.label).toBeTruthy();
        // deprecated 仅存在于 providers.json 数据源（运行时透传，类型层已移除）
        expect(typeof (m as { deprecated?: unknown }).deprecated).toBe("boolean");
        expect(typeof m.thinking).toBe("boolean");
      });
    });
  });

  it("覆盖 4 个 cn_official 厂商 (DeepSeek, Kimi, MiniMax, Zhipu)", () => {
    const cnIds = PROVIDER_PRESETS
      .filter((p) => p.category === "cn_official")
      .map((p) => p.id);
    expect(cnIds).toContain("deepseek");
    expect(cnIds).toContain("kimi");
    expect(cnIds).toContain("minimax");
    expect(cnIds).toContain("zhipu");
  });

  it("defaultModel 取最新主力模型", () => {
    const byId: Record<string, string> = Object.fromEntries(
      PROVIDER_PRESETS.map((p) => [p.id, p.defaultModel]),
    );
    expect(byId.deepseek).toBe("deepseek-v4-flash");
    expect(byId.kimi).toBe("kimi-k3");
    expect(byId.minimax).toBe("MiniMax-M3");
    expect(byId.zhipu).toBe("glm-5.2");
  });
});
