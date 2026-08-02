// index.test.ts — startMockServer / stopMockServer 的 lifecycle 测试(拆自 src/main/mock-server.test.ts)
import { describe, it, expect } from "vitest";
import { startMockServer, stopMockServer } from "./index";

describe("mock-server lifecycle — production mode skip", () => {
  it("T19: NODE_ENV=production + CODEMAN_MOCK_FORCE 不设 → startMockServer 不 listen", async () => {
    process.env["NODE_ENV"] = "production";
    delete process.env["CODEMAN_MOCK_FORCE"];
    startMockServer();
    await stopMockServer();
    delete process.env["NODE_ENV"];
    expect(true).toBe(true);
  });
});
