import { describe, it, expect } from "vitest";
import {
  tocTokenRegex, allowedHtmlTags, ADMONITION_TYPE_ALIASES,
  ADMONITION_STYLES, FONT_SIZE_MAP, RUNNABLE_LANGS,
} from "../constants";

describe("tocTokenRegex", () => {
  it("matches [toc]", () => {
    expect(tocTokenRegex.test("[toc]")).toBe(true);
  });
  it("matches [TOC]", () => {
    expect(tocTokenRegex.test("[TOC]")).toBe(true);
  });
  it("does not match [Toc]", () => {
    expect(tocTokenRegex.test("[Toc]")).toBe(false);
  });
  it("requires exact match", () => {
    expect(tocTokenRegex.test("x[toc]")).toBe(false);
  });
});

describe("allowedHtmlTags", () => {
  it("includes span, a, div, br", () => {
    expect(allowedHtmlTags.has("span")).toBe(true);
    expect(allowedHtmlTags.has("a")).toBe(true);
    expect(allowedHtmlTags.has("div")).toBe(true);
    expect(allowedHtmlTags.has("br")).toBe(true);
  });
  it("does not include script or iframe", () => {
    expect(allowedHtmlTags.has("script")).toBe(false);
    expect(allowedHtmlTags.has("iframe")).toBe(false);
  });
});

describe("ADMONITION_TYPE_ALIASES", () => {
  it("maps warning to warning", () => {
    expect(ADMONITION_TYPE_ALIASES["warning"]).toBe("warning");
  });
  it("maps danger to error", () => {
    expect(ADMONITION_TYPE_ALIASES["danger"]).toBe("error");
  });
  it("maps note to info", () => {
    expect(ADMONITION_TYPE_ALIASES["note"]).toBe("info");
  });
  it("maps success to tip", () => {
    expect(ADMONITION_TYPE_ALIASES["success"]).toBe("tip");
  });
});

describe("ADMONITION_STYLES", () => {
  it("has styles for all 4 types", () => {
    for (const key of ["warning", "error", "info", "tip"] as const) {
      const style = ADMONITION_STYLES[key];
      expect(style.borderLeft).toBeTruthy();
      expect(style.backgroundColor).toBeTruthy();
      expect(style.color).toBeTruthy();
    }
  });
});

describe("FONT_SIZE_MAP", () => {
  it("maps 1 through 7", () => {
    for (const key of ["1", "2", "3", "4", "5", "6", "7"]) {
      expect(FONT_SIZE_MAP[key]).toMatch(/rem$/);
    }
  });
  it("maps 3 to 1rem", () => {
    expect(FONT_SIZE_MAP["3"]).toBe("1rem");
  });
});

describe("RUNNABLE_LANGS", () => {
  it("includes go, js, py, lua, c and their aliases", () => {
    expect(RUNNABLE_LANGS).toContain("go");
    expect(RUNNABLE_LANGS).toContain("golang");
    expect(RUNNABLE_LANGS).toContain("js");
    expect(RUNNABLE_LANGS).toContain("javascript");
    expect(RUNNABLE_LANGS).toContain("py");
    expect(RUNNABLE_LANGS).toContain("python");
    expect(RUNNABLE_LANGS).toContain("lua");
    expect(RUNNABLE_LANGS).toContain("c");
  });
});
