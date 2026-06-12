//! Tiny circular switch button. Cycles the active provider.

import type { ProviderId } from "../lib/types";
import { ALL_PROVIDERS, nextProvider } from "../lib/types";

interface Props {
  active: ProviderId;
  onSwitch: (id: ProviderId) => void;
}

export function Switcher(props: Props) {
  return (
    <div class="switcher" role="tablist" aria-label="Provider">
      {ALL_PROVIDERS.map((id) => (
        <button
          type="button"
          role="tab"
          aria-selected={props.active === id}
          class={`switcher-dot ${props.active === id ? "is-active" : ""}`}
          title={id === "deepseek" ? "DeepSeek" : "MiniMax"}
          onClick={(e) => {
            e.stopPropagation();
            props.onSwitch(nextProvider(props.active));
          }}
        />
      ))}
    </div>
  );
}
