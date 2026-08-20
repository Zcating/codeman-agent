import { For, Show, type JSX } from "solid-js";

export type FlatListValue = string;

export interface FlatListItem<V extends FlatListValue = FlatListValue> {
  value: V;
}

export interface FlatListProps<V extends FlatListValue = FlatListValue> {
  options: FlatListItem<V>[];
  renderItem: (item: FlatListItem<V>, index: number) => JSX.Element;
  ListSeparatorComponent?: JSX.Element;
  EmptyComponent?: JSX.Element;
  isLoading?: boolean;
  LoadingComponent?: JSX.Element;
  class?: string;
  "data-testid"?: string;
}

export function FlatList<V extends FlatListValue = FlatListValue>(
  props: FlatListProps<V>,
): JSX.Element {
  return (
    <Show
      when={!props.isLoading}
      fallback={props.LoadingComponent ?? null}
    >
      <Show
        when={props.options.length > 0}
        fallback={props.EmptyComponent ?? null}
      >
        <ul class={props.class} data-testid={props["data-testid"]}>
          <For each={props.options}>
            {(item, index) => (
              <>
                {index() > 0 ? props.ListSeparatorComponent : null}
                {props.renderItem(item, index())}
              </>
            )}
          </For>
        </ul>
      </Show>
    </Show>
  );
}
