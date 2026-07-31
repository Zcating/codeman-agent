import { describe, it, expect } from "vitest";
import { toWorkspace } from "./mappers.js";

describe("toWorkspace", () => {
  it("maps root_path to rootPath", () => {
    expect(toWorkspace({
      id: "w1",
      label: "work",
      root_path: "C:/dev",
      created_at: 100,
    }).rootPath).toBe("C:/dev");
  });
  it("preserves all other fields unchanged", () => {
    expect(toWorkspace({
      id: "w1",
      label: "work",
      root_path: "C:/dev",
      created_at: 100,
    })).toEqual({
      id: "w1",
      label: "work",
      rootPath: "C:/dev",
      createdAt: 100,
    });
  });
});
