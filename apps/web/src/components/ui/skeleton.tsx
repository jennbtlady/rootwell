import { cn } from "cn";

/** Placeholder block after Paste's SkeletonLoader. Give it the size of the content it stands in for. */
export function Skeleton({ className, ...props }: React.ComponentPropsWithRef<"div">) {
  return <div aria-hidden="true" className={cn("h-4 w-full animate-pulse rounded-20 bg-background-strong", className)} {...props} />;
}
