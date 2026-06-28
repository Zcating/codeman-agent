//! codeman-dialog.tsx — Imperative alert/confirm/show API for dialogs.
//! Provides CodemanDialogProvider + useCodemanDialog hook.
//! Follows ADR-0023 D8-W6 pattern for imperative modal API.

import type { Component, JSX } from "solid-js";
import { createContext, createSignal, useContext } from "solid-js";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "../ui/dialog";
import { Button } from "../ui/button";

export interface CodemanDialogOptions {
  title: string;
  content: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

export interface CodemanDialog {
  alert(opts: { title: string; content: string; confirmText?: string }): Promise<void>;
  confirm(opts: {
    title: string;
    content: string;
    confirmText?: string;
    cancelText?: string;
    destructive?: boolean;
  }): Promise<boolean>;
  show<T>(
    render: (resolve: (value: T) => void, reject: (reason?: unknown) => void) => JSX.Element
  ): Promise<T>;
}

const CodemanDialogContext = createContext<CodemanDialog>();

export const CodemanDialogProvider: Component<{ children: JSX.Element }> = (props) => {
  const [dialogState, setDialogState] = createSignal<{
    type: "alert" | "confirm" | "custom";
    open: boolean;
    title?: string;
    content?: string;
    confirmText?: string;
    cancelText?: string;
    destructive?: boolean;
    renderFn?: (resolve: (value: unknown) => void, reject: (reason?: unknown) => void) => JSX.Element;
    resolve?: (value: unknown) => void;
    reject?: (reason?: unknown) => void;
  }>({ type: "alert", open: false });

  const dialogApi: CodemanDialog = {
    alert: (opts) => {
      return new Promise<void>((resolve) => {
        setDialogState({
          type: "alert",
          open: true,
          title: opts.title,
          content: opts.content,
          confirmText: opts.confirmText ?? "OK",
          resolve: resolve as (value: unknown) => void,
        });
      });
    },

    confirm: (opts) => {
      return new Promise<boolean>((resolve) => {
        setDialogState({
          type: "confirm",
          open: true,
          title: opts.title,
          content: opts.content,
          confirmText: opts.confirmText ?? "Confirm",
          cancelText: opts.cancelText ?? "Cancel",
          destructive: opts.destructive,
          resolve: resolve as (value: unknown) => void,
        });
      });
    },

    show: <T,>(render: (resolve: (value: T) => void, reject: (reason?: unknown) => void) => JSX.Element) => {
      return new Promise<T>((resolve, reject) => {
        setDialogState({
          type: "custom",
          open: true,
          renderFn: render as (resolve: (value: unknown) => void, reject: (reason?: unknown) => void) => JSX.Element,
          resolve: resolve as (value: unknown) => void,
          reject: reject,
        });
      });
    },
  };

  const handleClose = () => {
    const currentState = dialogState();
    if (currentState.type === "confirm" && currentState.resolve) {
      currentState.resolve(false);
    } else if (currentState.type === "alert" && currentState.resolve) {
      // alert resolves on confirm click, not close
    } else if (currentState.type === "custom" && currentState.reject) {
      currentState.reject(new Error("Dialog closed"));
    }
    setDialogState({ type: "alert", open: false });
  };

  const handleConfirm = () => {
    const currentState = dialogState();
    if (currentState.resolve) {
      if (currentState.type === "confirm") {
        currentState.resolve(true);
      } else if (currentState.type === "alert") {
        currentState.resolve(undefined);
      }
    }
    setDialogState({ type: "alert", open: false });
  };

  const handleResolve = (value: unknown) => {
    const currentState = dialogState();
    if (currentState.resolve) {
      currentState.resolve(value);
    }
    setDialogState({ type: "alert", open: false });
  };

  const handleReject = (reason?: unknown) => {
    const currentState = dialogState();
    if (currentState.reject) {
      currentState.reject(reason);
    }
    setDialogState({ type: "alert", open: false });
  };

  return (
    <CodemanDialogContext.Provider value={dialogApi}>
      {props.children}
      <Dialog
        open={dialogState().open}
        onOpenChange={(details) => {
          if (!details.open) {
            handleClose();
          }
        }}
      >
        <DialogContent>
          {dialogState().type === "custom" && dialogState().renderFn ? (
            dialogState().renderFn!(handleResolve, handleReject)
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{dialogState().title}</DialogTitle>
                <DialogDescription>{dialogState().content}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                {dialogState().type === "confirm" && (
                  <DialogClose data-testid="cancel-btn">{dialogState().cancelText}</DialogClose>
                )}
                <Button
                  variant={dialogState().destructive ? "destructive" : "default"}
                  onClick={handleConfirm}
                  data-testid="confirm-btn"
                >
                  {dialogState().confirmText}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </CodemanDialogContext.Provider>
  );
};

export function useCodemanDialog(): CodemanDialog {
  const context = useContext(CodemanDialogContext);
  if (!context) {
    throw new Error("useCodemanDialog must be used within a CodemanDialogProvider");
  }
  return context;
}
