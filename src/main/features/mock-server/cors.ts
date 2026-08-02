import { ServerResponse, OutgoingHttpHeaders } from "node:http";

export const CORS_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
  "Access-Control-Max-Age": "86400",
});

export function writeHeadWithCors(
  res: ServerResponse,
  status: number,
  extra: OutgoingHttpHeaders,
): void {
  res.writeHead(status, { ...CORS_HEADERS, ...extra });
}
