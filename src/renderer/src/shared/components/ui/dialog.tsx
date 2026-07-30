


import type { Component, JSX } from "solid-js";
import { splitProps } from "solid-js";
import { DialogBackdrop as ArkBackdrop, DialogCloseTrigger as ArkCloseTrigger, DialogContent as ArkContent, DialogDescription as ArkDescription, DialogPositioner as ArkPositioner, DialogRoot as ArkRoot, DialogTitle as ArkTitle, DialogTrigger as ArkTrigger } from "@ark-ui/solid/dialog";
import { cn } from "@codeman-frontend/shared/lib/cn";

interface DialogOpenChangeDetails {
  open: boolean;
}

export interface DialogProps {
  open?: boolean;
  onOpenChange?: (details: DialogOpenChangeDetails) => void;
  children?: JSX.Element;
}

export const DialogRootBase: Component<DialogProps> = (props) => {
  return (
    <ArkRoot open={props.open} onOpenChange={props.onOpenChange}>
      {props.children}
    </ArkRoot>
  );
};

export interface DialogTriggerProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: JSX.Element;
  "data-testid"?: string;
}

export const DialogTriggerComponent: Component<DialogTriggerProps> = (props) => {
  const [local, rest] = splitProps(props, ["children", "data-testid"]);
  return (
    <ArkTrigger data-testid={local["data-testid"]} {...rest}>
      {local.children}
    </ArkTrigger>
  );
};

export interface DialogContentProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children?: JSX.Element;
  "data-testid"?: string;
}

export const DialogContentComponent: Component<DialogContentProps> = (props) => {
  const [local, rest] = splitProps(props, ["children", "data-testid"]);

  return (
    <ArkPositioner>
      <ArkBackdrop class="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <ArkContent
        data-testid={local["data-testid"]}
        class={cn(
          "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%]",
          "gap-4 border bg-background p-6 shadow-lg duration-200",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          "data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]",
          "data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
          "rounded-lg"
        )}
        {...rest}
      >
        {local.children}
      </ArkContent>
    </ArkPositioner>
  );
};

export interface DialogHeaderProps {
  children?: JSX.Element;
}

export const DialogHeaderComponent: Component<DialogHeaderProps> = (props) => {
  return <div class="flex flex-col space-y-1.5 text-center sm:text-left">{props.children}</div>;
};

export interface DialogTitleProps extends JSX.HTMLAttributes<HTMLHeadingElement> {
  children?: JSX.Element;
}

export const DialogTitleComponent: Component<DialogTitleProps> = (props) => {
  const [local, rest] = splitProps(props, ["children"]);
  return (
    <ArkTitle class="text-lg font-semibold leading-none tracking-tight" {...rest}>
      {local.children}
    </ArkTitle>
  );
};

export interface DialogDescriptionProps extends JSX.HTMLAttributes<HTMLParagraphElement> {
  children?: JSX.Element;
}

export const DialogDescriptionComponent: Component<DialogDescriptionProps> = (props) => {
  const [local, rest] = splitProps(props, ["children"]);
  return (
    <ArkDescription class="text-sm text-muted-foreground" {...rest}>
      {local.children}
    </ArkDescription>
  );
};

export interface DialogFooterProps {
  children?: JSX.Element;
}

export const DialogFooterComponent: Component<DialogFooterProps> = (props) => {
  return (
    <div class="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
      {props.children}
    </div>
  );
};

export interface DialogCloseProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: JSX.Element;
  "data-testid"?: string;
}

export const DialogCloseComponent: Component<DialogCloseProps> = (props) => {
  const [local, rest] = splitProps(props, ["children", "data-testid"]);
  return (
    <ArkCloseTrigger data-testid={local["data-testid"]} {...rest}>
      {local.children}
    </ArkCloseTrigger>
  );
};


export const Dialog = DialogRootBase;
export const DialogTrigger = DialogTriggerComponent;
export const DialogContent = DialogContentComponent;
export const DialogHeader = DialogHeaderComponent;
export const DialogTitle = DialogTitleComponent;
export const DialogDescription = DialogDescriptionComponent;
export const DialogFooter = DialogFooterComponent;
export const DialogClose = DialogCloseComponent;
