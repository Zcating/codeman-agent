//! Manual mock for @tauri-apps/api/core — used by Effect service tests.
//! vitest automatically uses __mocks__ when the module is imported.
//! Configure return values via the exported mockState object.

export const mockState = {
  resolved: undefined as unknown,
  rejected: undefined as Error | undefined,
  calls: [] as string[],
};

export function invoke(name: string, _args?: Record<string, unknown>) {
  mockState.calls.push(name);
  if (mockState.rejected) {
    return Promise.reject(mockState.rejected);
  }
  return Promise.resolve(mockState.resolved);
}

export default { invoke };