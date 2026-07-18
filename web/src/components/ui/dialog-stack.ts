"use client";

let overlayStack: string[] = [];
let scrollLockCount = 0;
let previousBodyOverflow = "";

export function registerDialog(id: string) {
  overlayStack = [...overlayStack.filter((item) => item !== id), id];

  if (scrollLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  scrollLockCount += 1;

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    overlayStack = overlayStack.filter((item) => item !== id);
    scrollLockCount = Math.max(0, scrollLockCount - 1);
    if (scrollLockCount === 0) {
      document.body.style.overflow = previousBodyOverflow;
      previousBodyOverflow = "";
    }
  };
}

export function isTopDialog(id: string) {
  return overlayStack.at(-1) === id;
}

export function resetDialogStackForTests() {
  overlayStack = [];
  scrollLockCount = 0;
  previousBodyOverflow = "";
}
