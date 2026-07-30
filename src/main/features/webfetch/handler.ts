import { assertSafeUrl } from "./ssrf.js";

export interface FetchResult {
  status: number;
  contentType: string;
  body: ArrayBuffer;
}

const DEFAULT_TIMEOUT_SECONDS = 30;
const MAX_TIMEOUT_SECONDS = 120;
const MIN_TIMEOUT_SECONDS = 5;
const MAX_BYTES = 5 * 1024 * 1024;

const NON_TEXT_TYPES = /^image\/(?!svg\+xml)/;

export async function fetchSafe(
  url: string,
  opts: { timeoutSeconds?: number } = {},
): Promise<FetchResult> {
  const timeoutSeconds = opts.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
  if (timeoutSeconds < MIN_TIMEOUT_SECONDS || timeoutSeconds > MAX_TIMEOUT_SECONDS) {
    throw new Error(
      `Timeout must be between ${MIN_TIMEOUT_SECONDS} and ${MAX_TIMEOUT_SECONDS} seconds`,
    );
  }

  await assertSafeUrl(url);

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(timeoutSeconds * 1000) });
  } catch (e) {
    if ((e as Error).name === "TimeoutError" || (e as Error).name === "AbortError") {
      throw new Error("Request timed out");
    }
    throw new Error((e as Error).message);
  }

  if (response.status >= 400) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  if (NON_TEXT_TYPES.test(contentType)) {
    throw new Error(`Unsupported content type: ${contentType}`);
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BYTES) {
    throw new Error(
      `Response too large (${contentLength} bytes > ${MAX_BYTES} bytes)`,
    );
  }

  const body = await response.arrayBuffer();
  if (body.byteLength > MAX_BYTES) {
    throw new Error(
      `Response too large (${body.byteLength} bytes > ${MAX_BYTES} bytes)`,
    );
  }

  return { status: response.status, contentType, body };
}
