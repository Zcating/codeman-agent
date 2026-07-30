
import { test, expect, assert, cancelRunningAgent, clearAllHistory, clickNewConversationAndWait, invoke, submitForm } from "./fixtures";
import * as path from "node:path";
import * as os from "node:os";
import { useMockProvider } from "./mock-provider";

const THINKING_SNIPPET = "The user typed '11::msgs'";
const TEXT_SNIPPET = "Here is the answer text after the thinking block.";

const THINKING_ONLY_SNIPPET = "Pure thinking entry";

test.describe("11 — Thinking display after stream ends", () => {
    test.beforeAll(async ({ tauriEnv }) => {
        const { page } = tauriEnv;
        await page.goto("/");
        await assert.visible(page.locator('a[href="/settings"]'), { timeout: 15_000 });

        await invoke<{ id: string }>(page, "addWorkspace", {
            label: "11 Thinking Test Workspace",
            rootPath: path.join(
                os.tmpdir(),
                `codeman-11-${process.pid}-${Math.random().toString(36).slice(2, 8)}`,
            ),
        });
        await page.goto("/");

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
        await cancelRunningAgent(page);
        await clearAllHistory(page);
        await clickNewConversationAndWait(page);
    });


    test("D1: streaming 期间 thinking-panel 出现,含完整 thinking 文本", async ({ tauriEnv }) => {
        test.setTimeout(30_000);
        const { page } = tauriEnv;

        const textarea = page.locator('textarea[placeholder="发条消息\u2026"]');
        await assert.enabled(textarea);
        await textarea.fill("11::msgs");
        await submitForm(page);

        const assistantBubble = page.locator('[data-testid="agent-bubble"]');
        await assert.visible(assistantBubble.first(), { timeout: 10_000 });

        const thinkingPanel = page.locator('[data-testid="thinking-panel"]');
        await assert.visible(thinkingPanel.first(), { timeout: 10_000 });

        const panelText = await thinkingPanel.first().textContent();
        expect(panelText ?? "", "streaming 期间 label 应是 '思考中…'").toContain("思考中");

        const thinkingPre = thinkingPanel.first().locator("pre").first();
        const preText = await thinkingPre.textContent();
        expect(preText ?? "", "thinking-panel pre 应包含完整 thinking 文本").toContain(THINKING_SNIPPET);

        await assert.visible(
            page.locator('[data-testid="agent-bubble"]').filter({
                hasText: TEXT_SNIPPET,
            }),
            { timeout: 10_000 },
        );
    });


    test("D2: stream 结束后 thinking-panel 仍存在,文本不丢,label 切换为 '已思考'", async ({ tauriEnv }) => {
        test.setTimeout(30_000);
        const { page } = tauriEnv;

        const textarea = page.locator('textarea[placeholder="发条消息\u2026"]');
        await assert.enabled(textarea);
        await textarea.fill("11::msgs");
        await submitForm(page);

        await assert.visible(
            page.locator('[data-testid="agent-bubble"]').filter({
                hasText: TEXT_SNIPPET,
            }),
            { timeout: 15_000 },
        );

        await new Promise((r) => setTimeout(r, 500));

        const thinkingPanel = page.locator('[data-testid="thinking-panel"]');
        await assert.visible(thinkingPanel.first(), { timeout: 5_000 });

        const panelText = await thinkingPanel.first().textContent();
        expect(panelText ?? "", "stream 结束后 label 应是 '已思考'").toContain("已思考");

        const thinkingPre = thinkingPanel.first().locator("pre").first();
        const preText = await thinkingPre.textContent();
        expect(preText ?? "", "thinking-panel pre 在 stream 结束后仍包含 thinking 文本").toContain(THINKING_SNIPPET);
    });


    test("D3: stream 结束后,最后一条 assistant bubble 的 ThinkingPanel 含完整 thinking 文本(streaming→done 后数据持久化)", async ({ tauriEnv }) => {
        test.setTimeout(30_000);
        const { page } = tauriEnv;

        const textarea = page.locator('textarea[placeholder="发条消息\u2026"]');
        await assert.enabled(textarea);
        await textarea.fill("11::msgs");
        await submitForm(page);

        await assert.visible(
            page.locator('[data-testid="agent-bubble"]').filter({
                hasText: TEXT_SNIPPET,
            }),
            { timeout: 15_000 },
        );

        await new Promise((r) => setTimeout(r, 1_000));

        const bubblesWithThinking = await page.evaluate((snippet: string) => {
            const bubbles = document.querySelectorAll('[data-testid="agent-bubble"]');
            const results: Array<{ panelText: string | null; textPreview: string | null }> = [];
            for (const b of Array.from(bubbles)) {
                const panel = b.querySelector('[data-testid="thinking-panel"]');
                const textContent = b.querySelector('[data-testid="agent-text-content"]');
                if (panel) {
                    results.push({
                        panelText: panel.querySelector("pre")?.textContent?.slice(0, 200) ?? null,
                        textPreview: textContent?.textContent?.slice(0, 80) ?? null,
                    });
                }
                if (panel) {
                    const panelText = panel.querySelector("pre")?.textContent ?? "";
                    if (panelText.includes(snippet)) {
                        results.push({
                            panelText: panelText.slice(0, 200),
                            textPreview: textContent?.textContent?.slice(0, 80) ?? "(no text)",
                        });
                    }
                }
            }
            return results;
        }, THINKING_SNIPPET);

        expect(
            bubblesWithThinking.length,
            "至少一个 agent-bubble 应含 thinking-panel (stream end 后 thinking 字段仍非空)",
        ).toBeGreaterThan(0);

        const matchingPanel = bubblesWithThinking.find((b) =>
            (b.panelText ?? "").includes(THINKING_SNIPPET),
        );
        expect(matchingPanel, `thinking-panel 应含完整 thinking 文本 "${THINKING_SNIPPET}"`).toBeDefined();
    });


    test("D4: pure thinking entry (无 text) 也显示 thinking-panel", async ({ tauriEnv }) => {
        test.setTimeout(30_000);
        const { page } = tauriEnv;

        const textarea = page.locator('textarea[placeholder="发条消息\u2026"]');
        await assert.enabled(textarea);
        await textarea.fill("11::pure");
        await submitForm(page);

        const assistantBubble = page.locator('[data-testid="agent-bubble"]');
        await assert.visible(assistantBubble.first(), { timeout: 10_000 });

        await new Promise((r) => setTimeout(r, 1500));

        const thinkingPanel = page.locator('[data-testid="thinking-panel"]');
        await assert.visible(thinkingPanel.first(), { timeout: 10_000 });

        const thinkingPre = thinkingPanel.first().locator("pre").first();
        const preText = await thinkingPre.textContent();
        expect(preText ?? "", "pure thinking entry 的 thinking-panel pre 应包含 thinking 文本").toContain(THINKING_ONLY_SNIPPET);
    });
});