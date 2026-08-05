import { appStore } from "@codeman-frontend/shared/stores/app.store";

export function getDefaultSystemPrompt(): string {
  return appStore.state.value.systemPrompt.default;
}

export function getUserCanEdit(): boolean {
  return appStore.state.value.systemPrompt.userCanEdit;
}

export function updateDefaultSystemPrompt(newDefault: string): void {
  const current = appStore.state.value.systemPrompt;
  appStore.set({
    systemPrompt: { ...current, default: newDefault },
  });
}
