import { Show, createUniqueId, type JSX } from "solid-js";
import { ScrollArea } from "@codeman-frontend/shared/components/ui/scrollarea";
import { Separator } from "@codeman-frontend/shared/components/ui/separator";

export interface PageLayoutShellProps {
  title: string;
  description?: string;
  body: JSX.Element;
  footer?: JSX.Element;
  "data-testid"?: string;
}

export function PageLayoutShell(props: PageLayoutShellProps): JSX.Element {
  const headerTitleId = createUniqueId();

  return (
    <div class="flex flex-col h-full min-h-0">
      <header>
        <h2
          class="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
          id={headerTitleId}
        >
          {props.title}
        </h2>
        <Show when={props.description}>
          <p class="text-xs text-muted-foreground mt-0.5">
            {props.description}
          </p>
        </Show>
      </header>

      <ScrollArea
        class="flex-1 min-h-0"
        data-scroll-region="true"
        viewportClass="space-y-4 py-4 pl-4 pr-6"
        data-testid={props["data-testid"]}
        aria-labelledby={headerTitleId}
      >
        {props.body}
      </ScrollArea>

      <Show when={props.footer}>
        <Separator />
        <div class="flex justify-end px-4 py-3 bg-background">
          {props.footer}
        </div>
      </Show>
    </div>
  );
}
