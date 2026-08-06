
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";

import { createProviderFormDialog } from "@codeman-frontend/features/settings/components/add-provider-dialog";
import { enforceDefaultModelInvariant } from "@codeman-frontend/shared/lib/provider-invariant";
import { codemanToast } from "@codeman-frontend/shared/components/internal/codeman-toast";
import { PROVIDER_PRESETS } from "@codeman-frontend/features/settings/lib/provider-presets";
import type { CodemanSelectOption } from "@codeman-frontend/shared/components/internal/codeman-select";

vi.mock("@codeman-frontend/shared/components/internal/codeman-toast", () => ({
  codemanToast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@codeman-frontend/shared/lib/provider-invariant", () => ({
  enforceDefaultModelInvariant: vi.fn((llm) => llm),
}));

let mockIsOpen = false;
let sharedOnValueChange: ((details: { value: string[] }) => void) | null = null;

vi.mock("@ark-ui/solid", async () => {
  const actual = await vi.importActual("@ark-ui/solid");

  return {
    ...actual,
    Select: {
      Root: (props: any) => {
        sharedOnValueChange = props.onValueChange ?? null;
        return <>{props.children}</>;
      },
      Control: (props: any) => <>{props.children}</>,
      Trigger: (props: any) => (
        <button
          {...props}
          data-state={mockIsOpen ? "open" : "closed"}
          onClick={() => {
            mockIsOpen = !mockIsOpen;
          }}
          aria-expanded={mockIsOpen}
        >
          {props.children}
        </button>
      ),
      ValueText: (props: any) => (
        <span data-part="value-text" {...props}>
          {props.placeholder || props.children}
        </span>
      ),
      Indicator: (props: any) => <span data-part="indicator" {...props}>{props.children}</span>,
      Positioner: (props: any) => (
        <div
          data-part="positioner"
          {...props}
          style={{ display: mockIsOpen ? "block" : "none" }}
        >
          {props.children}
        </div>
      ),
      Content: (props: any) => (
        <div
          data-part="content"
          data-state={mockIsOpen ? "open" : "closed"}
          {...props}
        >
          {props.children}
        </div>
      ),
      List: (props: any) => <ul data-part="list" {...props}>{props.children}</ul>,
      Item: (props: any) => {
        const itemValue = props.item?.value ?? props.value;
        return (
          <li
            data-value={itemValue}
            data-disabled={props.item?.disabled || false}
            {...props}
            onClick={() => {
              if (!props.item?.disabled) {
                if (sharedOnValueChange) {
                  sharedOnValueChange({ value: [itemValue] });
                }
                mockIsOpen = false;
              }
            }}
          >
            {props.children}
          </li>
        );
      },
      ItemText: (props: any) => <span {...props}>{props.children}</span>,
      ItemIndicator: (props: any) => <span data-part="item-indicator" {...props}>{props.children}</span>,
    },
    createListCollection: vi.fn(({ items }: { items: CodemanSelectOption[] }) => ({
      items,
      filteredItems: items,
      getItemValue: (item: CodemanSelectOption) => item.value,
      getItemDisabled: (item: CodemanSelectOption) => item.disabled ?? false,
      stringifyItem: (item: CodemanSelectOption) => item.label,
    })),
    useSelectContext: vi.fn(() => () => ({
      setOpen: (open: boolean) => {
        mockIsOpen = open;
      }
    })),
  };
});

// Mock @ark-ui/solid/dialog to avoid focus-trap errors in jsdom
// Ark's Dialog uses @zag-js/focus-trap which throws during cleanup when DOM is already removed
// The mock preserves Portal and role='dialog' for proper cleanup detection
vi.mock("@ark-ui/solid/dialog", async () => {
  const actual = await vi.importActual("@ark-ui/solid/dialog");
  return {
    ...actual,
    DialogRoot: (props: any) => <>{props.children}</>,
    DialogTrigger: (props: any) => <button {...props}>{props.children}</button>,
    DialogBackdrop: (props: any) => <>{props.children}</>,
    DialogPositioner: (props: any) => <>{props.children}</>,
    DialogContent: (props: any) => (
      <div role="dialog" data-testid={props["data-testid"]} {...props}>
        {props.children}
      </div>
    ),
    DialogHeader: (props: any) => <>{props.children}</>,
    DialogTitle: (props: any) => <>{props.children}</>,
    DialogDescription: (props: any) => <>{props.children}</>,
    DialogFooter: (props: any) => <>{props.children}</>,
    DialogCloseTrigger: (props: any) => <button {...props}>{props.children}</button>,
  };
});

