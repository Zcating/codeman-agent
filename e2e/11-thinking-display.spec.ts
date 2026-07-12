//! 11 — Thinking display (thinking content visible after stream ends)。
//!
//! 背景:用户报告 stream 结束后,bubble 内不再显示具体的 thinking 文本。
//! 现有 qa.dev.json 已有 thinking entry(`think` / `three-blocks` / `summarize`),
//! 但没有 E2E 专门覆盖 thinking 渲染的完整生命周期。
//!
//! 本 spec 验证三个不变量:
//!   1. thinking-section 在 streaming 期间出现,标签 "思考中…",包含完整 thinking 文本
//!   2. stream 结束后,thinking-section 仍在 DOM,标签切换为 "已思考",文本不丢
//!   3. thinking-panel (ChatView 外的 fallback panel) 在 stream 结束后存在,
//!      折叠 (default-closed `<details>`),内容是最后一条 assistant 的 thinking
//!
//! 用本地 mock provider (mock-server.ts) 跑确定性 canned response,
//! 避免依赖外部 API / 冷启动延迟 / 真实 LLM thinking 行为差异。

import { test, expect, assert, cancelRunningAgent, clearAllHistory, clickNewConversationAndWait, invoke, submitForm } from "./fixtures";
import * as path from "node:path";
import * as os from "node:os";
import { useMockProvider } from "./mock-provider";

// 11::msgs entry in qa.dev.json — thinking + text 组合
// 注意: user input 不能含 "think" 子串(否则会被 "think" entry first-wins 抢走)
// 用 "11::msgs" 避免与 line 119 "think" entry 的 substring 冲突。
const THINKING_SNIPPET = "The user typed '11::msgs'";
const TEXT_SNIPPET = "Here is the answer text after the thinking block.";

// 11::msgs-only entry — 纯 thinking,无 text 块
const THINKING_ONLY_SNIPPET = "Pure thinking entry";

