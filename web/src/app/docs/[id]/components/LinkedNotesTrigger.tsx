import { forwardRef } from "react";
import { Link2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type LinkedNotesTriggerProps = {
  open: boolean;
  loaded: boolean;
  count: number;
  onClick: () => void;
};

export const LinkedNotesTrigger = forwardRef<
  HTMLButtonElement,
  LinkedNotesTriggerProps
>(function LinkedNotesTrigger(props, ref) {
  const countLabel = props.count > 99 ? "99+" : String(props.count);
  const label = props.open
    ? "Close linked notes"
    : props.loaded && props.count === 0
      ? "Open linked notes, no linked notes"
      : props.loaded
        ? `Open linked notes, ${props.count} linked notes`
        : "Open linked notes";
  return (
    <Button
      ref={ref}
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      aria-expanded={props.open}
      aria-controls={props.open ? "editor-linked-notes-popover" : undefined}
      onClick={props.onClick}
      className={`relative hidden h-10 w-10 lg:inline-flex ${
        props.open ? "bg-accent text-foreground" : "text-muted-foreground"
      }`}
    >
      <Link2 aria-hidden="true" className="h-4 w-4" />
      {props.loaded && props.count > 0 ? (
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -top-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full border border-background bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground"
        >
          {countLabel}
        </span>
      ) : null}
    </Button>
  );
});
