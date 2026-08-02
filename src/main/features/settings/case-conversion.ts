function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === "[object Object]";
}

// Matches keys in snake_case: one lowercase segment, then one or more _lowercase segments
// e.g. "default_model", "start_at_login", "auto_archive_after_days"
const SNAKE_CASE_RE = /^[a-z]+(_[a-z]+)+$/;

function isSnakeCaseKey(key: string): boolean {
  return SNAKE_CASE_RE.test(key);
}

export function snakeToCamel(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => snakeToCamel(item));
  }
  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (isSnakeCaseKey(k)) {
        // Replace each _lowercase letter with the uppercase letter
        result[k.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase())] =
          snakeToCamel(v);
      } else {
        result[k] = snakeToCamel(v);
      }
    }
    return result;
  }
  return value;
}

export function camelToSnake(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => camelToSnake(item));
  }
  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase()] = camelToSnake(v);
    }
    return result;
  }
  return value;
}
