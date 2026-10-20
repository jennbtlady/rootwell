import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Table after Paste's Table: 1px weaker borders, semibold header on the weak
 * background, 12px by 16px cells, optional striping. Wrap in a scroll container on
 * phones; the `scrollHorizontally` prop does that.
 */
export function Table({ className, striped, scrollHorizontally = true, children, ...props }: React.ComponentPropsWithRef<"table"> & { striped?: boolean; scrollHorizontally?: boolean }) {
  const table = (
    <table className={cn("w-full border-collapse text-30 leading-5 text-text", striped && "[&_tbody_tr:nth-child(even)]:bg-background-row-striped", className)} {...props}>
      {children}
    </table>
  );
  return scrollHorizontally ? <div className="w-full overflow-x-auto rounded-30 border border-border-weaker">{table}</div> : table;
}

export function THead({ className, ...props }: React.ComponentPropsWithRef<"thead">) {
  return <thead className={cn("bg-background-weak text-text-weak", className)} {...props} />;
}

export function TBody({ className, ...props }: React.ComponentPropsWithRef<"tbody">) {
  return <tbody className={cn("bg-background-weakest", className)} {...props} />;
}

export function TR({ className, ...props }: React.ComponentPropsWithRef<"tr">) {
  return <tr className={cn("border-b border-border-weaker align-middle last:border-b-0", className)} {...props} />;
}

export function TH({ className, align = "left", ...props }: React.ComponentPropsWithRef<"th"> & { align?: "left" | "right" | "center" }) {
  return <th scope="col" className={cn("px-4 py-3 font-semibold whitespace-nowrap", align === "right" && "text-right", align === "center" && "text-center", align === "left" && "text-left", className)} {...props} />;
}

export function TD({ className, align = "left", ...props }: React.ComponentPropsWithRef<"td"> & { align?: "left" | "right" | "center" }) {
  return <td className={cn("px-4 py-3", align === "right" && "text-right tabular-nums", align === "center" && "text-center", className)} {...props} />;
}
