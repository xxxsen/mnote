import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Menu } from "../menu";

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Menu", () => {
  it("supports roving focus, disabled items, Home and End", () => {
    render(
      <Menu
        label="Actions"
        trigger={<span>Open</span>}
        entries={[
          { id: "first", label: "First" },
          { id: "disabled", label: "Disabled", disabled: true },
          { id: "last", label: "Last" },
        ]}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Actions" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "First" }));

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Last" }));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Home" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "First" }));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "End" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Last" }));
  });

  it("opens submenus by keyboard and restores focus on Escape", () => {
    const select = vi.fn();
    render(
      <Menu
        label="User menu"
        trigger={<span>User</span>}
        entries={[
          {
            id: "import",
            label: "Import",
            children: [{ id: "notes", label: "Micro Note", onSelect: select }],
          },
        ]}
      />,
    );

    const trigger = screen.getByRole("button", { name: "User menu" });
    trigger.focus();
    fireEvent.click(trigger);
    const importItem = screen.getByRole("menuitem", { name: "Import" });
    fireEvent.keyDown(importItem, { key: "ArrowRight" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Micro Note" }));

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(importItem);
    fireEvent.keyDown(importItem, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "Import" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Micro Note" }));
    expect(select).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes on outside pointer input and only keeps one top-level menu open", () => {
    render(
      <>
        <Menu label="First menu" trigger="One" entries={[{ id: "a", label: "A" }]} />
        <Menu label="Second menu" trigger="Two" entries={[{ id: "b", label: "B" }]} />
        <button type="button">Outside</button>
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "First menu" }));
    expect(screen.getByRole("menu", { name: "First menu" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Second menu" }));
    expect(screen.queryByRole("menu", { name: "First menu" })).toBeNull();
    expect(screen.getByRole("menu", { name: "Second menu" })).toBeTruthy();

    act(() => fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" })));
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
