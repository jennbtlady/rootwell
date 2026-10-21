"use client";

import * as React from "react";
import { Button } from "./button";
import { Modal } from "./modal";

/**
 * The app's own "are you sure?" box, in place of the browser's confirm(). The browser's
 * box looks unlike the app and is easy to click through (persona walkthroughs). Mount
 * <ConfirmHost> once (the app layout does) and call useConfirm() anywhere below it:
 *
 *   if (!(await confirm({ title: "Remove this gift?", confirmLabel: "Remove gift", destructive: true }))) return;
 *
 * The safe choice is on the left and is where focus starts, so Enter never deletes.
 */
export type ConfirmOptions = {
  title: string;
  body?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

const ConfirmContext = React.createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmHost({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<Pending | null>(null);
  const cancelRef = React.useRef<HTMLButtonElement>(null);

  const confirm = React.useCallback(
    (o: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...o, resolve });
      }),
    [],
  );

  function close(ok: boolean) {
    pending?.resolve(ok);
    setPending(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <Modal
          open
          onOpenChange={(o) => !o && close(false)}
          title={pending.title}
          initialFocus={cancelRef}
          footer={
            <>
              <Button ref={cancelRef} variant="secondary" onClick={() => close(false)}>
                {pending.cancelLabel ?? "Cancel"}
              </Button>
              <Button variant={pending.destructive ? "destructive" : "primary"} onClick={() => close(true)}>
                {pending.confirmLabel}
              </Button>
            </>
          }
        >
          {pending.body && <div className="text-30 leading-5">{pending.body}</div>}
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

/** Returns confirm(options), which resolves true only when the person chooses the confirm button. */
export function useConfirm() {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm needs <ConfirmHost> above it");
  return ctx;
}
