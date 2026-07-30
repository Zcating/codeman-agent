import { assertSafeUrl } from "./ssrf.js";
import { InvalidConfig, Network } from "../../../renderer/src/shared/lib/errors";

export interface FetchResult {
  status: number;
  contentType: string;
  body: ArrayBuffer;
}

const TIMEOUT_CONFIG = { min: 5, max: 120, default: 30 } as const;
const MAX_BYTES = 5 * 1024 * 1024;

const NON_TEXT_TYPES = /^image\/(?!svg\+xml)/;

export async function fetchSafe(
  url: string,
  opts: { timeoutSeconds?: number } = {},
): Promise<FetchResult> {
  const timeoutSeconds = opts.timeoutSeconds ?? TIMEOUT_CONFIG.default;
  if (timeoutSeconds < TIMEOUT_CONFIG.min || timeoutSeconds > TIMEOUT_CONFIG.max) {
    throw new InvalidConfig({
      field: "timeout",
      message: `Timeout must be between ${TIMEOUT_CONFIG.min} and ${TIMEOUT_CONFIG.max} seconds`,
    });
  }

  await assertSafeUrl(url);

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutSeconds * 1000),
      redirect: "error",
    });
  } catch (e) {
    if ((e as Error).name === "TimeoutError" || (e as Error).name === "AbortError") {
      throw new Network({ message: "Request timed out", cause: "timeout" });
    }
    if ((e as Error).message?.toLowerCase().includes("redirect")) {
      throw new Network({
        message: `HTTP redirect blocked (SSRF guard): ${(e as Error).message}`,
        cause: "redirect",
      });
    }
    throw new Network({ message: (e as Error).message });
  }

  if (response.status >= 400) {
    throw new Network({ message: `HTTP ${response.status} ${response.statusText}` });
  }

  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  if (NON_TEXT_TYPES.test(contentType)) {
    throw new InvalidConfig({ field: "url", message: `Unsupported content type: ${contentType}` });
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BYTES) {
    throw new Network({
      message: `Response too large (${contentLength} bytes > ${MAX_BYTES} bytes)`,
    });
  }

  const body = await response.arrayBuffer();
  if (body.byteLength > MAX_BYTES) {
    throw new Network({
      message: `Response too large (${body.byteLength} bytes > ${MAX_BYTES} bytes)`,
    });
  }

  return { status: response.status, contentType, body };
}
