
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
  enabled: true,
  apiKey: "test-key",
  llm: {
    defaultModel: "MiniMax-M2.5-highspeed",
    baseUrl: "https://api.minimaxi.com/anthropic",
    apiType: "anthropic-messages" as const,
    models: [
      {
        id: "MiniMax-M2.5-highspeed",
        label: "MiniMax-M2.5-highspeed",
        deprecated: false,
        thinking: false,
      },
      {
        id: "MiniMax-M2.1-highspeed",
        label: "MiniMax-M2.1-highspeed",
        deprecated: true,
        thinking: false,
      },
    ],
    modelsEndpoint: "https://api.minimaxi.com/anthropic/v1/models",
  },
};

const _mockProviderDisabled = {
  id: "deepseek",
  label: "DeepSeek",
  enabled: false,
  apiKey: "test-key",
  llm: {
    defaultModel: "deepseek-chat",
    baseUrl: "https://api.deepseek.com/anthropic",
    apiType: "anthropic-messages" as const,
    models: [{ id: "deepseek-chat", label: "deepseek-chat", deprecated: false, thinking: false }],
    modelsEndpoint: "https://api.deepseek.com/models",
  },
};
void _mockProviderDisabled;

import { ProviderCard } from "@codeman-frontend/features/settings/components/provider-card";

import * as appStoreMock from "@codeman-frontend/shared/stores/app.store";
import { _resetSettingsSaverForTest } from "@codeman-frontend/features/settings/lib/settings-saver";


const renderCard = (provider = mockProvider) =>
  render(() => <ProviderCard provider={provider} onUpdate={vi.fn()} onDelete={vi.fn()} />);

const getLastSetCall = () => (appStoreMock as any).__getLastSetCall();
const setProviders = (p: any[]) => (appStoreMock as any).__setProviders(p);


