import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@solidjs/testing-library";

const { mockRoot, mockAnchor } = vi.hoisted(() => ({
  mockRoot: vi.fn(),
  mockAnchor: vi.fn(),
}));

vi.mock("@ark-ui/solid/popover", () => ({
  Popover: {
    Root: (props: Record<string, unknown>) => {
      mockRoot(props);
      return null;
    },
    Anchor: (props: Record<string, unknown>) => {
      mockAnchor(props);
      return null;
    },
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

describe("PopoverAnchor — layout neutrality", () => {
  beforeEach(() => {
    mockAnchor.mockClear();
  });

  it("does NOT apply inline-block class to ArkPopover.Anchor", () => {
    render(() => <PopoverAnchor />);
    const props = mockAnchor.mock.calls[0]?.[0] as
      | { class?: string }
      | undefined;
    expect(props?.class ?? "").not.toContain("inline-block");
  });
});
