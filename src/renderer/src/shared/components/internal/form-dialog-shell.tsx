
import { createSignal, For, Show, type JSX } from "solid-js";
import { Schema } from "effect";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@codeman-frontend/shared/components/ui/dialog";
import { Button } from "@codeman-frontend/shared/components/ui/button";
import { ScrollArea } from "@codeman-frontend/shared/components/ui/scrollarea";
import { CodemanInput } from "@codeman-frontend/shared/components/internal/codeman-input";
import { CodemanTextarea } from "@codeman-frontend/shared/components/internal/codeman-textarea";
import { CodemanSelect } from "@codeman-frontend/shared/components/internal/codeman-select";
import { CodemanCheckbox } from "@codeman-frontend/shared/components/internal/codeman-checkbox";
import { effectSchema, firstErrorMessage } from "@codeman-frontend/shared/lib/effect-schema-adapter";

export interface CommonOption {
  label: string;
  value: string;
}

export interface BaseField {
  name: string;
  label?: JSX.Element;
  helperText?: JSX.Element;
  required?: boolean;
  placeholder?: string;
}

export interface TextField extends BaseField {
  kind: "text";
}

export interface PasswordField extends BaseField {
  kind: "password";
}

export interface NumberField extends BaseField {
  kind: "number";
}

export interface TextareaField extends BaseField {
  kind: "textarea";
  rows?: number;
}

export interface SelectField extends BaseField {
  kind: "select";
  options: CommonOption[];
  multiple?: boolean;
  allowCustomValue?: boolean;
}

export interface CheckboxField extends BaseField {
  kind: "checkbox";
  description?: string;
}

export interface RadioField extends BaseField {
  kind: "radio";
  options: CommonOption[];
}

export type FormDialogField =
  | TextField
  | PasswordField
  | NumberField
  | TextareaField
  | SelectField
  | CheckboxField
  | RadioField;

export interface FormDialogShellProps<T> {
  title: string;
  description?: string;
  fields: FormDialogField[];
  defaultValues: T;
  schema?: Schema.Schema<T>;
  onSubmit: (values: T) => void | Promise<void>;
  onCancel: () => void;
  actions?: JSX.Element;
  cancelLabel?: string;
  submitLabel?: string;
  "data-testid"?: string;
}

function getDefaultValue<T>(defaultValues: T, name: string): unknown {
  return (defaultValues as Record<string, unknown>)[name] ?? "";
}

export function FormDialogShell<T>(props: FormDialogShellProps<T>): JSX.Element {
  const [submitError, setSubmitError] = createSignal<Error | null>(null);
  const [isSubmitting, setIsSubmitting] = createSignal(false);

  const [fieldValues, setFieldValues] = createSignal<Record<string, unknown>>(
    props.fields.reduce<Record<string, unknown>>((acc, field) => {
      acc[field.name] = getDefaultValue(props.defaultValues, field.name);
      return acc;
    }, {} as Record<string, unknown>),
  );

  const setFieldValue = (name: string, value: unknown): void => {
    setFieldValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (): void => {
    setSubmitError(null);
    if (props.schema) {
      const validator = effectSchema(props.schema);
      const result = validator["~standard"].validate(fieldValues());
      if ("issues" in result) {
        const msg = firstErrorMessage(result.issues as unknown as ReadonlyArray<unknown>);
        setSubmitError(new Error(msg ?? "Validation failed"));
        return;
      }
    }
    const result = props.onSubmit(fieldValues() as T);
    if (result && typeof result === "object" && "then" in result) {
      setIsSubmitting(true);
      result.then(
        () => setIsSubmitting(false),
        (err: unknown) => {
          setIsSubmitting(false);
          setSubmitError(err instanceof Error ? err : new Error(String(err)));
        },
      );
    }
  };

  return (
    <DialogContent data-testid={props["data-testid"]}>
      <DialogHeader>
        <DialogTitle>{props.title}</DialogTitle>
        <Show when={props.description}>
          <DialogDescription>{props.description}</DialogDescription>
        </Show>
      </DialogHeader>

      <Show when={submitError()}>
        <div class="text-sm text-destructive bg-destructive/10 p-2 rounded">
          {submitError()!.message}
        </div>
      </Show>

      <ScrollArea
        class="max-h-[60vh]"
        viewportClass="flex flex-col gap-3 pr-5"
      >
        <For each={props.fields}>
          {(field) => {
            const value = () => fieldValues()[field.name] ?? "";
            switch (field.kind) {
              case "text":
                return (
                  <CodemanInput
                    label={field.label}
                    data-testid={`field-${field.name}`}
                    value={value() as string}
                    onValueChange={(v) => setFieldValue(field.name, v)}
                    placeholder={field.placeholder}
                    required={field.required}
                    helperText={field.helperText}
                  />
                );
              case "password":
                return (
                  <CodemanInput
                    type="password"
                    label={field.label}
                    data-testid={`field-${field.name}`}
                    value={value() as string}
                    onValueChange={(v) => setFieldValue(field.name, v)}
                    placeholder={field.placeholder}
                    required={field.required}
                    helperText={field.helperText}
                  />
                );
              case "number":
                return (
                  <CodemanInput
                    type="number"
                    label={field.label}
                    data-testid={`field-${field.name}`}
                    value={String(value() ?? "")}
                    onValueChange={(v) =>
                      setFieldValue(field.name, v === "" ? "" : Number(v))
                    }
                    placeholder={field.placeholder}
                    required={field.required}
                    helperText={field.helperText}
                  />
                );
              case "textarea":
                return (
                  <CodemanTextarea
                    label={field.label}
                    data-testid={`field-${field.name}`}
                    value={value() as string}
                    onValueChange={(v) => setFieldValue(field.name, v)}
                    placeholder={field.placeholder}
                    required={field.required}
                    helperText={field.helperText}
                    rows={field.rows}
                  />
                );
              case "select":
                return (
                  <div class="space-y-1.5">
                    <Show when={field.label}>
                      <label class="text-sm font-medium">{field.label}</label>
                    </Show>
                    <CodemanSelect
                      options={field.options}
                      value={(value() as string) ?? null}
                      onChange={(v) => setFieldValue(field.name, v)}
                      placeholder={field.placeholder}
                      data-testid={`field-${field.name}`}
                    />
                    <Show when={field.helperText}>
                      <p class="text-xs text-muted-foreground">{field.helperText}</p>
                    </Show>
                  </div>
                );
              case "checkbox":
                return (
                  <label class="flex items-center gap-2 text-sm cursor-pointer">
                    <CodemanCheckbox
                      data-testid={`field-${field.name}`}
                      value={(value() as boolean) ?? false}
                      onChange={(v) => setFieldValue(field.name, v)}
                    />
                    <Show when={field.label}>{field.label}</Show>
                    <Show when={field.description}>
                      <span class="text-xs text-muted-foreground ml-1">
                        {field.description}
                      </span>
                    </Show>
                  </label>
                );
              case "radio":
                throw new Error("radio not implemented");
              default:
                throw new Error(`Unknown field kind`);
            }
          }}
        </For>
      </ScrollArea>

      <DialogFooter>
        <Show when={props.actions}>{props.actions}</Show>
        <Show
          when={props.cancelLabel !== ""}
          fallback={null}
        >
          <Button
            variant="outline"
            onClick={props.onCancel}
            data-testid="dialog-cancel-btn"
          >
            {props.cancelLabel ?? "取消"}
          </Button>
        </Show>
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting()}
          data-testid="dialog-submit-btn"
        >
          {props.submitLabel ?? "添加"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
