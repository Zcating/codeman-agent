// cors.test.ts — writeHeadWithCors / CORS_HEADERS 的 unit 测试(拆自 http-handler.test.ts T18b-T18e)
import { describe, it, expect, vi } from "vitest";
import type { ServerResponse } from "node:http";
import { writeHeadWithCors, CORS_HEADERS } from "./cors";

function fakeRes(): ServerResponse {
  const writeHead = vi.fn();
  return { writeHead } as unknown as ServerResponse;
}

describe("cors — writeHeadWithCors / CORS_HEADERS", () => {
  it("T18b: 200 response 携带 Access-Control-Allow-Origin: *", () => {
    const res = fakeRes();
    writeHeadWithCors(res, 200, { "Content-Type": "application/event-stream" });
    const writeHead = res.writeHead as ReturnType<typeof vi.fn>;
    const [status, headers] = writeHead.mock.calls[0] as [number, Record<string, string>];
    expect(status).toBe(200);
    expect(headers["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("T18c: preflight 204 → 全部 CORS headers (Allow-Origin/Methods/Headers)", () => {
    const res = fakeRes();
    writeHeadWithCors(res, 204, { "Content-Length": "0" });
    const writeHead = res.writeHead as ReturnType<typeof vi.fn>;
    const [, headers] = writeHead.mock.calls[0] as [number, Record<string, string>];
    expect(headers["Access-Control-Allow-Origin"]).toBe(CORS_HEADERS["Access-Control-Allow-Origin"]);
    expect(headers["Access-Control-Allow-Methods"]).toBe(CORS_HEADERS["Access-Control-Allow-Methods"]);
    expect(headers["Access-Control-Allow-Headers"]).toBe(CORS_HEADERS["Access-Control-Allow-Headers"]);
    const allowHeaders = headers["Access-Control-Allow-Headers"].toLowerCase();
    expect(allowHeaders).toContain("authorization");
    expect(allowHeaders).toContain("content-type");
  });

  it("T18d: 405 response 也携带 Access-Control-Allow-Origin: *", () => {
    const res = fakeRes();
    writeHeadWithCors(res, 405, { "Content-Type": "text/plain" });
    const writeHead = res.writeHead as ReturnType<typeof vi.fn>;
    const [status, headers] = writeHead.mock.calls[0] as [number, Record<string, string>];
    expect(status).toBe(405);
    expect(headers["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("T18e: 404 response 也携带 Access-Control-Allow-Origin: *", () => {
    const res = fakeRes();
    writeHeadWithCors(res, 404, { "Content-Type": "text/plain" });
    const writeHead = res.writeHead as ReturnType<typeof vi.fn>;
    const [status, headers] = writeHead.mock.calls[0] as [number, Record<string, string>];
    expect(status).toBe(404);
    expect(headers["Access-Control-Allow-Origin"]).toBe("*");
  });
});
