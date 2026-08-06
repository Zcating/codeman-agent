import { Effect } from "effect";
import { FileApi } from "@codeman-frontend/shared/apis/file.api";
import type { AppError } from "@codeman-frontend/shared/lib/errors";

const DEFAULT_MAX_CHARS = 32_000;
const TRUNCATED_SUFFIX = "\n\n[truncated]";

/**
 * Truncates project instructions to a maximum character limit, appending "[truncated]"
 * if the content exceeds the limit.
 */
export function truncateProjectInstructions(
  content: string,
  maxChars: number = DEFAULT_MAX_CHARS,
): string {
  if (content.length <= maxChars) {
    return content;
  }
  return content.slice(0, maxChars) + TRUNCATED_SUFFIX;
}

/**
 * Loads the AGENTS.md file from the workspace root.
 *
 * - NotFound error → returns null (silently skip)
 * - Other errors → returns null (silently skip)
 * - Content > 32KB → truncated with "[truncated]" suffix
 */
export function loadProjectInstructions(
  workspaceId: string,
): Effect.Effect<string | null, AppError, FileApi> {
  return Effect.gen(function* () {
    const svc = yield* FileApi;
    const content = yield* svc.readFile(workspaceId, "AGENTS.md");
    return truncateProjectInstructions(content);
  }).pipe(
    Effect.catchAll(() => Effect.succeed(null)),
  );
}
