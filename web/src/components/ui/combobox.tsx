"use client";

import {
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import { Search, X } from "lucide-react";

import { Input } from "./input";
import { IconButton } from "./icon-button";
import { cn } from "@/lib/utils";

export type ComboboxOption = {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

type ComboboxProps = {
  label: string;
  value: string;
  options: ComboboxOption[];
  onValueChange: (value: string) => void;
  onSelect: (option: ComboboxOption) => void;
  onClear?: () => void;
  placeholder?: string;
  emptyLabel?: string;
  loading?: boolean;
  enabled?: boolean;
  className?: string;
  inputClassName?: string;
};

function nextOption(options: ComboboxOption[], current: number, direction: 1 | -1) {
  if (!options.some((option) => !option.disabled)) return -1;
  let next = current;
  for (let count = 0; count < options.length; count += 1) {
    next = (next + direction + options.length) % options.length;
    if (!options[next].disabled) return next;
  }
  return -1;
}

export function Combobox({
  label,
  value,
  options,
  onValueChange,
  onSelect,
  onClear,
  placeholder,
  emptyLabel = "No results",
  loading = false,
  enabled = true,
  className,
  inputClassName,
}: ComboboxProps) {
  const id = useId().replaceAll(":", "");
  const listboxID = `combobox-${id}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const open = enabled && focused;
  const safeActiveIndex = Math.min(activeIndex, Math.max(0, options.length - 1));

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setActiveIndex(0);
    onValueChange(event.target.value);
  };

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
  };

  const choose = (option: ComboboxOption) => {
    if (option.disabled) return;
    onSelect(option);
    setFocused(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!focused) setFocused(true);
      setActiveIndex((current) => nextOption(options, current, event.key === "ArrowDown" ? 1 : -1));
    } else if (event.key === "Home" && open) {
      event.preventDefault();
      setActiveIndex(nextOption(options, -1, 1));
    } else if (event.key === "End" && open) {
      event.preventDefault();
      setActiveIndex(nextOption(options, 0, -1));
    } else if (event.key === "Enter" && open && options[safeActiveIndex]) {
      event.preventDefault();
      choose(options[safeActiveIndex]);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      setFocused(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn("relative min-w-0", className)}
      onFocus={() => setFocused(true)}
      onBlur={handleBlur}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        type="search"
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listboxID : undefined}
        aria-activedescendant={open && options[safeActiveIndex] ? `${listboxID}-${options[safeActiveIndex].id}` : undefined}
        value={value}
        placeholder={placeholder}
        className={cn("pl-9 pr-10", inputClassName)}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
      />
      {value && onClear ? (
        <IconButton
          label="Clear search"
          variant="ghost"
          className="absolute right-0 top-0 h-11 w-11 sm:h-10 sm:w-10"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClear}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </IconButton>
      ) : null}
      {open ? (
        <div
          id={listboxID}
          role="listbox"
          aria-label={`${label} results`}
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
        >
          {loading ? (
            <div role="status" className="px-3 py-2 text-sm text-muted-foreground">Searching…</div>
          ) : options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">{emptyLabel}</div>
          ) : options.map((option, index) => (
            <button
              key={option.id}
              id={`${listboxID}-${option.id}`}
              type="button"
              role="option"
              aria-selected={index === safeActiveIndex}
              disabled={option.disabled}
              className={cn(
                "flex min-h-11 w-full flex-col justify-center rounded-md px-3 py-2 text-left text-sm outline-none sm:min-h-10",
                index === safeActiveIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                "disabled:pointer-events-none disabled:opacity-40",
              )}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(option)}
            >
              <span>{option.label}</span>
              {option.description ? <span className="text-xs text-muted-foreground">{option.description}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
