"use client";

import * as React from "react";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Heading } from "./heading";

/**
 * Modal after Paste's Modal, on Base UI's Dialog for focus trapping, Escape and
 * outside-click handling. Header, body and footer are separate so long bodies scroll.
 */
export function Modal({ open, onOpenChange, title, description, size = "default", children, footer }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  size?: "default" | "wide";
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-80 bg-background-overlay transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup
          className={cn(
            "fixed left-1/2 top-1/2 z-80 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-30 bg-background-body shadow-elevation-top-20 outline-none",
            "transition-[opacity,transform] duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 data-[starting-style]:scale-95",
            size === "wide" ? "max-w-[62rem]" : "max-w-[38rem]",
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border-weaker px-6 py-5 sm:px-8">
            <div>
              <Dialog.Title render={<Heading variant="heading30" as="h2" noMargin />}>{title}</Dialog.Title>
              {description && <Dialog.Description className="mt-1 text-30 leading-5 text-text-weak">{description}</Dialog.Description>}
            </div>
            <Dialog.Close className="-m-1 rounded-20 p-1 text-text-icon outline-none hover:text-text focus-visible:shadow-focus" aria-label="Close">
              <X className="size-6" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <div className="overflow-y-auto px-6 py-5 sm:px-8">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border-weaker px-6 py-4 sm:px-8">{footer}</div>}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
