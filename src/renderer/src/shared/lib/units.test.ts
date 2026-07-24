//! units.ts 单元测试 — 紧凑数字与千分位格式化边界。
//!
//! 覆盖矩阵(per `src/shared/AGENTS.md` "测试策略" 段):
//! - compactNumber: NaN / Infinity / 0 / <1k 整数 / 1k-1M / 1M-1B / ≥1B / 负数 / 小数
//! - formatWithCommas: NaN / Infinity / 0 / 千分位 / 大数

import { describe, it, expect } from "vitest";
import { compactNumber, formatWithCommas } from "./units";

describe("compactNumber — 紧凑显示", () => {
    describe("D1: 非有限数", () => {
        it("NaN → em-dash", () => {
            expect(compactNumber(Number.NaN)).toBe("—");
        });
        it("Infinity → em-dash", () => {
            expect(compactNumber(Number.POSITIVE_INFINITY)).toBe("—");
        });
        it("-Infinity → em-dash", () => {
            expect(compactNumber(Number.NEGATIVE_INFINITY)).toBe("—");
        });
    });

    describe("D2: 0 / 整数(<1k)", () => {
        it("0 → '0'", () => {
            expect(compactNumber(0)).toBe("0");
        });
        it("整数 42 → '42'", () => {
            expect(compactNumber(42)).toBe("42");
        });
        it("整数 999 → '999'", () => {
            expect(compactNumber(999)).toBe("999");
        });
    });

    describe("D3: 千位 (≥1k, <1M)", () => {
        it("1000 → '1.0k'", () => {
            expect(compactNumber(1000)).toBe("1.0k");
        });
        it("1500 → '1.5k'", () => {
            expect(compactNumber(1500)).toBe("1.5k");
        });
        it("12345 → '12.3k'", () => {
            expect(compactNumber(12345)).toBe("12.3k");
        });
    });

    describe("D4: 百万位 (≥1M, <1B)", () => {
        it("1_000_000 → '1.0M'", () => {
            expect(compactNumber(1_000_000)).toBe("1.0M");
        });
        it("1_500_000 → '1.5M'", () => {
            expect(compactNumber(1_500_000)).toBe("1.5M");
        });
        it("240_000_000 → '240.0M'", () => {
            expect(compactNumber(240_000_000)).toBe("240.0M");
        });
    });

    describe("D5: 十亿位 (≥1B)", () => {
        it("1_000_000_000 → '1.0B'", () => {
            expect(compactNumber(1_000_000_000)).toBe("1.0B");
        });
        it("1_500_000_000 → '1.5B'", () => {
            expect(compactNumber(1_500_000_000)).toBe("1.5B");
        });
    });

    describe("D6: 负数 (绝对值判定)", () => {
        it("-1500 → '-1.5k' (按 abs 判定档位)", () => {
            expect(compactNumber(-1500)).toBe("-1.5k");
        });
        it("-1_500_000 → '-1.5M'", () => {
            expect(compactNumber(-1_500_000)).toBe("-1.5M");
        });
    });

    describe("D7: 小数 (<1k)", () => {
        it("1.5 → '1.50' (2 位小数)", () => {
            expect(compactNumber(1.5)).toBe("1.50");
        });
        it("0.123 → '0.12' (2 位小数)", () => {
            expect(compactNumber(0.123)).toBe("0.12");
        });
    });
});

describe("formatWithCommas — 千分位格式化", () => {
    describe("D1: 非有限数", () => {
        it("NaN → em-dash", () => {
            expect(formatWithCommas(Number.NaN)).toBe("—");
        });
        it("Infinity → em-dash", () => {
            expect(formatWithCommas(Number.POSITIVE_INFINITY)).toBe("—");
        });
    });

    describe("D2: 整数", () => {
        it("0 → '0'", () => {
            expect(formatWithCommas(0)).toBe("0");
        });
        it("1234 → '1,234'", () => {
            expect(formatWithCommas(1234)).toBe("1,234");
        });
        it("1_234_567 → '1,234,567'", () => {
            expect(formatWithCommas(1_234_567)).toBe("1,234,567");
        });
    });

    describe("D3: 负数 + 小数", () => {
        it("-1234 → '-1,234'", () => {
            expect(formatWithCommas(-1234)).toBe("-1,234");
        });
        it("1234.5 → '1,234.5' (locales 默认)", () => {
            expect(formatWithCommas(1234.5)).toBe("1,234.5");
        });
    });
});
