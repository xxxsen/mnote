import * as React from "react";

import { Button, type ButtonProps } from "./button";

type IconButtonProps = Omit<ButtonProps, "aria-label" | "size"> & {
  label: string;
  pressed?: boolean;
  expanded?: boolean;
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { label, pressed, expanded, title, children, ...props },
    ref,
  ) {
    return (
      <Button
        {...props}
        ref={ref}
        size="icon"
        aria-label={label}
        aria-pressed={pressed}
        aria-expanded={expanded}
        title={title ?? label}
      >
        {children}
      </Button>
    );
  },
);
