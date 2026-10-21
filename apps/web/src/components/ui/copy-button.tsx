"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { Button, type ButtonProps } from "./button";

/**
 * Copies text and says so on the button itself for a few seconds. A toast in the corner
 * was easy to miss (persona walkthroughs). If the browser blocks the clipboard, the button
 * says to copy by hand instead of failing silently.
 */
export function CopyButton({ text, label = "Copy link", ...props }: Omit<ButtonProps, "onClick" | "children"> & { text: string; label?: string }) {
  const [state, setState] = React.useState<"idle" | "copied" | "failed">("idle");
  React.useEffect(() => {
    if (state === "idle") return;
    const t = setTimeout(() => setState("idle"), 3000);
    return () => clearTimeout(t);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <>
      <Button {...props} onClick={copy}>
        {state === "copied" ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
        {state === "copied" ? "Copied" : label}
      </Button>
      <span role="status" className="sr-only">
        {state === "copied" ? "Copied to the clipboard" : state === "failed" ? "Could not copy. Select the link and copy it by hand." : ""}
      </span>
      {state === "failed" && <span className="ml-2 text-30 text-text-error">Could not copy. Select the link and copy it by hand.</span>}
    </>
  );
}
