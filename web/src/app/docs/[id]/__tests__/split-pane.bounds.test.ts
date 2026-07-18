import { describe, expect, it } from "vitest";

import {
  clampSplitRatioForWidth,
  getSplitRatioBounds,
} from "../components/SplitPane";

describe("SplitPane dynamic width bounds", () => {
  it("keeps the absolute 30-70 range when both panes exceed 420px", () => {
    expect(getSplitRatioBounds(1500)).toEqual({ min: 30, max: 70 });
  });

  it("uses pixel-derived bounds after reserving the divider", () => {
    const expectedMin = (420 / (1000 - 6)) * 100;
    expect(getSplitRatioBounds(1000).min).toBeCloseTo(expectedMin);
    expect(getSplitRatioBounds(1000).max).toBeCloseTo(100 - expectedMin);
    expect(clampSplitRatioForWidth(30, 1000)).toBeCloseTo(expectedMin);
    expect(clampSplitRatioForWidth(70, 1000)).toBeCloseTo(100 - expectedMin);
  });

  it("locks to an equal split when the workspace cannot fit both minima", () => {
    expect(getSplitRatioBounds(800)).toEqual({ min: 50, max: 50 });
    expect(clampSplitRatioForWidth(65, 800)).toBe(50);
  });

  it("falls back to absolute bounds before the workspace is measured", () => {
    expect(getSplitRatioBounds(0)).toEqual({ min: 30, max: 70 });
    expect(getSplitRatioBounds(Number.NaN)).toEqual({ min: 30, max: 70 });
  });
});
