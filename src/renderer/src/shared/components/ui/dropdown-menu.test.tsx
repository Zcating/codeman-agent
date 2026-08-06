import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuShortcut,
} from "@codeman-frontend/shared/components/ui/dropdown-menu";

async function openMenu(): Promise<void> {
  const user = userEvent.setup();
  await user.click(screen.getByTestId("trigger"));
}

describe("DropdownMenu", () => {
  it("renders trigger before open", () => {
    render(() => (
      <DropdownMenu>
        <DropdownMenuTrigger data-testid="trigger">Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem value="rename">重命名</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ));

    expect(screen.getByTestId("trigger")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
  });

  it("opens on trigger click and renders content with items", async () => {
    render(() => (
      <DropdownMenu>
        <DropdownMenuTrigger data-testid="trigger">Open</DropdownMenuTrigger>
        <DropdownMenuContent data-testid="content">
          <DropdownMenuItem value="rename">重命名</DropdownMenuItem>
          <DropdownMenuItem value="delete">删除</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ));

    await openMenu();

    expect(screen.getByTestId("content")).toBeInTheDocument();
    expect(screen.getByText("重命名")).toBeInTheDocument();
    expect(screen.getByText("删除")).toBeInTheDocument();
  });

  it("calls onSelect when an item is clicked", async () => {
    const onSelect = vi.fn();
    render(() => (
      <DropdownMenu onSelect={onSelect}>
        <DropdownMenuTrigger data-testid="trigger">Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem value="rename" data-testid="item-rename">
            重命名
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ));

    await openMenu();
    await userEvent.setup().click(screen.getByTestId("item-rename"));

    expect(onSelect).toHaveBeenCalled();
  });

  it("item with variant=destructive gets destructive classes", async () => {
    render(() => (
      <DropdownMenu>
        <DropdownMenuTrigger data-testid="trigger">Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem value="delete" variant="destructive" data-testid="item-delete">
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ));

    await openMenu();

    const item = screen.getByTestId("item-delete");
    expect(item.className).toContain("text-destructive");
    expect(item).toHaveAttribute("data-variant", "destructive");
  });

  it("renders label, separator and shortcut inside content", async () => {
    render(() => (
      <DropdownMenu>
        <DropdownMenuTrigger data-testid="trigger">Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>操作</DropdownMenuLabel>
          <DropdownMenuItem value="rename">
            重命名
            <DropdownMenuShortcut>F2</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator data-testid="separator" />
          <DropdownMenuItem value="delete" variant="destructive">
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ));

    await openMenu();

    expect(screen.getByText("操作")).toBeInTheDocument();
    expect(screen.getByText("F2")).toBeInTheDocument();
    expect(screen.getByTestId("separator")).toBeInTheDocument();
  });

  it("renders checkbox and radio items", async () => {
    render(() => (
      <DropdownMenu>
        <DropdownMenuTrigger data-testid="trigger">Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuCheckboxItem value="pin" checked data-testid="item-check">
            置顶
          </DropdownMenuCheckboxItem>
          <DropdownMenuRadioGroup value="a" onValueChange={() => {}}>
            <DropdownMenuRadioItem value="a" data-testid="item-radio-a">
              A
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="b" data-testid="item-radio-b">
              B
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    ));

    await openMenu();

    expect(screen.getByTestId("item-check")).toBeInTheDocument();
    expect(screen.getByTestId("item-radio-a")).toBeInTheDocument();
    expect(screen.getByTestId("item-radio-b")).toBeInTheDocument();
  });
});
