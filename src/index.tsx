/* @refresh reload */
import "./index.css";
import { render } from "solid-js/web";
import { RouterProvider } from "@tanstack/solid-router";
import { router } from "./router";
import { appStore } from "./shared/stores/app.store";
import { Effect } from "effect";

const root = document.getElementById("root");

// Eager load Settings before mounting RouterProvider (ADR-0015).
// 让 chat feature 启动时可立即读 default_llm_provider_id 等字段。
async function bootstrap() {
  await Effect.runPromise(appStore.refresh());
  if (root) render(() => <RouterProvider router={router} />, root);
}

void bootstrap();
