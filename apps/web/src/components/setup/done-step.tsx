import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { WizardData } from "./setup-wizard";

const LABEL: Record<string, string> = {
  profile: "Your organization's details",
  funds: "Funds",
  rules: "Gift rules",
  donors: "Donors",
  team: "Team",
  thanks: "Thank-you letter",
};

/** What is set up, what was skipped, and the next three things to do. */
export function DoneStep({ data }: { data: WizardData }) {
  const base = `/app/orgs/${data.org.id}`;
  const steps = data.steps.filter((s) => s.key !== "online");
  const missingRequired = steps.filter((s) => s.required && !s.done);
  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-2xl text-40 leading-6">
        {missingRequired.length === 0
          ? "You're set up. Here is what is ready, and what most people do next."
          : "Almost there. A few things still need doing before gifts can be recorded smoothly."}
      </p>
      <ul className="flex flex-col gap-2 text-30 leading-5">
        {steps.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span aria-hidden="true" className={cn("flex size-5 items-center justify-center rounded-circle text-20 font-semibold", s.done ? "bg-background-success text-text-inverse" : "bg-background-strong text-text")}>
              {s.done ? "✓" : "–"}
            </span>
            <span>{LABEL[s.key]}</span>
            <span className="text-text-weak">{s.done ? "done" : s.required ? "still needed" : "skipped, you can do this later"}</span>
            {!s.done && (
              <Link className="text-text-link underline" href={`${base}/setup?step=${s.key}`}>
                Do it now<span className="sr-only">: {LABEL[s.key]}</span>
              </Link>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-3 border-t border-border-weaker pt-5">
        <h2 className="text-40 font-semibold">What to do next</h2>
        <ol className="flex flex-col gap-3">
          <li className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-30 leading-5">
              <strong>Record your first gifts.</strong> Take this week&apos;s checks and enter them as one bank deposit.
            </span>
            <Link href={`${base}/batches`} className={buttonVariants({ size: "small" })}>
              Enter gifts
            </Link>
          </li>
          <li className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-30 leading-5">
              <strong>Share the numbers with your board.</strong> A private link to a one-page summary, no sign-in needed.
            </span>
            <Link href={`${base}/settings/board`} className={buttonVariants({ variant: "secondary", size: "small" })}>
              Make a board link
            </Link>
          </li>
          <li className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-30 leading-5">
              <strong>Take gifts online.</strong> Optional. Connect Stripe and make a giving page.
            </span>
            <Link href={`${base}/settings/integrations`} className={buttonVariants({ variant: "secondary", size: "small" })}>
              Set up online giving
            </Link>
          </li>
        </ol>
        <p className="text-30">
          <Link className="text-text-link underline" href={base}>
            Go to Home
          </Link>
        </p>
      </div>
    </div>
  );
}
