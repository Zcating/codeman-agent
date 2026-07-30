


import { For, Show, type JSX } from "solid-js";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@codeman-frontend/shared/components/ui/accordion";
import { cn } from "@codeman-frontend/shared/lib/cn";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarInset,
} from "@codeman-frontend/shared/components/ui/sidebar";


export interface CodemanSidebarGroupOption {
  label: string;
  value: string;
  children: (CodemanSidebarMenuGroupOption | CodemanSidebarMenuOption)[];
}


export interface CodemanSidebarMenuGroupOption {
  label: string;
  value: string;
  icon?: JSX.Element;
  disabled?: boolean;
  
  defaultExpanded?: boolean;
  children: CodemanSidebarMenuOption[];
}


export interface CodemanSidebarMenuOption {
  label: string;
  value: string;
  icon?: JSX.Element;
  disabled?: boolean;
  
  forceSubMenu?: boolean;
}

export interface CodemanSidebarProps {
  options: CodemanSidebarGroupOption[];
  
  renderMenuGroup: (item: CodemanSidebarMenuGroupOption) => JSX.Element;
  
  renderMenu?: (menu: CodemanSidebarMenuOption) => JSX.Element;
  
  renderGroupHeader?: (group: CodemanSidebarGroupOption) => JSX.Element;

  
  currentValue?: string;
  
  isActive?: (value: string | undefined, currentValue: string | undefined) => boolean;
  
  onMenuGroupSelect?: (value: string) => void;
  
  onMenuSelect?: (value: string) => void;
  
  onEmptyGroupClick?: (groupValue: string) => void;

  
  header?: JSX.Element;
  
  footer?: JSX.Element;
  
  children?: JSX.Element;

  
  emptyMessage?: string;
  
  class?: string;
}

interface CodemanSidebarEmptyStateProps {
  message?: string;
}

interface CodemanSidebarEmptyGroupButtonProps {
  label: string;
  value: string;
  onClick?: ((groupValue: string) => void);
}

interface CodemanSidebarMenuGroupProps {
  item: CodemanSidebarMenuGroupOption;
  renderMenuGroup: (item: CodemanSidebarMenuGroupOption) => JSX.Element;
  renderMenu?: (menu: CodemanSidebarMenuOption) => JSX.Element;
  onMenuGroupSelect?: ((value: string) => void);
  onMenuSelect?: ((value: string) => void);
  isMenuActive: (menu: CodemanSidebarMenuOption) => boolean;
}

interface CodemanSidebarMenuViewProps {
  menu: CodemanSidebarMenuOption;
  onMenuSelect?: ((value: string) => void);
  renderMenu?: (menu: CodemanSidebarMenuOption) => JSX.Element;
  isActive: boolean;
}

interface CodemanSidebarGroupViewProps {
  group: CodemanSidebarGroupOption;
  renderMenuGroup: (item: CodemanSidebarMenuGroupOption) => JSX.Element;
  renderMenu?: (menu: CodemanSidebarMenuOption) => JSX.Element;
  renderGroupHeader?: (group: CodemanSidebarGroupOption) => JSX.Element;
  onMenuGroupSelect?: ((value: string) => void);
  onMenuSelect?: ((value: string) => void);
  onEmptyGroupClick?: ((groupValue: string) => void);
  isMenuActive: (menu: CodemanSidebarMenuOption) => boolean;
}


function CodemanSidebarEmptyState(
  props: CodemanSidebarEmptyStateProps,
): JSX.Element {
  return (
    <Show when={props.message}>
      <div
        data-testid="empty-state"
        class="p-3 text-sm text-muted-foreground"
      >
        {props.message}
      </div>
    </Show>
  );
}


function CodemanSidebarEmptyGroupButton(
  props: CodemanSidebarEmptyGroupButtonProps,
): JSX.Element {
  const handleClick = (): void => props.onClick?.(props.value);
  return (
    <div class="pl-6 pr-3 pb-2">
      <button
        type="button"
        class="w-full text-left px-2 py-1 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
        onClick={handleClick}
        data-empty-group-value={props.value}
      >
        {props.label} (empty)
      </button>
    </div>
  );
}


function CodemanSidebarMenuGroup(
  props: CodemanSidebarMenuGroupProps,
): JSX.Element {
  const { item } = props;
  const handleSelect = (): void => {
    if (item.disabled) {
      return;
    }
    props.onMenuGroupSelect?.(item.value);
  };

  return (
    <SidebarMenuItem>
      <Accordion
        multiple={false}
        collapsible={true}
        defaultValue={item.defaultExpanded ? [item.value] : []}
      >
        <AccordionItem value={item.value}>
          <AccordionTrigger
            class={cn(
              "peer/menu-button group/menu-button group/row w-full items-center gap-2 overflow-hidden rounded-md outline-hidden transition-[width,height,padding]",
              
              
              "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:no-underline",
              "font-normal",
              "focus-visible:ring-2",
              "data-active:bg-sidebar-accent data-active:font-medium data-active:text-sidebar-accent-foreground",
              "data-open:hover:bg-sidebar-accent data-open:hover:text-sidebar-accent-foreground",
              "p-2 text-sm h-8",
            )}
            data-value={item.value}
            onClick={handleSelect}
          >
            {props.renderMenuGroup(item)}
          </AccordionTrigger>
          <AccordionContent>
            <SidebarMenuSub>
              <For each={item.children}>
                {(menu) => (
                  <CodemanSidebarMenuView
                    menu={menu}
                    onMenuSelect={props.onMenuSelect}
                    renderMenu={props.renderMenu}
                    isActive={props.isMenuActive(menu)}
                  />
                )}
              </For>
            </SidebarMenuSub>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </SidebarMenuItem>
  );
}


