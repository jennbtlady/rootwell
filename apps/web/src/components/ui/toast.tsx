"use client";

import * as React from "react";
import { Toast } from "@base-ui/react/toast";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Toast after Paste's Toast, on Base UI for stacking, timing and announcements.
 * Mount <ToastHost> once (the app layout does) and call useToast() anywhere below it.
 * Use it for confirmations of actions that moved the person somewhere else, or that
 * have no form to show a message in. Field errors stay with the field.
 */
export function ToastHost({ children }: { children: React.ReactNode }) {
  return (
    <Toast.Provider timeout={6000} limit={3}>
      {children}
      <Toast.Portal>
        <Toast.Viewport className="fixed bottom-4 right-4 z-90 flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2 outline-none">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

const VARIANT = {
  neutral: { className: "border-border-neutral-weaker bg-background-neutral-weakest text-text-neutral", Icon: Info, icon: "text-text-icon-neutral" },
  success: { className: "border-border-success-weaker bg-background-success-weakest text-text-success", Icon: CircleCheck, icon: "text-text-icon-success" },
  error: { className: "border-border-error-weaker bg-background-error-weakest text-text-error", Icon: CircleAlert, icon: "text-text-icon-error" },
} as const;

function ToastList() {
  const { toasts } = Toast.useToastManager();
  return toasts.map((t) => {
    const v = VARIANT[(t.type as keyof typeof VARIANT) ?? "neutral"] ?? VARIANT.neutral;
    return (
      <Toast.Root
        key={t.id}
        toast={t}
        className={cn(
          "flex gap-3 rounded-30 border p-4 text-30 leading-5 shadow-elevation-10 transition-[opacity,transform] duration-200",
          "data-[ending-style]:translate-y-2 data-[ending-style]:opacity-0 data-[starting-style]:translate-y-2 data-[starting-style]:opacity-0",
          v.className,
        )}
      >
        <v.Icon className={cn("mt-px size-5 shrink-0", v.icon)} aria-hidden="true" />
        <Toast.Content className="min-w-0 flex-1">
          {t.title && <Toast.Title className="font-semibold" />}
          {t.description && <Toast.Description />}
        </Toast.Content>
        <Toast.Close className="-m-1 rounded-20 p-1 text-text-icon outline-none hover:text-text focus-visible:shadow-focus" aria-label="Dismiss">
          <X className="size-5" aria-hidden="true" />
        </Toast.Close>
      </Toast.Root>
    );
  });
}

/** Returns a function: toast({ type, title, description }). */
export function useToast() {
  const manager = Toast.useToastManager();
  return React.useCallback(
    (opts: { type?: keyof typeof VARIANT; title: React.ReactNode; description?: React.ReactNode }) => manager.add({ type: opts.type ?? "neutral", title: opts.title, description: opts.description }),
    [manager],
  );
}
