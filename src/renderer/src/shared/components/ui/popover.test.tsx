import { describe, expect, it, vi } from "vitest";
import { render } from "@solidjs/testing-library";

const { mockRoot } = vi.hoisted(() => ({
  mockRoot: vi.fn(),
}));

vi.mock("@ark-ui/solid/popover", () => ({
  Popover: {
    Root: (props: Record<string, unknown>) => {
      mockRoot(props);
      return null;
    },
    Anchor: () => null,
    Positioner: () => null,
    Content: () => null,
    Trigger: () => null,
    Title: () => null,
    Description: () => null,
    CloseTrigger: () => null,
  },
}));

import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@codeman-frontend/shared/components/ui/popover";

describe("Popover prop forwarding", () => {
  beforeEach(() => {
    mockRoot.mockClear();
  });

  it("forwards autoFocus={false} to ArkPopover.Root", () => {
    render(() => (
      <Popover open autoFocus={false} onOpenChange={() => {}}>
        <PopoverAnchor />
        <PopoverContent>content</PopoverContent>
      </Popover>
    ));
    expect(mockRoot).toHaveBeenCalledWith(
      expect.objectContaining({ autoFocus: false }),
    );
  });

  it("forwards restoreFocus={false} to ArkPopover.Root", () => {
    render(() => (
      <Popover open restoreFocus={false} onOpenChange={() => {}}>
        <PopoverAnchor />
        <PopoverContent>content</PopoverContent>
      </Popover>
    ));
    expect(mockRoot).toHaveBeenCalledWith(
      expect.objectContaining({ restoreFocus: false }),
    );
  });

  it("forwards closeOnInteractOutside={false} to ArkPopover.Root", () => {
    render(() => (
      <Popover open closeOnInteractOutside={false} onOpenChange={() => {}}>
        <PopoverAnchor />
        <PopoverContent>content</PopoverContent>
      </Popover>
    ));
    expect(mockRoot).toHaveBeenCalledWith(
      expect.objectContaining({ closeOnInteractOutside: false }),
    );
  });

  it("forwards closeOnEscape={false} to ArkPopover.Root", () => {
    render(() => (
      <Popover open closeOnEscape={false} onOpenChange={() => {}}>
        <PopoverAnchor />
        <PopoverContent>content</PopoverContent>
      </Popover>
    ));
    expect(mockRoot).toHaveBeenCalledWith(
      expect.objectContaining({ closeOnEscape: false }),
    );
  });
});
