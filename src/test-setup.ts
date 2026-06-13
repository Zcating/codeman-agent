import "@testing-library/jest-dom";
import { vi } from "vitest";
import { mockState } from "./shared-mock-state";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (name: string) => {
    mockState.calls.push(name);
    if (mockState.rejected) return Promise.reject(mockState.rejected);
    return Promise.resolve(mockState.resolved);
  },
}));