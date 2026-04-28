export type PendingAdjust =
  | { type: "prepend"; prevTop: number; prevHeight: number }
  | { type: "append" }
  | null;
