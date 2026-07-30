import { describe, it, expect, beforeEach } from "vitest";
import { webfetchTool } from "@codeman-frontend/tools/webfetch/webfetch";
import { mockState } from "@codeman-frontend/__mocks__/ipc-mock";
import { Network, SandboxViolation } from "@codeman-frontend/shared/lib/errors";

describe("webfetchTool", () => {
  beforeEach(() => {
    mockState.calls.length = 0;
    mockState.invokeCalls.length = 0;
    mockState.resolved = undefined;
    mockState.rejected = undefined;
  });

  it("returns markdown for HTML body", async () => {
    const encoder = new TextEncoder();
    mockState.resolved = {
      status: 200,
      contentType: "text/html",
      body: encoder.encode("<h1>hi</h1>").buffer,
    };
    const result = await webfetchTool.execute("t1", { url: "https://example.com" });
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("# hi"),
    });
  });

  it("returns text for format=text on HTML body", async () => {
    const encoder = new TextEncoder();
    mockState.resolved = {
      status: 200,
      contentType: "text/html",
      body: encoder.encode("<p>hello</p>").buffer,
    };
    const result = await webfetchTool.execute("t1", {
      url: "https://example.com",
      format: "text",
    });
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("hello"),
    });
  });

  it("returns raw HTML for format=html", async () => {
    const encoder = new TextEncoder();
    mockState.resolved = {
      status: 200,
      contentType: "text/html",
      body: encoder.encode("<p>x</p>").buffer,
    };
    const result = await webfetchTool.execute("t1", {
      url: "https://example.com",
      format: "html",
    });
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("<p>x</p>"),
    });
  });

  it("propagates network error from main", async () => {
    mockState.rejected = new Network({ message: "fetch failed" });
    const result = await webfetchTool.execute("t1", { url: "https://example.com" });
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Network"),
    });
  });

  it("propagates sandbox violation (blocked IP)", async () => {
    mockState.rejected = new SandboxViolation({
      path: "10.0.0.1",
      workspaceLabel: "webfetch",
    });
    const result = await webfetchTool.execute("t1", { url: "https://10.0.0.1" });
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("SandboxViolation"),
    });
  });

  it("rejects ftp://x via schema validation", async () => {
    const result = await webfetchTool.execute("t1", { url: "ftp://x" });
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringMatching(/Invalid params[\s\S]*URL must start with/),
    });
  });

  it("rejects invalid timeout (< 5)", async () => {
    const result = await webfetchTool.execute("t1", {
      url: "https://example.com",
      timeout: 0,
    });
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringMatching(/Invalid params[\s\S]*between 5 and 120/),
    });
  });

  it("passes timeoutSeconds to main (default 30 when omitted)", async () => {
    const encoder = new TextEncoder();
    mockState.resolved = {
      status: 200,
      contentType: "text/plain",
      body: encoder.encode("ok").buffer,
    };
    await webfetchTool.execute("t1", { url: "https://example.com" });
    const call = mockState.invokeCalls.find((c) => c.name === "webfetch:fetch");
    expect(call).toBeDefined();
    expect(call!.args).toMatchObject({ url: "https://example.com", timeout: 30 });
  });

  it("passes format=markdown by default", async () => {
    const encoder = new TextEncoder();
    mockState.resolved = {
      status: 200,
      contentType: "text/html",
      body: encoder.encode("<p>hi</p>").buffer,
    };
    const result = await webfetchTool.execute("t1", { url: "https://example.com" });
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Format: markdown"),
    });
  });
});
