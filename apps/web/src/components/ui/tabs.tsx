"use client";

import * as React from "react";
import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import { cn } from "@/lib/cn";

/** Tabs after Paste's Tabs, on Base UI for keyboard behavior. Horizontal, scrolls on phones. */
export function Tabs({ className, ...props }: React.ComponentProps<typeof BaseTabs.Root>) {
  return <BaseTabs.Root className={cn("flex flex-col gap-4", className)} {...props} />;
}

export function TabList({ className, ...props }: React.ComponentProps<typeof BaseTabs.List>) {
  return (
    <BaseTabs.List
      className={cn("relative flex gap-1 overflow-x-auto border-b border-border-weak", className)}
      {...props}
    />
  );
}

export function Tab({ className, ...props }: React.ComponentProps<typeof BaseTabs.Tab>) {
  return (
    <BaseTabs.Tab
      className={cn(
        "-mb-px shrink-0 border-b-2 border-transparent px-4 pb-2 pt-1 text-30 font-medium leading-5 text-text-weak outline-none transition-colors",
        "hover:border-border-primary hover:text-text-link focus-visible:rounded-20 focus-visible:shadow-focus-inset",
        "data-[active]:border-border-primary data-[active]:text-text-primary",
        className,
      )}
      {...props}
    />
  );
}

export function TabPanel({ className, ...props }: React.ComponentProps<typeof BaseTabs.Panel>) {
  return <BaseTabs.Panel className={cn("outline-none", className)} {...props} />;
}
