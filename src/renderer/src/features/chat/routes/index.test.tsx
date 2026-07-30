







import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@solidjs/testing-library";



const F = vi.hoisted(() => {
  return {
    mockUseParams: vi.fn((_opts?: any) => () => ({})),
    mockUseNavigate: vi.fn((_opts?: any) => {}),
    mockLoadWorkspaces: vi.fn(async () => undefined),
    mockLoadConversations: vi.fn(async () => undefined),
    mockChatSidebar: vi.fn(() => null as any),
  };
});



vi.mock("@tanstack/solid-router", () => ({
  Outlet: () => <div data-testid="outlet">Outlet</div>,
  Link: (props: any) => {
    const { _inactiveProps, _activeProps, ...rest } = props;
    return <a {...rest} {...(props.to ? { href: props.to } : {})}>{props.children}</a>;
  },
  useParams: () => F.mockUseParams({ from: "/conversation/$convId" }),
  useNavigate: () => F.mockUseNavigate,
}));



vi.mock("../stores/chat.store", () => ({
  loadWorkspaces: F.mockLoadWorkspaces,
  loadConversations: F.mockLoadConversations,
}));



vi.mock("../components/chat-sidebar", () => ({
  ChatSidebar: () => F.mockChatSidebar() as any,
}));



vi.mock("../components/home", () => ({
  HomeAgentForm: () => (
    <div data-testid="home-agent-form">HomeAgentForm</div>
  ),
}));



vi.mock("../components/chat-view", () => ({
  ChatView: (props: any) => (
    <div data-testid="chat-view">
      <span data-testid="chat-view-conv-id">{props.convId ?? "none"}</span>
    </div>
  ),
}));



import { HomeRoute } from "@codeman-frontend/features/chat/routes/home-route";
import { ConversationRoute } from "@codeman-frontend/features/chat/routes/conversation-route";
import { ChatLayout } from "@codeman-frontend/features/chat/routes/chat-layout";



describe("HomeRoute", () => {
  afterEach(() => {
    cleanup();
  });

  it("Renders HomeAgentForm", () => {
    const { getByTestId } = render(() => <HomeRoute />);
    expect(getByTestId("home-agent-form")).toBeTruthy();
  });
});



describe("ConversationRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("Does NOT render the back-to-home button (Q1: removed)", () => {
    F.mockUseParams.mockReturnValue(() => ({ convId: "test-conv-id" }));

    const { queryByTestId, getByTestId } = render(() => <ConversationRoute />);

    expect(queryByTestId("back-to-home")).toBeNull();
    expect(getByTestId("chat-view")).toBeTruthy();
    expect(getByTestId("chat-view-conv-id").textContent).toBe("test-conv-id");
  });
});



describe("ChatLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    F.mockChatSidebar.mockImplementation(() => (
      <div data-testid="chat-sidebar">ChatSidebar</div>
    ));
  });

  afterEach(() => {
    cleanup();
  });

  it("Calls loadWorkspaces + loadConversations on mount", async () => {
    render(() => <ChatLayout />);
    await vi.waitFor(() => {
      expect(F.mockLoadWorkspaces).toHaveBeenCalled();
      expect(F.mockLoadConversations).toHaveBeenCalled();
    });
  });

  it("Renders ChatSidebar", () => {
    const { getByTestId } = render(() => <ChatLayout />);
    expect(getByTestId("chat-sidebar")).toBeTruthy();
  });
});