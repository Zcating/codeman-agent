
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { Effect } from "effect";
import { mockState } from "@codeman-frontend/__mocks__/ipc-mock";

vi.mock("../../../shared/stores/app.store", () => {
  let providers: any[] = [];
  let lastSetCall: any = null;

  return {
    appStore: {
      state: {
        get value() {
          return { providers };
        },
      },
      set: vi.fn((patch: any) => {
        lastSetCall = patch;
        if (patch.providers !== undefined) {
          providers = patch.providers;
        }
      }),
      forceFlush: vi.fn(),
      refresh: vi.fn(),
      refreshProviderModels: vi.fn(),
      deleteProvider: vi.fn(),
      pickWorkspacePath: vi.fn(),
      clearAllHistory: vi.fn(),
    },
    _resetAppStoreForTest: vi.fn(),
    __setProviders: (p: any[]) => {
      providers = p;
    },
    __getLastSetCall: () => lastSetCall,
  };
});

const mockProvider = {
  id: "minimax",
  label: "MiniMax",
  comment: "Production API",
  apiKey: "test-key",
  llm: {
    defaultModel: "MiniMax-M2.5-highspeed",
    baseUrl: "https://api.minimaxi.com/anthropic",
    apiType: "anthropic-messages" as const,
    models: [
      {
        id: "MiniMax-M2.5-highspeed",
        label: "MiniMax-M2.5-highspeed",
        contextWindow: 100000,
        deprecated: false,
        thinking: false,
      },
      {
        id: "MiniMax-M2.1-highspeed",
        label: "MiniMax-M2.1-highspeed",
        contextWindow: 80000,
        deprecated: true,
        thinking: false,
      },
    ],
    modelsEndpoint: "https://api.minimaxi.com/anthropic/v1/models",
  },
};

const mockProviderNoComment = {
  id: "deepseek",
  label: "DeepSeek",
  comment: "",
  apiKey: "test-key",
  llm: {
    defaultModel: "deepseek-chat",
    baseUrl: "https://api.deepseek.com/anthropic",
    apiType: "anthropic-messages" as const,
    models: [{ id: "deepseek-chat", label: "deepseek-chat", contextWindow: 64000, deprecated: false, thinking: false }],
    modelsEndpoint: "https://api.deepseek.com/models",
  },
};

import { ProviderCard } from "@codeman-frontend/features/settings/components/provider-card";

import * as appStoreMock from "@codeman-frontend/shared/stores/app.store";
import { _resetSettingsSaverForTest } from "@codeman-frontend/features/settings/lib/settings-saver";

const renderCard = (provider = mockProvider, isExpanded = false, isDefault = false) =>
  render(() => (
    <ProviderCard
      provider={provider}
      isExpanded={isExpanded}
      isDefault={isDefault}
      onToggleExpand={vi.fn()}
      onSetDefault={vi.fn()}
      onSave={vi.fn()}
      onCancel={vi.fn()}
      onDelete={vi.fn()}
    />
  ));

