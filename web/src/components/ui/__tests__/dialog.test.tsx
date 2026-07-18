import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRef, useState } from "react";

import {
  Dialog,
  DialogBody,
  DialogCloseButton,
  DialogFooter,
  DialogHeader,
  DialogStatus,
} from "@/components/ui/dialog";
import { resetDialogStackForTests } from "@/components/ui/dialog-stack";

const originalOffsetParent = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "offsetParent",
);

beforeEach(() => {
  resetDialogStackForTests();
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get() {
      return document.body;
    },
  });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetDialogStackForTests();
  document.body.style.overflow = "";
  if (originalOffsetParent) {
    Object.defineProperty(HTMLElement.prototype, "offsetParent", originalOffsetParent);
  }
});

function StandardHarness() {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open settings</button>
      <Dialog
        open={open}
        title="Settings"
        description="Update dialog preferences"
        initialFocusRef={inputRef}
        onClose={() => setOpen(false)}
      >
        <DialogHeader />
        <DialogBody>
          <input ref={inputRef} aria-label="Name" />
          <button type="button">Last body action</button>
        </DialogBody>
        <DialogFooter>
          <button type="button" onClick={() => setOpen(false)}>Cancel</button>
          <button type="button">Save</button>
        </DialogFooter>
      </Dialog>
    </>
  );
}

describe("Dialog", () => {
  it("renders through a portal with labelled semantics and standard regions", () => {
    render(<StandardHarness />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog.parentElement).toBe(document.body.querySelector("[data-dialog-overlay]"));
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const title = document.getElementById(dialog.getAttribute("aria-labelledby") || "");
    const description = document.getElementById(dialog.getAttribute("aria-describedby") || "");
    expect(title?.textContent).toBe("Settings");
    expect(description?.textContent).toBe("Update dialog preferences");
    expect(screen.getByRole("banner")).toBeTruthy();
    expect(screen.getByRole("contentinfo")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Name" }));
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("traps focus, closes by Escape, and restores the trigger", () => {
    render(<StandardHarness />);
    const trigger = screen.getByRole("button", { name: "Open settings" });
    trigger.focus();
    fireEvent.click(trigger);

    const first = screen.getByRole("button", { name: "Close" });
    const last = screen.getByRole("button", { name: "Save" });
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    first.focus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe("");
  });

  it("honors when-idle and explicit dismissal policies", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Dialog
        open
        title="Busy"
        dismissPolicy="when-idle"
        busy
        onClose={onClose}
      >
        <DialogHeader />
        <DialogBody>Working</DialogBody>
      </Dialog>,
    );
    const busyDialog = screen.getByRole("dialog");
    fireEvent.keyDown(busyDialog, { key: "Escape" });
    fireEvent.mouseDown(busyDialog.parentElement as HTMLElement);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Close" }).disabled).toBe(true);
    expect(onClose).not.toHaveBeenCalled();

    rerender(
      <Dialog
        open
        title="Decision"
        dismissPolicy="explicit"
        onClose={onClose}
      >
        <DialogHeader showClose={false} />
        <DialogBody>Choose a version</DialogBody>
      </Dialog>,
    );
    const explicitDialog = screen.getByRole("dialog");
    fireEvent.keyDown(explicitDialog, { key: "Escape" });
    fireEvent.mouseDown(explicitDialog.parentElement as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("reports close reasons from the backdrop and close button", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Dialog open title="Closable" onClose={onClose}>
        <DialogHeader />
      </Dialog>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenLastCalledWith("close-button");

    rerender(
      <Dialog open title="Closable" onClose={onClose}>
        <DialogHeader />
      </Dialog>,
    );
    fireEvent.mouseDown(screen.getByRole("dialog").parentElement as HTMLElement);
    expect(onClose).toHaveBeenLastCalledWith("backdrop");
  });

  it("keeps scroll locked until the final stacked dialog closes", () => {
    const { rerender } = render(
      <>
        <Dialog open title="First"><button type="button">First action</button></Dialog>
        <Dialog open title="Second"><button type="button">Second action</button></Dialog>
      </>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    rerender(
      <>
        <Dialog open title="First"><button type="button">First action</button></Dialog>
        <Dialog open={false} title="Second"><button type="button">Second action</button></Dialog>
      </>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    rerender(
      <>
        <Dialog open={false} title="First"><button type="button">First action</button></Dialog>
        <Dialog open={false} title="Second"><button type="button">Second action</button></Dialog>
      </>,
    );
    expect(document.body.style.overflow).toBe("");
  });

  it("supports semantic variants, return focus, and status announcements", () => {
    const returnRef = { current: document.createElement("button") };
    document.body.appendChild(returnRef.current);
    const { rerender } = render(
      <Dialog
        open
        title="Drawer"
        variant="drawer"
        returnFocusRef={returnRef}
      >
        <DialogHeader />
        <DialogBody>
          <DialogStatus variant="loading">Loading details</DialogStatus>
          <DialogStatus variant="error">Unable to load</DialogStatus>
        </DialogBody>
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.dataset.dialogVariant).toBe("drawer");
    expect(screen.getByText("Loading details").closest("[role='status']")).toBeTruthy();
    expect(screen.getByText("Unable to load").closest("[role='alert']")).toBeTruthy();
    expect(dialog.className).toContain("motion-reduce:transition-none");

    rerender(
      <Dialog open={false} title="Drawer" returnFocusRef={returnRef}>
        <DialogCloseButton />
      </Dialog>,
    );
    expect(document.activeElement).toBe(returnRef.current);
  });
});