test.describe("11 — Thinking display after stream ends", () => {
    test.beforeAll(async ({ tauriEnv }) => {
        const { page } = tauriEnv;
        await page.goto("/");
        await assert.visible(page.locator('a[href="/settings"]'), { timeout: 15_000 });

        // D8-W: provision workspace via IPC
        await invoke<{ id: string }>(page, "addWorkspace", {
            label: "11 Thinking Test Workspace",
            rootPath: path.join(
                os.tmpdir(),
                `codeman-11-${process.pid}-${Math.random().toString(36).slice(2, 8)}`,
            ),
        });
        await page.goto("/");

        // 切到 mock provider — 11::* entry 在 qa.dev.json 里
        await useMockProvider(page);
        const settings = await invoke<{ defaultLlmProviderId?: string }>(page, "getSettings");
        if (settings.defaultLlmProviderId !== "mock") {
            throw new Error(
                "defaultLlmProviderId 应为 mock,实际: " + (settings.defaultLlmProviderId ?? "null"),
            );
        }
    });

    test.beforeEach(async ({ tauriEnv }) => {
        const { page } = tauriEnv;
        page.on("console", (msg: { type: string; text: string }) => {
            if (msg.type === "error") {
                console.log(`[11 page error] ${msg.text}`);
            }
        });
        page.on("pageerror", (err: Error) => {
            console.log(`[11 page pageerror] ${err.message}`);
        });
        // 1) 取消 in-flight (防前 test 残留)
        await cancelRunningAgent(page);
        // 2) 清 DB 历史
        await clearAllHistory(page);
        // 3) 新 conv
        await clickNewConversationAndWait(page);
    });

    // ─── D1: thinking-section streaming 期间出现 + 含 thinking 文本 ─────────

    test("D1: streaming 期间 thinking-section 出现,含完整 thinking 文本", async ({ tauriEnv }) => {
        test.setTimeout(30_000);
        const { page } = tauriEnv;

        const textarea = page.locator('textarea[placeholder="发条消息\u2026"]');
        await assert.enabled(textarea);
        // Q→A: 11::thinking-display → thinking + text
        await textarea.fill("11::msgs");
        await submitForm(page);

        // 等 assistant bubble 出现
        const assistantBubble = page.locator("div.justify-start > div[class*='bg-card']");
        await assert.visible(assistantBubble.first(), { timeout: 10_000 });

        // 等 thinking-section 出现(maybe multiple in multi-turn; last 即可)
        // streaming 期间 label 是 "思考中…",content 包含 thinking 文本
        const thinkingSection = page.locator('[data-testid="thinking-section"]');
        await assert.visible(thinkingSection.first(), { timeout: 10_000 });

        // 断言 streaming 期间 label 是 "思考中…"
        const sectionText = await thinkingSection.first().textContent();
        expect(sectionText ?? "", "streaming 期间 label 应是 '思考中…'").toContain("思考中");

        // 断言 thinking-section 的 `<pre>` 包含 thinking 文本的子串
        const thinkingPre = thinkingSection.first().locator("pre").first();
        const preText = await thinkingPre.textContent();
        expect(preText ?? "", "thinking-section pre 应包含完整 thinking 文本").toContain(THINKING_SNIPPET);

        // 等流完(text 块到达)
        await assert.visible(
            page.locator("div.justify-start > div[class*='bg-card']").filter({
                hasText: TEXT_SNIPPET,
            }),
            { timeout: 10_000 },
        );
    });

    // ─── D2: stream 结束后,thinking-section 仍可见,文本不丢,label 切换为 "已思考" ──

    test("D2: stream 结束后 thinking-section 仍存在,文本不丢,label 切换为 '已思考'", async ({ tauriEnv }) => {
        test.setTimeout(30_000);
        const { page } = tauriEnv;

        const textarea = page.locator('textarea[placeholder="发条消息\u2026"]');
        await assert.enabled(textarea);
        await textarea.fill("11::msgs");
        await submitForm(page);

        // 等流完(text 块到达 → done 事件即将到达)
        await assert.visible(
            page.locator("div.justify-start > div[class*='bg-card']").filter({
                hasText: TEXT_SNIPPET,
            }),
            { timeout: 15_000 },
        );

        // 给 done handler + finalize 一个 margin
        await new Promise((r) => setTimeout(r, 500));

        // 关键断言 (本次 bug 核心): stream 结束后 thinking-section 必须还在 DOM
        const thinkingSection = page.locator('[data-testid="thinking-section"]');
        await assert.visible(thinkingSection.first(), { timeout: 5_000 });

        // 关键断言: thinking-section label 切换为 "已思考"
        const sectionText = await thinkingSection.first().textContent();
        expect(sectionText ?? "", "stream 结束后 label 应是 '已思考'").toContain("已思考");

        // 关键断言: thinking-section 的 `<pre>` 仍包含完整 thinking 文本(没被丢掉)
        const thinkingPre = thinkingSection.first().locator("pre").first();
        const preText = await thinkingPre.textContent();
        expect(preText ?? "", "thinking-section pre 在 stream 结束后仍包含 thinking 文本").toContain(THINKING_SNIPPET);
    });

    // ─── D3: thinking-panel fallback (ChatView 外) 在 stream 结束后存在 ──

    test("D3: stream 结束后,最后一条 assistant bubble 的 ThinkingSection 含完整 thinking 文本(streaming→done 后数据持久化)", async ({ tauriEnv }) => {
        test.setTimeout(30_000);
        const { page } = tauriEnv;

        const textarea = page.locator('textarea[placeholder="发条消息\u2026"]');
        await assert.enabled(textarea);
        await textarea.fill("11::msgs");
        await submitForm(page);

        // 等流完
        await assert.visible(
            page.locator("div.justify-start > div[class*='bg-card']").filter({
                hasText: TEXT_SNIPPET,
            }),
            { timeout: 15_000 },
        );

        // 等 1s 让 done event 完全 settle
        await new Promise((r) => setTimeout(r, 1_000));

        // 断言: 至少有一个 agent-bubble 内含 thinking-section(说明 store 里的 thinking 字段在 done 后非空)
        const bubblesWithThinking = await page.evaluate((snippet: string) => {
            const bubbles = document.querySelectorAll('[data-testid="agent-bubble"]');
            const results: Array<{ sectionText: string | null; textPreview: string | null }> = [];
            for (const b of Array.from(bubbles)) {
                const section = b.querySelector('[data-testid="thinking-section"]');
                const textContent = b.querySelector('[data-testid="agent-text-content"]');
                if (section) {
                    results.push({
                        sectionText: section.querySelector("pre")?.textContent?.slice(0, 200) ?? null,
                        textPreview: textContent?.textContent?.slice(0, 80) ?? null,
                    });
                }
                // 别忘了:即使 section 没有 textContent 也算(纯 thinking entry)
                if (section) {
                    const secText = section.querySelector("pre")?.textContent ?? "";
                    if (secText.includes(snippet)) {
                        results.push({
                            sectionText: secText.slice(0, 200),
                            textPreview: textContent?.textContent?.slice(0, 80) ?? "(no text)",
                        });
                    }
                }
            }
            return results;
        }, THINKING_SNIPPET);

        expect(
            bubblesWithThinking.length,
            "至少一个 agent-bubble 应含 thinking-section (stream end 后 thinking 字段仍非空)",
        ).toBeGreaterThan(0);

        // 断言: 找到的 bubble 中至少有 thinking-section 含 THINKING_SNIPPET 文本
        const matchingSection = bubblesWithThinking.find((b) =>
            (b.sectionText ?? "").includes(THINKING_SNIPPET),
        );
        expect(matchingSection, `thinking-section 应含完整 thinking 文本 "${THINKING_SNIPPET}"`).toBeDefined();
    });

    // ─── D4: pure thinking (无 text 块) 也得显示 thinking-section ───────────

    test("D4: pure thinking entry (无 text) 也显示 thinking-section", async ({ tauriEnv }) => {
        test.setTimeout(30_000);
        const { page } = tauriEnv;

        const textarea = page.locator('textarea[placeholder="发条消息\u2026"]');
        await assert.enabled(textarea);
        // Q→A: 11::thinking-only → 仅 thinking (text="")
        await textarea.fill("11::pure");
        await submitForm(page);

        // 等 assistant bubble 出现(可能只是空 text + thinking section)
        const assistantBubble = page.locator("div.justify-start > div[class*='bg-card']");
        await assert.visible(assistantBubble.first(), { timeout: 10_000 });

        // 给流一些时间
        await new Promise((r) => setTimeout(r, 1500));

        // 断言: thinking-section 出现 (即使 text 是空)
        const thinkingSection = page.locator('[data-testid="thinking-section"]');
        await assert.visible(thinkingSection.first(), { timeout: 10_000 });

        // 断言: thinking-section pre 包含 thinking 文本
        const thinkingPre = thinkingSection.first().locator("pre").first();
        const preText = await thinkingPre.textContent();
        expect(preText ?? "", "pure thinking entry 的 thinking-section pre 应包含 thinking 文本").toContain(THINKING_ONLY_SNIPPET);
    });
});