function CodemanSidebarMenuView(
  props: CodemanSidebarMenuViewProps,
): JSX.Element {
  const handleMenuSelect = (): void => {
    if (props.menu.disabled) { return; }
    props.onMenuSelect?.(props.menu.value);
  };
  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton
        isActive={props.isActive}
        onClick={handleMenuSelect}
        data-value={props.menu.value}
      >
        {props.renderMenu ? props.renderMenu(props.menu) : props.menu.label}
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );
}


function CodemanSidebarGroupView(
  props: CodemanSidebarGroupViewProps,
): JSX.Element {
  const { group } = props;
  return (
    <SidebarGroup data-value={group.value}>
      <SidebarGroupLabel>
        {props.renderGroupHeader
          ? props.renderGroupHeader(group)
          : <span>{group.label}</span>}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <Show
          when={group.children.length > 0}
          fallback={
            <Show when={props.onEmptyGroupClick}>
              <CodemanSidebarEmptyGroupButton
                label={group.label}
                value={group.value}
                onClick={props.onEmptyGroupClick}
              />
            </Show>
          }
        >
          <SidebarMenu>
            <For each={group.children}>
              {(child) => (
                <Show
                  when={"children" in child && Array.isArray(child.children)}
                  fallback={
                    <Show
                      when={(child as CodemanSidebarMenuOption).forceSubMenu}
                      fallback={
                        <SidebarMenuItem>
                          <SidebarMenuButton
                            isActive={props.isMenuActive(child as CodemanSidebarMenuOption)}
                            onClick={(): void => {
                              const menu = child as CodemanSidebarMenuOption;
                              if (!menu.disabled) {
                                props.onMenuSelect?.(menu.value);
                              }
                            }}
                            data-value={(child as CodemanSidebarMenuOption).value}
                          >
                            {props.renderMenu
                              ? props.renderMenu(child as CodemanSidebarMenuOption)
                              : (child as CodemanSidebarMenuOption).label}
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      }
                    >
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          isActive={props.isMenuActive(child as CodemanSidebarMenuOption)}
                          onClick={(): void => {
                            const menu = child as CodemanSidebarMenuOption;
                            if (!menu.disabled) {
                              props.onMenuSelect?.(menu.value);
                            }
                          }}
                          data-value={(child as CodemanSidebarMenuOption).value}
                        >
                          {(child as CodemanSidebarMenuOption).icon}
                          <span class="truncate flex-1 text-sm">
                            {(child as CodemanSidebarMenuOption).label}
                          </span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </Show>
                  }
                >
                  <CodemanSidebarMenuGroup
                    item={child as CodemanSidebarMenuGroupOption}
                    renderMenuGroup={props.renderMenuGroup}
                    renderMenu={props.renderMenu}
                    onMenuGroupSelect={props.onMenuGroupSelect}
                    onMenuSelect={props.onMenuSelect}
                    isMenuActive={props.isMenuActive}
                  />
                </Show>
              )}
            </For>
          </SidebarMenu>
        </Show>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}


function makeIsMenuActive(
  currentValue: string | undefined,
  isActiveFn: CodemanSidebarProps["isActive"] | undefined,
): (menu: CodemanSidebarMenuOption) => boolean {
  if (isActiveFn) {
    return (menu) => isActiveFn(menu.value, currentValue);
  }
  return (menu) => menu.value === currentValue;
}

export function CodemanSidebar(props: CodemanSidebarProps): JSX.Element {
  const isMenuActive = makeIsMenuActive(props.currentValue, props.isActive);

  return (
    <div class="flex h-full w-full flex-col">
      <div class="flex flex-1 min-h-0">
        <Sidebar class={props.class}>
          <Show when={props.header}>
            <SidebarHeader>{props.header}</SidebarHeader>
          </Show>

          <SidebarContent>
            <Show
              when={props.options.length > 0}
              fallback={<CodemanSidebarEmptyState message={props.emptyMessage} />}
            >
              <For each={props.options}>
                {(group) => (
                  <CodemanSidebarGroupView
                    group={group}
                    renderMenuGroup={props.renderMenuGroup}
                    renderMenu={props.renderMenu}
                    renderGroupHeader={props.renderGroupHeader}
                    onMenuGroupSelect={props.onMenuGroupSelect}
                    onMenuSelect={props.onMenuSelect}
                    onEmptyGroupClick={props.onEmptyGroupClick}
                    isMenuActive={isMenuActive}
                  />
                )}
              </For>
            </Show>
          </SidebarContent>

          <Show when={props.footer}>
            <SidebarFooter>{props.footer}</SidebarFooter>
          </Show>
        </Sidebar>

        <Show when={props.children}>
          <SidebarInset class="min-h-0 overflow-y-auto">{props.children}</SidebarInset>
        </Show>
      </div>
    </div>
  );
}