async function flushPromises(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise<void>((r) => setTimeout(r, 0));
  }
}

function cleanupDialogContainers(): void {
  const body = document.body;
  const toRemove: Element[] = [];
  body.querySelectorAll("div").forEach((el) => {
    if (
      el.parentElement === body &&
      (el.children.length === 0 || el.querySelector("[role='dialog']"))
    ) {
      toRemove.push(el);
    }
  });
  toRemove.forEach((el) => {
    try {
      el.remove();
    } catch {
    }
  });
}

describe("createProviderFormDialog", () => {
  beforeEach(() => {
    (enforceDefaultModelInvariant as ReturnType<typeof vi.fn>).mockReset();
    codemanToast.error = vi.fn();
    codemanToast.success = vi.fn();
    mockIsOpen = false;
    sharedOnValueChange = null;
  });

  afterEach(() => {
    cleanupDialogContainers();
  });

  describe("Phase 1: Tag cloud", () => {
    it("打开对话框即显示 tag 云（所有预设厂商）", async () => {
      void createProviderFormDialog();
      await flushPromises();

      expect(screen.getByTestId("add-provider-dialog")).toBeInTheDocument();
      expect(screen.getByTestId("provider-tag-cloud")).toBeInTheDocument();

      // All presets should be rendered as tags
      for (const preset of PROVIDER_PRESETS) {
        expect(screen.getByTestId(`provider-tag-${preset.id}`)).toBeInTheDocument();
      }

      // Custom and mock entries should be present
      expect(screen.getByTestId("provider-custom-entry")).toBeInTheDocument();
      expect(screen.getByTestId("provider-mock-entry")).toBeInTheDocument();
    });

    it("tag 云可滚动（存在 overflow-y-auto 类）", async () => {
      void createProviderFormDialog();
      await flushPromises();

      const cloud = screen.getByTestId("provider-tag-cloud");
      expect(cloud.className).toContain("overflow-y-auto");
    });
  });

  describe("Phase 2: Form", () => {
    it("点选厂商 tag → 进入表单，字段预填（label、baseUrl、defaultModel、models）", async () => {
      const user = userEvent.setup();
      const promise = createProviderFormDialog();
      await flushPromises();

      // Click a preset tag (deepseek)
      await user.click(screen.getByTestId("provider-tag-deepseek"));

      // Should now show form
      expect(screen.getByTestId("provider-form")).toBeInTheDocument();

      // Check pre-filled values
      const labelInput = screen.getByTestId("provider-field-label") as HTMLInputElement;
      const baseUrlInput = screen.getByTestId("provider-field-base-url") as HTMLInputElement;

      expect(labelInput.value).toBe("DeepSeek");
      expect(baseUrlInput.value).toBe("https://api.deepseek.com/anthropic");

      // Default model 是 CodemanSelect(trigger 存在,选项来自预设模型)
      expect(
        screen.getByTestId("provider-field-default-model-trigger"),
      ).toBeInTheDocument();
      expect(
        document.querySelector('li[data-value="deepseek-v4-pro"]'),
      ).toBeInTheDocument();
      expect(
        document.querySelector('li[data-value="deepseek-v4-flash"]'),
      ).toBeInTheDocument();

      // apiKey should be empty
      const apiKeyInput = screen.getByTestId("provider-field-api-key") as HTMLInputElement;
      expect(apiKeyInput.value).toBe("");

      // Cancel
      await user.click(screen.getByTestId("provider-cancel-button"));
      const result = await promise;
      expect(result).toBeNull();
    });

    it("点选厂商 tag → Default model 是 CodemanSelect 且列出预设模型", async () => {
      const user = userEvent.setup();
      const promise = createProviderFormDialog();
      await flushPromises();

      await user.click(screen.getByTestId("provider-tag-deepseek"));

      expect(
        screen.getByTestId("provider-field-default-model-trigger"),
      ).toBeInTheDocument();

      const optionIds = Array.from(
        document.querySelectorAll('li[data-value]'),
      ).map((li) => li.getAttribute("data-value"));
      expect(optionIds).toEqual(["deepseek-v4-flash", "deepseek-v4-pro"]);

      // 选择 flash 后提交,defaultModel 跟随变化
      fireEvent.click(document.querySelector('li[data-value="deepseek-v4-flash"]')!);
      await user.click(screen.getByTestId("provider-add-button"));

      const provider = await promise;
      expect(provider).not.toBeNull();
      expect(provider!.llm.defaultModel).toBe("deepseek-v4-flash");
    });

    it("点选厂商 tag → models 清单自动带出（不可编辑，仅展示）", async () => {
      const user = userEvent.setup();
      void createProviderFormDialog();
      await flushPromises();

      await user.click(screen.getByTestId("provider-tag-deepseek"));

      // models are displayed but not editable inputs
      // The form should NOT have a models input field
      expect(screen.queryByTestId("provider-field-models")).not.toBeInTheDocument();
    });

    it("自定义 provider 入口 → 进入表单，字段全空", async () => {
      const user = userEvent.setup();
      const promise = createProviderFormDialog();
      await flushPromises();

      await user.click(screen.getByTestId("provider-custom-entry"));

      // Should now show form
      expect(screen.getByTestId("provider-form")).toBeInTheDocument();

      // All fields should be empty
      const labelInput = screen.getByTestId("provider-field-label") as HTMLInputElement;
      const baseUrlInput = screen.getByTestId("provider-field-base-url") as HTMLInputElement;
      const defaultModelInput = screen.getByTestId("provider-field-default-model") as HTMLInputElement;
      const apiKeyInput = screen.getByTestId("provider-field-api-key") as HTMLInputElement;

      expect(labelInput.value).toBe("");
      expect(baseUrlInput.value).toBe("");
      expect(defaultModelInput.value).toBe("");
      expect(apiKeyInput.value).toBe("");

      await user.click(screen.getByTestId("provider-cancel-button"));
      const result = await promise;
      expect(result).toBeNull();
    });

    it("Mock (dev) 入口 → 进入表单，预填 mock 模板内容", async () => {
      const user = userEvent.setup();
      const promise = createProviderFormDialog();
      await flushPromises();

      await user.click(screen.getByTestId("provider-mock-entry"));

      // Should now show form with mock pre-fill
      expect(screen.getByTestId("provider-form")).toBeInTheDocument();

      const labelInput = screen.getByTestId("provider-field-label") as HTMLInputElement;
      const baseUrlInput = screen.getByTestId("provider-field-base-url") as HTMLInputElement;

      expect(labelInput.value).toBe("Mock");
      expect(baseUrlInput.value).toBe("http://127.0.0.1:50000/mock/anthropic");

      // Mock 模板带模型清单 → Default model 是 CodemanSelect
      expect(
        screen.getByTestId("provider-field-default-model-trigger"),
      ).toBeInTheDocument();
      expect(
        document.querySelector('li[data-value="mock-default"]'),
      ).toBeInTheDocument();

      // Cancel
      await user.click(screen.getByTestId("provider-cancel-button"));
      const result = await promise;
      expect(result).toBeNull();
    });
  });

  describe("Submit flow", () => {
    it("填完表单点击 Add → resolve 完整 Provider 对象（无 enabled 字段）", async () => {
      const user = userEvent.setup();

      const promise = createProviderFormDialog();
      await flushPromises();

      // Select a preset
      await user.click(screen.getByTestId("provider-tag-deepseek"));

      await user.clear(screen.getByTestId("provider-field-label"));
      await user.type(screen.getByTestId("provider-field-label"), "My DeepSeek");
      await user.type(screen.getByTestId("provider-field-api-key"), "sk-test-12345");

      await user.click(screen.getByTestId("provider-add-button"));

      const provider = await promise;

      expect(provider).not.toBeNull();
      expect(provider!.id).toMatch(/^provider-/);
      expect(provider!.label).toBe("My DeepSeek");
      expect(provider!.apiKey).toBe("sk-test-12345");
      expect(provider!.llm.defaultModel).toBe("deepseek-v4-flash");
      expect(provider!.llm.baseUrl).toBe("https://api.deepseek.com/anthropic");
      expect(provider!.llm.apiType).toBe("anthropic-messages");
      expect(Array.isArray(provider!.llm.models)).toBe(true);
      // enabled field should NOT exist
      expect("enabled" in provider!).toBe(false);
    });

    it("自定义 provider 填完提交 → resolve Provider（id 前缀 provider-）", async () => {
      const user = userEvent.setup();

      const promise = createProviderFormDialog();
      await flushPromises();

      await user.click(screen.getByTestId("provider-custom-entry"));

      await user.type(screen.getByTestId("provider-field-label"), "Custom Provider");
      await user.type(screen.getByTestId("provider-field-base-url"), "https://api.custom.com");
      await user.type(screen.getByTestId("provider-field-default-model"), "custom-model");
      await user.type(screen.getByTestId("provider-field-api-key"), "sk-custom");

      await user.click(screen.getByTestId("provider-add-button"));

      const provider = await promise;

      expect(provider).not.toBeNull();
      expect(provider!.id).toMatch(/^provider-/);
      expect(provider!.label).toBe("Custom Provider");
      expect(provider!.llm.baseUrl).toBe("https://api.custom.com");
      expect("enabled" in provider!).toBe(false);
    });

    it("Mock 入口提交 → id 前缀 mock-，resolve 完整 Provider（无 enabled）", async () => {
      const user = userEvent.setup();

      const promise = createProviderFormDialog();
      await flushPromises();

      await user.click(screen.getByTestId("provider-mock-entry"));

      await user.click(screen.getByTestId("provider-add-button"));

      const provider = await promise;

      expect(provider).not.toBeNull();
      expect(provider!.id).toMatch(/^mock-/);
      expect(provider!.label).toBe("Mock");
      expect(provider!.llm.baseUrl).toBe("http://127.0.0.1:50000/mock/anthropic");
      expect("enabled" in provider!).toBe(false);
    });

    it("打开弹窗点击 Cancel → resolve(null)", async () => {
      const user = userEvent.setup();

      const promise = createProviderFormDialog();
      await flushPromises();

      expect(screen.getByTestId("add-provider-dialog")).toBeInTheDocument();

      await user.click(screen.getByTestId("provider-cancel-button"));

      const result = await promise;
      expect(result).toBeNull();
    });

    it("onSubmit 时 enforceDefaultModelInvariant 被调用", async () => {
      const user = userEvent.setup();

      const promise = createProviderFormDialog();
      await flushPromises();

      await user.click(screen.getByTestId("provider-tag-deepseek"));
      await user.type(screen.getByTestId("provider-field-api-key"), "sk-key");

      await user.click(screen.getByTestId("provider-add-button"));

      const provider = await promise;
      expect(enforceDefaultModelInvariant).toHaveBeenCalledWith(provider!.llm);
    });

    it("defaultModel 被纠正时 toast.error 被调用且 provider 使用纠正后的值", async () => {
      const user = userEvent.setup();

      vi.mocked(enforceDefaultModelInvariant).mockImplementationOnce(() => ({
        defaultModel: "fallback-model",
        baseUrl: "https://api.deepseek.com/anthropic",
        apiType: "anthropic-messages" as const,
        models: [{ id: "fallback-model", label: "fallback-model", thinking: false }],
        modelsEndpoint: "",
      }));

      const promise = createProviderFormDialog();
      await flushPromises();

      await user.click(screen.getByTestId("provider-tag-deepseek"));
      fireEvent.click(document.querySelector('li[data-value="deepseek-v4-flash"]')!);
      await user.type(screen.getByTestId("provider-field-api-key"), "sk-key");

      await user.click(screen.getByTestId("provider-add-button"));

      const provider = await promise;
      expect(codemanToast.error).toHaveBeenCalledWith("Default model fell back to fallback-model");
      expect(provider!.llm.defaultModel).toBe("fallback-model");
    });
  });
});
