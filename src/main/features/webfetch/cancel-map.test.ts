import { describe, it, expect } from "vitest";
import { CancelMap } from "./cancel-map.js";

describe("CancelMap", () => {
  it("is empty when newly constructed", () => {
    const map = new CancelMap();
    expect(map.size()).toBe(0);
  });

  it("registers an entry", () => {
    const map = new CancelMap();
    map.register("req-1", new AbortController());
    expect(map.size()).toBe(1);
  });

  it("aborts the controller and removes the entry", () => {
    const map = new CancelMap();
    const ctrl = new AbortController();
    let aborted = false;
    ctrl.signal.addEventListener("abort", () => {
      aborted = true;
    });
    map.register("req-1", ctrl);
    map.abort("req-1");
    expect(aborted).toBe(true);
    expect(map.size()).toBe(0);
  });

  it("returns false for an unknown id", () => {
    const map = new CancelMap();
    expect(map.abort("nonexistent")).toBe(false);
  });

  it("returns true for an existing id", () => {
    const map = new CancelMap();
    map.register("req-1", new AbortController());
    expect(map.abort("req-1")).toBe(true);
  });
});
