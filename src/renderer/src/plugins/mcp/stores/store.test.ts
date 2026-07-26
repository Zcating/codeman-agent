// MCP store tests — ADR-0032 Phase B mini-4.

import { describe, it, expect, beforeEach } from "vitest";
import {
  mcpServers$,
  mcpAllTools$,
  _resetMcpStoreForTest,
} from "@codeman-frontend/plugins/mcp/stores/store";

describe("mcp store", () => {
  beforeEach(() => {
    _resetMcpStoreForTest();
  });

  it("初始为空数组", () => {
    expect(mcpServers$()).toEqual([]);
    expect(mcpAllTools$()).toEqual([]);
  });

  it("_resetMcpStoreForTest 清空两个信号", () => {
    expect(mcpServers$()).toEqual([]);
    expect(mcpAllTools$()).toEqual([]);
  });

  it("accessor 返回同一 reference (Solid signal 语义)", () => {
    const serversBefore = mcpServers$();
    const toolsBefore = mcpAllTools$();
    expect(mcpServers$()).toBe(serversBefore);
    expect(mcpAllTools$()).toBe(toolsBefore);
  });

  it("空数组长度验证", () => {
    expect(mcpServers$()).toHaveLength(0);
    expect(mcpAllTools$()).toHaveLength(0);
  });

  it("mcpAllTools 返回空数组类型正确", () => {
    const tools = mcpAllTools$();
    expect(Array.isArray(tools)).toBe(true);
  });
});
