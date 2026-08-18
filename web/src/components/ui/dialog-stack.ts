"use client";

let overlayStack: string[] = [];
let scrollLockCount = 0;
let previousBodyOverflow = "";
const stackListeners = new Set<() => void>();

export const DIALOG_BASE_Z_INDEX = 200;

function notifyStackListeners() {
  stackListeners.forEach((listener) => listener());
}

export function subscribeDialogStack(listener: () => void) {
  stackListeners.add(listener);
  return () => {
    stackListeners.delete(listener);
  };
}

export function getDialogZIndex(id: string) {
  const stackIndex = overlayStack.indexOf(id);
  return DIALOG_BASE_Z_INDEX + Math.max(0, stackIndex);
}

export function registerDialog(id: string) {
  overlayStack = [...overlayStack.filter((item) => item !== id), id];
  notifyStackListeners();

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
    notifyStackListeners();
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
  notifyStackListeners();
}
