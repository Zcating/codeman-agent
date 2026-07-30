
import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@codeman-frontend/shared/components/ui/dialog";

describe("Dialog", () => {
  it("renders trigger and content with all sub-components", () => {
    render(() => (
      <Dialog open={false} onOpenChange={() => {}}>
        <DialogTrigger data-testid="trigger">Open</DialogTrigger>
        <DialogContent data-testid="content">
          <DialogHeader>
            <DialogTitle>Title</DialogTitle>
            <DialogDescription>Description</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose data-testid="close">Cancel</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    ));

    
    expect(screen.getByTestId("trigger")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();

    
    expect(screen.getByTestId("content")).toBeInTheDocument();
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByTestId("close")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("opens on trigger click (onOpenChange callback)", async () => {
    const user = userEvent.setup();
    let openChangeCalled = false;

    render(() => (
      <Dialog open={false} onOpenChange={() => { openChangeCalled = true; }}>
        <DialogTrigger data-testid="trigger">Open</DialogTrigger>
        <DialogContent data-testid="content">
          <DialogHeader>
            <DialogTitle>Title</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    ));

    await user.click(screen.getByTestId("trigger"));

    
    expect(openChangeCalled).toBe(true);
  });

  it("renders with open=false initially (closed state)", () => {
    render(() => (
      <Dialog open={false} onOpenChange={() => {}}>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent data-testid="content">
          <DialogHeader>
            <DialogTitle>Title</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    ));

    
    const content = screen.getByTestId("content");
    expect(content).toBeInTheDocument();
    expect(content).toHaveAttribute("data-state", "closed");
  });
});
