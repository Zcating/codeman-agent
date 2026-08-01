import { describe, it, expect } from "vitest";
import { toConversation, toMessage } from "./mappers.js";

describe("toConversation", () => {
  it("maps snake_case fields to camelCase", () => {
    const row = {
      id: "c1",
      title: "t",
      system_prompt: null,
      created_at: 100,
      updated_at: 200,
      archived_at: null,
      workspace_id: "",
    };
    expect(toConversation(row)).toEqual({
      id: "c1",
      title: "t",
      systemPrompt: null,
      createdAt: 100,
      updatedAt: 200,
      archivedAt: null,
      workspaceId: "",
    });
  });
  it("maps system_prompt: 'x' to systemPrompt: 'x'", () => {
    expect(toConversation({
      id: "c1",
      title: "t",
      system_prompt: "x",
      created_at: 100,
      updated_at: 200,
      archived_at: null,
      workspace_id: "w1",
    }).systemPrompt).toBe("x");
  });
  it("maps workspace_id: undefined to workspaceId: ''", () => {
    const row = {
      id: "c1",
      title: "t",
      system_prompt: null,
      created_at: 100,
      updated_at: 200,
      archived_at: null,
      workspace_id: undefined,
    };
    expect(toConversation(row).workspaceId).toBe("");
  });
  it("maps archived_at: 300 to archivedAt: 300", () => {
    expect(toConversation({
      id: "c1",
      title: "t",
      system_prompt: null,
      created_at: 100,
      updated_at: 200,
      archived_at: 300,
      workspace_id: "w1",
    }).archivedAt).toBe(300);
  });
});

describe("toMessage", () => {
  const base = {
    id: "m1",
    conversation_id: "c1",
    role: "user",
    content: "hi",
    thinking: null,
    tool_calls: null,
    tool_results: null,
    model: null,
    input_tokens: null,
    output_tokens: null,
    created_at: 100,
  };
  it("parses tool_calls: '{\"a\":1}' into toolCalls: { a: 1 }", () => {
    expect(toMessage({ ...base, tool_calls: '{"a":1}' }).toolCalls).toEqual({ a: 1 });
  });
  it("maps tool_calls: null to toolCalls: null", () => {
    expect(toMessage({ ...base, tool_calls: null }).toolCalls).toBeNull();
  });
  it("parses tool_results: '{\"r\":1}' into toolResults", () => {
    expect(toMessage({ ...base, tool_results: '{"r":1}' }).toolResults).toEqual({ r: 1 });
  });
  it("maps thinking: 'x' to thinking: 'x'", () => {
    expect(toMessage({ ...base, thinking: "x" }).thinking).toBe("x");
  });
  it("maps thinking: null to thinking: null", () => {
    expect(toMessage({ ...base, thinking: null }).thinking).toBeNull();
  });
});