describe("ProviderCard", () => {
  beforeEach(() => {
    mockState.calls = [];
    mockState.resolved = undefined;
    mockState.rejected = undefined;
    setProviders([{ ...mockProvider }]);
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    _resetSettingsSaverForTest();
  });

  it("renders 1 card with provider label and id", () => {
    renderCard();
    expect(screen.getByText("MiniMax")).toBeInTheDocument();
    expect(screen.getByText("minimax")).toBeInTheDocument(); 
  });

  it("toggling enabled checkbox calls appStore.set and updates state", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(() => <ProviderCard provider={mockProvider} onUpdate={onUpdate} onDelete={vi.fn()} />);

    const checkbox = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox).toBeTruthy();
    expect(checkbox.checked).toBe(true);

    await user.click(checkbox);

    const lastSet = getLastSetCall();
    expect(lastSet).toBeTruthy();
    const updatedProviders = lastSet.providers;
    expect(updatedProviders.find((p: any) => p.id === "minimax")?.enabled).toBe(false);
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "minimax", enabled: false }),
    );
  });

  it("Refresh models calls appStore.refreshProviderModels and shows success", async () => {
    const user = userEvent.setup();
    const mockModels = [
      {
        id: "model-A",
        label: "Model A",
        contextWindow: 100_000,
        deprecated: false,
        thinking: false,
      },
      { id: "model-B", label: "Model B", deprecated: false, thinking: false },
    ];
    (appStoreMock as any).appStore.refreshProviderModels.mockReturnValue(
      Effect.succeed(mockModels),
    );
    renderCard();
    const refreshBtn = screen.getByRole("button", { name: /refresh models/i });
    await user.click(refreshBtn);
    await waitFor(() => {
      expect(screen.getByText(/Loaded 2 model/i)).toBeInTheDocument();
    });
    expect((appStoreMock as any).appStore.refreshProviderModels).toHaveBeenCalledWith("minimax");
  });

  it("Refresh models failure shows error message", async () => {
    const user = userEvent.setup();
    (appStoreMock as any).appStore.refreshProviderModels.mockReturnValue(
      Effect.fail({ kind: "IPC" as const, message: "fetchModels failed: HTTP 401" }),
    );
    renderCard();
    const refreshBtn = screen.getByRole("button", { name: /refresh models/i });
    await user.click(refreshBtn);
    await waitFor(() => {
      expect(screen.getByText(/Refresh failed.*IPC.*fetchModels failed/i)).toBeInTheDocument();
    });
  });

  it("model dropdown calls appStore.set with new model", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(() => <ProviderCard provider={mockProvider} onUpdate={onUpdate} onDelete={vi.fn()} />);

    const select = document.querySelector("select") as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.value).toBe("MiniMax-M2.5-highspeed");

    await user.selectOptions(select, "MiniMax-M2.1-highspeed");

    const lastSet = getLastSetCall();
    expect(lastSet).toBeTruthy();
    const updatedProviders = lastSet.providers;
    expect(updatedProviders.find((p: any) => p.id === "minimax")?.llm.defaultModel).toBe(
      "MiniMax-M2.1-highspeed",
    );
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "minimax",
        llm: expect.objectContaining({ defaultModel: "MiniMax-M2.1-highspeed" }),
      }),
    );
  });

  it("renders LLM section with model + base_url + api key", () => {
    renderCard();

    expect(screen.getByText("LLM")).toBeInTheDocument();
    const selects = document.querySelectorAll("select");
    expect(selects.length).toBe(1);
  });

  it("delete button calls appStore.deleteProvider and onDelete", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    (appStoreMock as any).appStore.deleteProvider.mockReturnValue(Effect.void);
    render(() => <ProviderCard provider={mockProvider} onUpdate={vi.fn()} onDelete={onDelete} />);
    const deleteBtn = screen.getByRole("button", { name: /delete provider/i });
    await user.click(deleteBtn);
    await waitFor(() => {
      expect((appStoreMock as any).appStore.deleteProvider).toHaveBeenCalledWith("minimax");
    });
    expect(onDelete).toHaveBeenCalledWith("minimax");
  });

  it("API Key input onBlur commits to appStore with updated api_key (2026-07 form pattern)", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(() => <ProviderCard provider={mockProvider} onUpdate={onUpdate} onDelete={vi.fn()} />);

    const apiKeyInputs = document.querySelectorAll('input[type="password"]');
    expect(apiKeyInputs.length).toBe(1);

    const llmApiKeyInput = apiKeyInputs[0] as HTMLInputElement;
    await user.clear(llmApiKeyInput);
    await user.type(llmApiKeyInput, "new-secret-key");
    await user.tab(); 

    const lastSet = getLastSetCall();
    expect(lastSet).toBeTruthy();
    const updatedProviders = lastSet.providers;
    expect(updatedProviders.find((p: any) => p.id === "minimax")?.apiKey).toBe("new-secret-key");
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "minimax", apiKey: "new-secret-key" }),
    );
  });

  it("no Save button appears in LLM subform section", () => {
    renderCard();

    const saveButtons = screen.queryAllByRole("button", { name: /save/i });
    expect(saveButtons.length).toBe(0);
  });

  it("Base URL input commits on blur and updates state (regression 2026-07: typing no longer writes store)", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(() => <ProviderCard provider={mockProvider} onUpdate={onUpdate} onDelete={vi.fn()} />);

    const textInputs = document.querySelectorAll('input[type="text"]');
    const baseUrlInput = textInputs[0] as HTMLInputElement;
    expect(baseUrlInput).toBeTruthy();
    expect(baseUrlInput.value).toBe("https://api.minimaxi.com/anthropic");

    await user.clear(baseUrlInput);
    await user.type(baseUrlInput, "https://api.example.com/v1");
    await user.tab(); 

    const lastSet = getLastSetCall();
    expect(lastSet).toBeTruthy();
    const updatedProviders = lastSet.providers;
    expect(updatedProviders.find((p: any) => p.id === "minimax")?.llm.baseUrl).toBe(
      "https://api.example.com/v1",
    );
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "minimax",
        llm: expect.objectContaining({ baseUrl: "https://api.example.com/v1" }),
      }),
    );
  });

  it("typing in Base URL input preserves focus (regression: <For> remount on each keystroke)", async () => {
    const user = userEvent.setup();
    render(() => <ProviderCard provider={mockProvider} onUpdate={vi.fn()} onDelete={vi.fn()} />);

    const textInputs = document.querySelectorAll('input[type="text"]');
    const baseUrlInput = textInputs[0] as HTMLInputElement;
    expect(baseUrlInput).toBeTruthy();

    baseUrlInput.focus();
    await user.clear(baseUrlInput);
    expect(document.activeElement).toBe(baseUrlInput);

    await user.type(baseUrlInput, "abcdef");

    expect(document.activeElement).toBe(baseUrlInput);
    expect(baseUrlInput.value).toBe("abcdef");
  });

  it("Base URL input shows validation error on blur when invalid (no http:// prefix)", async () => {
    const user = userEvent.setup();
    render(() => <ProviderCard provider={mockProvider} onUpdate={vi.fn()} onDelete={vi.fn()} />);

    const textInputs = document.querySelectorAll('input[type="text"]');
    const baseUrlInput = textInputs[0] as HTMLInputElement;

    await user.clear(baseUrlInput);
    await user.type(baseUrlInput, "not-a-url");
    await user.tab(); 

    await waitFor(() => {
      expect(
        screen.getByText(/Base URL must start with http/i),
      ).toBeInTheDocument();
    });
  });

  it("delete confirm=false 时不调 deleteProvider", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    (appStoreMock as any).appStore.deleteProvider.mockReturnValue(Effect.void);
    const onDelete = vi.fn();

    render(() => <ProviderCard provider={mockProvider} onUpdate={vi.fn()} onDelete={onDelete} />);

    const deleteBtn = screen.getByRole("button", { name: /delete provider/i });
    await user.click(deleteBtn);

    expect(confirmSpy).toHaveBeenCalled();
    expect((appStoreMock as any).appStore.deleteProvider).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it("delete 失败时显示 Delete failed 错误信息", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    (appStoreMock as any).appStore.deleteProvider.mockReturnValue(
      Effect.fail({ kind: "IPC" as const, message: "delete failed: provider not found" }),
    );

    render(() => <ProviderCard provider={mockProvider} onUpdate={vi.fn()} onDelete={vi.fn()} />);

    const deleteBtn = screen.getByRole("button", { name: /delete provider/i });
    await user.click(deleteBtn);

    await waitFor(() => {
      expect(screen.getByText(/Delete failed.*IPC.*delete failed: provider not found/i)).toBeInTheDocument();
    });
  });

  it("llm.base_url 指向本地 mock server (http://127.0.0.1:...) → 显示 (dev) 徽标", () => {
    const devProvider = {
      id: "mock-test",
      label: "Mock Test",
      enabled: true,
      apiKey: "",
      llm: {
        defaultModel: "mock-default",
        baseUrl: "http://127.0.0.1:50000/mock/anthropic",
        apiType: "anthropic-messages" as const,
        models: [{ id: "mock-default", label: "Mock", deprecated: false, thinking: false }],
        modelsEndpoint: "",
      },
    };
    render(() => <ProviderCard provider={devProvider} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText("(dev)")).toBeInTheDocument();
  });
});
