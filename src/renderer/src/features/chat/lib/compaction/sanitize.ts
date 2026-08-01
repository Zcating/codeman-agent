const REDACTED = "***REDACTED***";

// Threshold note: The 20+ character minimum for sk- and Bearer tokens is chosen to
// align with pi's shouldCompact token estimation granularity (~4 chars/token), which
// ensures sensitive tokens are reliably detected and redacted before compaction decisions.
// apiKey/key/secret field values are redacted regardless of length (no threshold).

// Matches sk- followed by 20+ alphanumeric characters
const SK_PATTERN = /\bsk-[a-zA-Z0-9]{20,}/g;

// Matches Bearer <token> where token is 20+ alphanumeric chars
const BEARER_PATTERN = /\bBearer\s+[a-zA-Z0-9]{20,}/g;

export function sanitizeSummary(text: string): string {
  let result = text;
  result = result.replace(SK_PATTERN, `sk-${REDACTED}`);
  result = result.replace(BEARER_PATTERN, `Bearer ${REDACTED}`);

  // Redact quoted values after sensitive field names (apiKey, key, secret, bearer, token, password)
  const sensitiveFields = [
    "apiKey",
    "key",
    "secret",
    "bearer",
    "token",
    "password",
  ];
  for (const field of sensitiveFields) {
    // Match: field followed by optional whitespace, optional :=, optional whitespace, then opening quote, content, closing quote
    // e.g. apiKey: "value" or key = "secret" or bearer "token"
    const fieldRe = new RegExp(
      `\\b${field}\\s*[:=]?\\s*"[^"]*"`,
      "gi",
    );
    result = result.replace(fieldRe, (match) => {
      const openIdx = match.lastIndexOf('"');
      if (openIdx === -1) return match;
      return match.slice(0, openIdx + 1) + REDACTED + '"';
    });
  }

  return result;
}
