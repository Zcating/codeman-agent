import { describe, it, expect } from "vitest";
import { deriveLabelFromPath } from "@codeman-frontend/shared/lib/derive-label-from-path";

describe("deriveLabelFromPath", () => {
  it("取 Windows 路径最后段", () => {
    expect(deriveLabelFromPath("C:\\foo\\bar")).toBe("bar");
  });

  it("取 Unix 路径最后段", () => {
    expect(deriveLabelFromPath("/home/me/foo")).toBe("foo");
  });

  it("仅根路径时返回 Untitled workspace", () => {
    expect(deriveLabelFromPath("C:\\")).toBe("Untitled workspace");
  });

  it("Unix 根路径时返回 Untitled workspace", () => {
    expect(deriveLabelFromPath("/")).toBe("Untitled workspace");
  });

  it("无分隔符时返回原字符串", () => {
    expect(deriveLabelFromPath("foo")).toBe("foo");
  });

  it("处理尾部路径分隔符", () => {
    expect(deriveLabelFromPath("C:\\foo\\bar\\")).toBe("bar");
  });
});