describe("ProviderCard — collapsed row", () => {
  beforeEach(() => {
    mockState.calls = [];
    mockState.resolved = undefined;
    mockState.rejected = undefined;
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    _resetSettingsSaverForTest();
  });

  it("renders label · comment when comment exists", () => {
    renderCard();
    expect(screen.getByText("MiniMax · Production API")).toBeInTheDocument();
  });

  it("renders just label when no comment", () => {
    renderCard(mockProviderNoComment);
    expect(screen.getByText("DeepSeek")).toBeInTheDocument();
    expect(screen.queryByText("DeepSeek ·")).toBeNull();
  });

  it("renders model count badge", () => {
    renderCard();
    expect(screen.getByText("2 models")).toBeInTheDocument();
  });

  it("renders default star (highlighted when isDefault=true)", () => {
    renderCard(mockProvider, false, true);
    const starBtn = screen.getByRole("button", { name: /default provider/i });
    expect(starBtn).toBeInTheDocument();
    expect(starBtn).toHaveAttribute("aria-label", "Set as default provider");
  });

  it("renders delete button on hover", async () => {
    const user = userEvent.setup();
    renderCard();
    const card = screen.getByTestId("provider-row");
    await user.hover(card);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /delete provider/i })).toBeVisible();
    });
  });

  it("clicking row calls onToggleExpand", async () => {
    const user = userEvent.setup();
    const onToggleExpand = vi.fn();
    render(() => (
      <ProviderCard
        provider={mockProvider}
        isExpanded={false}
        isDefault={false}
        onToggleExpand={onToggleExpand}
        onSetDefault={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
      />
    ));
    await user.click(screen.getByTestId("provider-row"));
    expect(onToggleExpand).toHaveBeenCalledTimes(1);
  });

  it("clicking star calls onSetDefault", async () => {
    const user = userEvent.setup();
    const onSetDefault = vi.fn();
    render(() => (
      <ProviderCard
        provider={mockProvider}
        isExpanded={false}
        isDefault={false}
        onToggleExpand={vi.fn()}
        onSetDefault={onSetDefault}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
      />
    ));
    await user.click(screen.getByRole("button", { name: /default provider/i }));
    expect(onSetDefault).toHaveBeenCalledTimes(1);
  });

  it("NO enabled checkbox in collapsed row", () => {
    renderCard();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("NO real/mock badge in collapsed row", () => {
    renderCard();
    expect(screen.queryByText(/real/i)).toBeNull();
    expect(screen.queryByText(/mock/i)).toBeNull();
  });
});

describe("ProviderCard — expanded area", () => {
  beforeEach(() => {
    mockState.calls = [];
    mockState.resolved = undefined;
    mockState.rejected = undefined;
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    _resetSettingsSaverForTest();
  });

  it("renders expanded area when isExpanded=true", () => {
    renderCard(mockProvider, true);
    expect(screen.getByText("基础配置")).toBeInTheDocument();
    expect(screen.getByText("模型")).toBeInTheDocument();
    expect(screen.getByText("危险区")).toBeInTheDocument();
  });

  it("does NOT render expanded area when isExpanded=false", () => {
    renderCard(mockProvider, false);
    expect(screen.queryByText("基础配置")).toBeNull();
    expect(screen.queryByText("模型")).toBeNull();
  });

  it("renders comment / baseUrl / apiKey inputs in basic config section", () => {
    renderCard(mockProvider, true);
    // CodemanInput renders label but not linked via 'for', use placeholder/queryByDisplayValue
    expect(screen.getByPlaceholderText("可选备注")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("https://api.example.com/v1")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("sk-…")).toBeInTheDocument();
  });

  it("renders test connection button", () => {
    renderCard(mockProvider, true);
    expect(screen.getByRole("button", { name: /测试连接/i })).toBeInTheDocument();
  });

  it("renders defaultModel dropdown with options", () => {
    renderCard(mockProvider, true);
    const select = document.querySelector("select") as HTMLSelectElement;
    expect(select).toBeTruthy();
    const options = Array.from(select.querySelectorAll("option")).map((o) => o.value);
    expect(options).toContain("MiniMax-M2.5-highspeed");
    expect(options).toContain("MiniMax-M2.1-highspeed");
  });

  it("renders model table with id/label/contextWindow/deprecated/thinking columns", () => {
    renderCard(mockProvider, true);
    expect(screen.getByText("ID")).toBeInTheDocument();
    expect(screen.getByText("Label")).toBeInTheDocument();
    expect(screen.getByText("Context Window")).toBeInTheDocument();
    expect(screen.getByText("Deprecated")).toBeInTheDocument();
    expect(screen.getByText("Thinking")).toBeInTheDocument();
    // Model IDs appear in both the defaultModel dropdown AND the model table inputs
    // Check that there are multiple inputs with model IDs
    const modelInputs = document.querySelectorAll("input[type='text']");
    expect(modelInputs.length).toBeGreaterThanOrEqual(2);
  });

  it("renders add model row button", () => {
    renderCard(mockProvider, true);
    expect(screen.getByRole("button", { name: /添加模型/i })).toBeInTheDocument();
  });

  it("renders danger zone delete button (destructive style)", () => {
    renderCard(mockProvider, true);
    const deleteBtn = screen.getByRole("button", { name: /删除 provider/i });
    expect(deleteBtn).toBeInTheDocument();
  });

  it("renders Save / Cancel buttons at bottom", () => {
    renderCard(mockProvider, true);
    expect(screen.getByRole("button", { name: /保存/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /取消/i })).toBeInTheDocument();
  });

  it("cancel button calls onCancel", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(() => (
      <ProviderCard
        provider={mockProvider}
        isExpanded={true}
        isDefault={false}
        onToggleExpand={vi.fn()}
        onSetDefault={vi.fn()}
        onSave={vi.fn()}
        onCancel={onCancel}
        onDelete={vi.fn()}
      />
    ));
    await user.click(screen.getByRole("button", { name: /取消/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("save button calls onSave with updated provider", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(() => (
      <ProviderCard
        provider={mockProvider}
        isExpanded={true}
        isDefault={false}
        onToggleExpand={vi.fn()}
        onSetDefault={vi.fn()}
        onSave={onSave}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
      />
    ));
    await user.click(screen.getByRole("button", { name: /保存/i }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const savedProvider = onSave.mock.calls[0][0];
    expect(savedProvider.id).toBe("minimax");
    expect(savedProvider.label).toBe("MiniMax");
  });

  it("hover delete button in danger zone calls onDelete", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    (appStoreMock as any).appStore.deleteProvider.mockReturnValue(Effect.void);
    render(() => (
      <ProviderCard
        provider={mockProvider}
        isExpanded={true}
        isDefault={false}
        onToggleExpand={vi.fn()}
        onSetDefault={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={onDelete}
      />
    ));
    await user.click(screen.getByRole("button", { name: /删除 provider/i }));
    expect(onDelete).toHaveBeenCalledWith("minimax");
  });
});

describe("ProviderCard — model table editor", () => {
  beforeEach(() => {
    mockState.calls = [];
    mockState.resolved = undefined;
    mockState.rejected = undefined;
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    _resetSettingsSaverForTest();
  });

  it("can add a new model row", async () => {
    const user = userEvent.setup();
    renderCard(mockProvider, true);
    const initialRows = screen.getAllByTestId(/model-row/i);
    await user.click(screen.getByRole("button", { name: /添加模型/i }));
    const newRows = screen.getAllByTestId(/model-row/i);
    expect(newRows.length).toBe(initialRows.length + 1);
  });

  it("can delete a model row", async () => {
    const user = userEvent.setup();
    renderCard(mockProvider, true);
    const initialRows = screen.getAllByTestId(/model-row/i);
    const deleteButtons = screen.getAllByRole("button", { name: /删除行/i });
    await user.click(deleteButtons[0]);
    const newRows = screen.getAllByTestId(/model-row/i);
    expect(newRows.length).toBe(initialRows.length - 1);
  });
});

describe("ProviderCard — test connection", () => {
  beforeEach(() => {
    mockState.calls = [];
    mockState.resolved = undefined;
    mockState.rejected = undefined;
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    _resetSettingsSaverForTest();
  });

  it("test connection button is visible and clickable", async () => {
    const user = userEvent.setup();
    renderCard(mockProvider, true);
    const btn = screen.getByRole("button", { name: /测试连接/i });
    expect(btn).toBeInTheDocument();
    await user.click(btn);
  });
});

describe("ProviderCard — baseUrl dev badge", () => {
  it("shows (dev) badge when baseUrl starts with http://127.0.0.1:", () => {
    const devProvider = {
      id: "mock-test",
      label: "Mock Test",
      apiKey: "",
      llm: {
        defaultModel: "mock-default",
        baseUrl: "http://127.0.0.1:50000/mock/anthropic",
        apiType: "anthropic-messages" as const,
        models: [{ id: "mock-default", label: "Mock", contextWindow: 1000, deprecated: false, thinking: false }],
        modelsEndpoint: "",
      },
    };
    render(() => (
      <ProviderCard
        provider={devProvider}
        isExpanded={false}
        isDefault={false}
        onToggleExpand={vi.fn()}
        onSetDefault={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
      />
    ));
    expect(screen.getByText("(dev)")).toBeInTheDocument();
  });
});
