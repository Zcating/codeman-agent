import { Cause } from "effect";
import { isAppError, type AppError } from "@codeman-frontend/shared/lib/errors";
import type { TauriError } from "@codeman-frontend/shared/apis";

export function formatAppError(cause: Cause.Cause<AppError | TauriError>): string {
  const failures = Cause.failures(cause);
  if (failures.length === 0) {
    if (Cause.isInterrupted(cause)) {
      return "Interrupted";
    }
    return `Defect: ${String(Cause.squash(cause))}`;
  }
  return Array.from(failures).map(formatOne).join("; ");
}

function formatOne(e: AppError | TauriError): string {
  if (isAppError(e)) {
    return `${e._tag}: ${e.message || "(no message)"}`;
  }
  if (
    e &&
    typeof e === "object" &&
    "kind" in e &&
    (e as { kind: unknown }).kind === "IPC"
  ) {
    return `IPC: ${(e as { message: unknown }).message || "(no message)"}`;
  }
  return String(e);
}
