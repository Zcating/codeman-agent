import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { cleanup, render, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { Dialog as ArkDialog } from "@codeman-frontend/shared/components/ui/dialog";
import { FormDialogShell } from "@codeman-frontend/shared/components/internal/form-dialog-shell";

interface TestFormValues {
  name: string;
  description: string;
  modelId: string;
  rows: string;
  enabled: boolean;
}

function mount(props: {
  title: string;
  fields: import("@codeman-frontend/shared/components/internal/form-dialog-shell").FormDialogField[];
  defaultValues: TestFormValues;
  onSubmit: (values: TestFormValues) => void | Promise<void>;
  onCancel: () => void;
}) {
  let result!: { unmount: () => void; container: HTMLElement };
  result = render(() => (
    <ArkDialog open>
      <FormDialogShell
        {...props}
      />
    </ArkDialog>
  ));
  return result;
}

describe("FormDialogShell", () => {
  beforeEach(() => {
    if (!document.getElementById("root")) {
      const root = document.createElement("div");
      root.id = "root";
      document.body.appendChild(root);
    }
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    const root = document.createElement("div");
    root.id = "root";
    document.body.appendChild(root);
  });

  const defaultProps: {
    title: string;
    fields: import("@codeman-frontend/shared/components/internal/form-dialog-shell").FormDialogField[];
    defaultValues: TestFormValues;
    onSubmit: (values: TestFormValues) => void | Promise<void>;
    onCancel: () => void;
  } = {
    title: "Test Dialog",
    fields: [
      { kind: "text", name: "name", label: "Name", placeholder: "Enter name" },
      { kind: "textarea", name: "description", label: "Description", rows: 8 },
      {
        kind: "select",
        name: "modelId",
        label: "Model",
        options: [
          { label: "Model A", value: "model-a" },
          { label: "Model B", value: "model-b" },
        ],
      },
      { kind: "checkbox", name: "enabled", label: "Enabled", description: "Enable this feature" },
    ],
    defaultValues: {
      name: "default-name",
      description: "default-description",
      modelId: "model-a",
      rows: "default-rows",
      enabled: true,
    },
    onSubmit: () => {},
    onCancel: () => {},
  };

  describe("field rendering", () => {
    it("renders text field with correct data-testid", () => {
      const { container } = mount(defaultProps);
      const nameField = container.querySelector('[data-testid="field-name"]');
      expect(nameField).toBeTruthy();
    });

    it("renders textarea field with rows prop applied", () => {
      const { container } = mount(defaultProps);
      const textarea = container.querySelector("textarea");
      expect(textarea).toBeTruthy();
      expect(textarea?.getAttribute("rows")).toBe("8");
    });

    it("renders select field with options", () => {
      const { container } = mount(defaultProps);
      const selectTrigger = container.querySelector('[data-testid="field-modelId-trigger"]');
      expect(selectTrigger).toBeTruthy();
    });

    it("renders checkbox field with description", () => {
      const { container } = mount(defaultProps);
      const checkbox = container.querySelector('[data-testid="field-enabled"]');
      expect(checkbox).toBeTruthy();
      expect(container.textContent).toContain("Enable this feature");
    });
  });

  describe("submit and cancel", () => {
    it("submit button calls onSubmit with form values", async () => {
      const user = userEvent.setup();
      let submittedValues: TestFormValues | null = null;
      const { container, unmount } = render(() => (
        <ArkDialog open>
          <FormDialogShell
            {...defaultProps}
            onSubmit={(values) => {
              submittedValues = values;
            }}
          />
        </ArkDialog>
      ));
      const submitBtn = container.querySelector(
        '[data-testid="dialog-submit-btn"]',
      ) as HTMLElement;
      expect(submitBtn).toBeTruthy();
      await user.click(submitBtn);
      expect(submittedValues).not.toBeNull();
      expect(submittedValues!.name).toBe("default-name");
      unmount();
    });

    it("cancel button calls onCancel", async () => {
      const user = userEvent.setup();
      let cancelCalled = false;
      const { container, unmount } = render(() => (
        <ArkDialog open>
          <FormDialogShell
            {...defaultProps}
            onCancel={() => {
              cancelCalled = true;
            }}
          />
        </ArkDialog>
      ));
      const cancelBtn = container.querySelector(
        '[data-testid="dialog-cancel-btn"]',
      ) as HTMLElement;
      expect(cancelBtn).toBeTruthy();
      await user.click(cancelBtn);
      expect(cancelCalled).toBe(true);
      unmount();
    });
  });

  describe("error banner", () => {
    it("shows red error banner when onSubmit rejects", async () => {
      const { container, unmount } = render(() => (
        <ArkDialog open>
          <FormDialogShell
            {...defaultProps}
            onSubmit={() => Promise.reject(new Error("Submission failed"))}
          />
        </ArkDialog>
      ));
      const submitBtn = container.querySelector(
        '[data-testid="dialog-submit-btn"]',
      ) as HTMLElement;
      await userEvent.setup().click(submitBtn);
      await new Promise((r) => setTimeout(r, 50));
      const errorBanner = container.querySelector(
        ".text-destructive.bg-destructive\\/10",
      );
      expect(errorBanner).toBeTruthy();
      expect(errorBanner?.textContent).toContain("Submission failed");
      unmount();
    });
  });

  describe("isSubmitting state", () => {
    it("disables submit button while onSubmit is pending", async () => {
      let resolveSubmit!: () => void;
      const submitPromise = new Promise<void>((resolve) => {
        resolveSubmit = resolve;
      });

      const { container, unmount } = render(() => (
        <ArkDialog open>
          <FormDialogShell
            {...defaultProps}
            onSubmit={() => submitPromise}
          />
        </ArkDialog>
      ));

      const submitBtn = container.querySelector(
        '[data-testid="dialog-submit-btn"]',
      ) as HTMLButtonElement;
      expect(submitBtn).toBeTruthy();
      expect(submitBtn.disabled).toBe(false);

      const clickPromise = userEvent.setup().click(submitBtn);

      await waitFor(() => {
        const btn = container.querySelector(
          '[data-testid="dialog-submit-btn"]',
        ) as HTMLButtonElement;
        expect(btn.disabled).toBe(true);
      });

      resolveSubmit();
      await clickPromise;
      unmount();
    });
  });

  describe("radio kind", () => {
    it("throws when radio kind is used", () => {
      expect(() => mount({
        ...defaultProps,
        fields: [
          {
            kind: "radio",
            name: "choice",
            label: "Choice",
            options: [
              { label: "Option A", value: "a" },
              { label: "Option B", value: "b" },
            ],
          },
        ],
      })).toThrow(/radio not implemented/);
    });
  });
});