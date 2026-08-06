
import { createSignal, Show, type JSX } from "solid-js";
import { render, Portal } from "solid-js/web";
import { X } from "lucide-solid";
import {
  Dialog as ArkDialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@codeman-frontend/shared/components/ui/dialog";
import { Button } from "@codeman-frontend/shared/components/ui/button";

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

export interface DialogShowOptions {
  /**
   * Optional dialog title. When provided, `Dialog.show` renders a
   * `DialogHeader` + `DialogTitle` and a top-right close button (X)
   * that resolves the promise with `null`.
   */
  title?: string;
}

function getMountTarget(): HTMLElement {
  return document.getElementById("root")?.parentElement ?? document.body;
}

function createContainer(): HTMLDivElement {
  const el = document.createElement("div");
  getMountTarget().appendChild(el);
  return el;
}

export const Dialog = {
  alert(opts: DialogAlertOptions): Promise<void> {
    return new Promise<void>((resolve) => {
      const container = createContainer();
      const [open, setOpen] = createSignal(true);
      // 命令式 Dialog.* 默认就是 open；zag-js controlled 模式下不会发
      // onOpenChange({open:true})，所以这里直接初始化为 true，避免外部
      // 触发 onOpenChange({open:false}) 时被 `wasOpened` 检查吞掉。
      let wasOpened = true;

      const dispose = render(
        () => (
          <Portal mount={getMountTarget()}>
            <ArkDialog
              open={open()}
              onOpenChange={(details) => {
                if (details.open) {
                  wasOpened = true;
                } else if (wasOpened) {
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
      // 命令式 Dialog.* 默认就是 open；zag-js controlled 模式下不会发
      // onOpenChange({open:true})，所以这里直接初始化为 true，避免外部
      // 触发 onOpenChange({open:false}) 时被 `wasOpened` 检查吞掉。
      let wasOpened = true;

      const cleanupDialog = () => {
        try {
          dispose();
        } catch {
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
    renderFn: (resolve: (value: T | null) => void) => JSX.Element,
    options?: DialogShowOptions,
  ): Promise<T | null> {
    return new Promise<T | null>((resolve) => {
      const container = createContainer();
      const [open, setOpen] = createSignal(true);
      // 命令式 Dialog.* 默认就是 open；zag-js controlled 模式下不会发
      // onOpenChange({open:true})，所以这里直接初始化为 true，避免外部
      // 触发 onOpenChange({open:false}) 时被 `wasOpened` 检查吞掉。
      let wasOpened = true;

      const cleanupDialog = () => {
        try {
          dispose();
        } catch {
        }
        if (container.parentNode) {
          container.remove();
        }
      };

      const handleResolve = (value: T | null) => {
        // renderFn 内部通常只 resolve 一个非空值（用户提交表单），
        // 但 renderFn 的 resolve 参数类型是 (value: T | null) → void，
        // 这里必须 match 那个签名。
        resolve(value);
        setOpen(false);
        setTimeout(cleanupDialog, 300);
      };

      const handleClose = () => {
        if (!wasOpened) {return;}
        resolve(null);
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
                <DialogClose
                  data-testid="dialog-close"
                  aria-label="关闭对话框"
                  class="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <X class="h-4 w-4" />
                </DialogClose>
                <Show when={options?.title}>
                  {(title) => (
                    <DialogHeader>
                      <DialogTitle>{title()}</DialogTitle>
                    </DialogHeader>
                  )}
                </Show>

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
