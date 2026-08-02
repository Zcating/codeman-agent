import { describe, it, expect } from "vitest";
import { mcpAgentName, slug } from "./mcp-types";


describe("slug", () => {
  it("lowercases and replaces non-alphanumerics with underscores", () => {
    expect(slug("Hello-World")).toBe("hello_world");
    expect(slug("foo bar")).toBe("foo_bar");
    expect(slug("foo/bar baz")).toBe("foo_bar_baz");
  });

  it("strips leading/trailing underscores", () => {
    expect(slug("__hello__")).toBe("hello");
    expect(slug("!!!hi!!!")).toBe("hi");
  });

  it("returns 'unnamed' for empty / all-symbol input", () => {
    expect(slug("")).toBe("unnamed");
    expect(slug("---")).toBe("unnamed");
    expect(slug("   ")).toBe("unnamed");
  });
});

describe("mcpAgentName", () => {
  it("composes mcp_<server>_<tool> with slug normalization", () => {
    expect(mcpAgentName("github", "create_issue")).toBe("mcp_github_create_issue");
    expect(mcpAgentName("GitHub", "Create-Issue")).toBe("mcp_github_create_issue");
    expect(mcpAgentName("my server", "read file")).toBe("mcp_my_server_read_file");
  });

  it("is collision-free when server/tool names differ only by case/symbols", () => {
    const a = mcpAgentName("foo bar", "baz qux");
    const b = mcpAgentName("foo-bar", "baz-qux");
    expect(a).toBe(b);
  });
});