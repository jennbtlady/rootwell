import * as React from "react";
import { cn } from "@/lib/cn";
import { Heading } from "./heading";

/**
 * Card after Paste's Card: 1px weaker border, 8px radius, weakest background.
 * Paste pads cards 36px; this app uses 24px at phone width and 36px above.
 */
export function Card({ className, ...props }: React.ComponentPropsWithRef<"article">) {
  return <article className={cn("rounded-30 border border-border-weaker bg-background-weakest p-6 sm:p-9", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.ComponentPropsWithRef<"div">) {
  return <div className={cn("mb-4 flex flex-col gap-1", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.ComponentPropsWithRef<"h2">) {
  return <Heading variant="heading40" as="h2" noMargin className={className} {...props} />;
}

export function CardDescription({ className, ...props }: React.ComponentPropsWithRef<"p">) {
  return <p className={cn("text-30 leading-5 text-text-weak", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.ComponentPropsWithRef<"div">) {
  return <div className={cn("flex flex-col gap-4", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.ComponentPropsWithRef<"div">) {
  return <div className={cn("mt-4 flex flex-wrap items-center gap-2", className)} {...props} />;
}
