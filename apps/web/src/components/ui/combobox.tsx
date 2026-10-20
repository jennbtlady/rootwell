"use client";

import * as React from "react";
import { Combobox as Base } from "@base-ui/react/combobox";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { fieldBoxClass, fieldControlClass } from "./input";

export type ComboboxItem = { id: string; label: string; detail?: string | null };

/**
 * Combobox after Paste's Combobox, on Base UI. Items can be static or fetched as the
 * person types (`onSearch`). The selected item stays visible while new results load.
 */
export function Combobox({
  id,
  items,
  value,
  onChange,
  onSearch,
  placeholder,
  emptyText = "No matches",
  hasError,
  disabled,
  footer,
  inputRef,
  ...aria
}: {
  id: string;
  inputRef?: React.Ref<HTMLInputElement>;
  items: ComboboxItem[];
  value: ComboboxItem | null;
  onChange: (item: ComboboxItem | null) => void;
  /** When given, filtering happens on the server: called with the typed text. */
  onSearch?: (q: string) => void;
  placeholder?: string;
  emptyText?: string;
  hasError?: boolean;
  disabled?: boolean;
  /** Rendered under the list, for example a "Create new" action. */
  footer?: React.ReactNode;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}) {
  const allItems = React.useMemo(() => (value && !items.some((i) => i.id === value.id) ? [value, ...items] : items), [items, value]);
  return (
    <Base.Root<ComboboxItem>
      items={allItems}
      value={value}
      onValueChange={(v) => onChange(v ?? null)}
      filter={onSearch ? null : undefined}
      itemToStringLabel={(i) => i.label}
      isItemEqualToValue={(a, b) => a.id === b.id}
      onInputValueChange={(text, { reason }) => {
        if (onSearch && reason !== "item-press") onSearch(text);
      }}
      disabled={disabled}
      inputRef={inputRef}
    >
      <div className={cn(fieldBoxClass({ hasError, disabled }), "relative")}>
        <Base.Input id={id} className={cn(fieldControlClass, "pr-9")} placeholder={placeholder} autoComplete="off" aria-describedby={aria["aria-describedby"]} aria-invalid={aria["aria-invalid"]} />
        <Base.Trigger className="absolute right-0 top-0 flex h-full w-9 items-center justify-center text-text-icon outline-none" aria-label="Open list" tabIndex={-1}>
          <ChevronDown className="size-5" aria-hidden="true" />
        </Base.Trigger>
      </div>
      <Base.Portal>
        <Base.Positioner sideOffset={4} className="z-90 w-[var(--anchor-width)]">
          <Base.Popup className="max-h-72 overflow-y-auto rounded-20 bg-background-weaker py-1 shadow-elevation-10 outline-none">
            <Base.Empty className="px-4 py-3 text-30 leading-5 text-text-weak">{emptyText}</Base.Empty>
            <Base.List>
              {(item: ComboboxItem) => (
                <Base.Item
                  key={item.id}
                  value={item}
                  className="mx-1 flex cursor-pointer items-start gap-2 rounded-30 px-3 py-2 text-30 leading-5 text-text outline-none data-[highlighted]:bg-background-primary-weakest data-[highlighted]:text-text-primary data-[selected]:bg-background-primary-weakest"
                >
                  <Base.ItemIndicator className="mt-0.5 w-4 shrink-0">
                    <Check className="size-4" aria-hidden="true" />
                  </Base.ItemIndicator>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{item.label}</span>
                    {item.detail && <span className="truncate text-20 text-text-weak">{item.detail}</span>}
                  </span>
                </Base.Item>
              )}
            </Base.List>
            {footer && <div className="mt-1 border-t border-border-weaker px-3 py-2">{footer}</div>}
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}
