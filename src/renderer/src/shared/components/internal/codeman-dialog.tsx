//! codeman-dialog.tsx — Imperative alert/confirm/show API for dialogs.
//! Module-level singleton using render() + Portal from solid-js/web.
//! Follows ADR-0023 D8-W6 pattern for imperative modal API.

import { createSignal, type JSX } from "solid-js";
import { render, Portal } from "solid-js/web";
import {
  Dialog as ArkDialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DialogAlertOptions {
  title: string;
  content: string;
  confirmText?: string;
}

export interface DialogConfirmOptions {
  title: string;
  content: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getMountTarget(): HTMLElement {
  return document.getElementById("root")?.parentElement ?? document.body;
}

function createContainer(): HTMLDivElement {
  const el = document.createElement("div");
  getMountTarget().appendChild(el);
  return el;
}

// ─── Dialog API ──────────────────────────────────────────────────────────────

export const Dialog = {
  alert(opts: DialogAlertOptions): Promise<void> {
    return new Promise<void>((resolve) => {
      const container = createContainer();
      const [open, setOpen] = createSignal(true);
      let wasOpened = false;

      const dispose = render(
        () => (
          <Portal mount={getMountTarget()}>
            <ArkDialog
              open={open()}
              onOpenChange={(details) => {
                if (details.open) {
                  wasOpened = true;
                } else if (wasOpened) {
                  // Only handle close after user opened it
                  resolve();
                  dispose();
                  container.remove();
                }
              }}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{opts.title}</DialogTitle>
                  <DialogDescription>{opts.content}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    onClick={() => {
                      setOpen(false);
                    }}
                  >
                    {opts.confirmText ?? "OK"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </ArkDialog>
          </Portal>
        ),
        container,
      );
    });
  },

  confirm(opts: DialogConfirmOptions): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const container = createContainer();
      const [open, setOpen] = createSignal(true);
      let wasOpened = false;

      // setTimeout cleanup callback: defensive against external DOM mutation
      // (test teardown may remove container before 300ms elapses). Wrap dispose
      // in try/catch (Solid unmount may throw on detached subtrees) and check
      // parentNode before container.remove() (Node.removeChild throws
      // NOT_FOUND_ERR on already-detached nodes).
      const cleanupDialog = () => {
        try {
          dispose();
        } catch {
          /* already unmounted */
        }
        if (container.parentNode) {
          container.remove();
        }
      };

      const handleClose = () => {
        if (!wasOpened) {return;}
        resolve(false);
        setOpen(false);
        setTimeout(cleanupDialog, 300);
      };

      const handleConfirm = () => {
        resolve(true);
        setOpen(false);
        setTimeout(cleanupDialog, 300);
      };

      const dispose = render(
        () => (
          <Portal mount={getMountTarget()}>
            <ArkDialog
              open={open()}
              onOpenChange={(details) => {
                if (details.open) {
                  wasOpened = true;
                } else if (wasOpened) {
                  handleClose();
                }
              }}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{opts.title}</DialogTitle>
                  <DialogDescription>{opts.content}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={handleClose}
                    data-testid="cancel-btn"
                  >
                    {opts.cancelText ?? "Cancel"}
                  </Button>
                  <Button
                    variant={opts.destructive ? "destructive" : "default"}
                    onClick={handleConfirm}
                    data-testid="confirm-btn"
                  >
                    {opts.confirmText ?? "Confirm"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </ArkDialog>
          </Portal>
        ),
        container,
      );
    });
  },

  show<T>(
    renderFn: (resolve: (value: T) => void) => JSX.Element,
  ): Promise<T> {
    return new Promise<T>((resolve) => {
      const container = createContainer();
      const [open, setOpen] = createSignal(true);
      let wasOpened = false;

      // setTimeout cleanup callback: defensive against external DOM mutation
      // (test teardown may remove container before 300ms elapses). Wrap dispose
      // in try/catch (Solid unmount may throw on detached subtrees) and check
      // parentNode before container.remove() (Node.removeChild throws
      // NOT_FOUND_ERR on already-detached nodes).
      const cleanupDialog = () => {
        try {
          dispose();
        } catch {
          /* already unmounted */
        }
        if (container.parentNode) {
          container.remove();
        }
      };

      const handleResolve = (value: T) => {
        resolve(value);
        setOpen(false);
        setTimeout(cleanupDialog, 300);
      };

      const handleClose = () => {
        if (!wasOpened) {return;}
        resolve(null as unknown as T);
        setOpen(false);
        setTimeout(cleanupDialog, 300);
      };

      const dispose = render(
        () => (
          <Portal mount={getMountTarget()}>
            <ArkDialog
              open={open()}
              onOpenChange={(details) => {
                if (details.open) {
                  wasOpened = true;
                } else if (wasOpened) {
                  handleClose();
                }
              }}
            >
              <DialogContent>
                {renderFn(handleResolve)}
              </DialogContent>
            </ArkDialog>
          </Portal>
        ),
        container,
      );
    });
  },
};
