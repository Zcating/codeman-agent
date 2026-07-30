
import { Effect } from "effect";
import { invoke } from "@codeman-frontend/shared/apis";

export const clearAllHistoryBridge = async (): Promise<boolean> => {
  const exit = await Effect.runPromiseExit(
    invoke<void>("clearAllHistory"),
  );
  return exit._tag === "Success";
};