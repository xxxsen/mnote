import { describe, expect, it } from "vitest";

import { getSafeInternalReturn } from "@/lib/navigation";

describe("getSafeInternalReturn", () => {
  it("accepts local paths and preserves queries", () => {
    expect(getSafeInternalReturn("/docs")).toBe("/docs");
    expect(getSafeInternalReturn("/docs?id=1")).toBe("/docs?id=1");
  });

  it.each([
    ["//evil.test", "/docs"],
    ["https://evil.test", "/docs"],
    ["\\evil", "/docs"],
    ["%2F%2Fevil.test", "/docs"],
    ["%ZZ", "/docs"],
    [null, "/docs"],
  ])("rejects unsafe value %s", (value, expected) => {
    expect(getSafeInternalReturn(value)).toBe(expected);
  });

  it("supports a deterministic fallback", () => {
    expect(getSafeInternalReturn("", "/login")).toBe("/login");
  });

  it("normalizes an encoded safe path before navigation", () => {
    expect(getSafeInternalReturn("%2Fdocs%3Fid%3D1")).toBe("/docs?id=1");
  });
});
