import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Combobox } from "../combobox";

afterEach(cleanup);

describe("Combobox", () => {
  it("exposes listbox semantics and supports keyboard selection", () => {
    const onValueChange = vi.fn();
    const onSelect = vi.fn();
    render(
      <Combobox
        label="Find a tag"
        value="/pro"
        options={[
          { id: "1", label: "product" },
          { id: "2", label: "project" },
        ]}
        onValueChange={onValueChange}
        onSelect={onSelect}
      />,
    );

    const input = screen.getByRole("combobox", { name: "Find a tag" });
    fireEvent.focus(input);
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "2" }));
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });

  it("reports loading and empty results and offers an explicit clear action", () => {
    const onClear = vi.fn();
    const { rerender } = render(
      <Combobox
        label="Search"
        value="missing"
        options={[]}
        loading
        onValueChange={vi.fn()}
        onSelect={vi.fn()}
        onClear={onClear}
      />,
    );
    fireEvent.focus(screen.getByRole("combobox"));
    expect(screen.getByRole("status").textContent).toContain("Searching");

    rerender(
      <Combobox
        label="Search"
        value="missing"
        options={[]}
        emptyLabel="Nothing matched"
        onValueChange={vi.fn()}
        onSelect={vi.fn()}
        onClear={onClear}
      />,
    );
    expect(screen.getByText("Nothing matched")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});
