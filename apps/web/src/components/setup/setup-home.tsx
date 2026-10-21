import Link from "next/link";
import type { SetupStep } from "@maple/core/services";
import { SETUP_COPY } from "@/lib/setup-steps";
import { cn } from "@/lib/cn";
import { Card, Heading } from "@/components/ui";
import { buttonVariants } from "@/components/ui/button";

/**
 * Home for a brand-new organization: a short, friendly path instead of a dashboard full of
 * zeros. Switches to the staff dashboard once the basics are done or the first gift exists.
 */
export function SetupHome({ orgId, orgName, steps, canManage }: { orgId: string; orgName: string; steps: SetupStep[]; canManage: boolean }) {
  const base = `/app/orgs/${orgId}`;
  const shown = steps.filter((s) => s.key !== "online");
  const started = shown.some((s) => s.done);
  return (
    <div className="flex flex-col gap-4">
      <Heading variant="heading30" as="h1" noMargin>
        Home
      </Heading>
      <Card className="p-5 sm:p-8">
        <div className="flex max-w-2xl flex-col gap-3">
          <Heading variant="heading20" as="h2" noMargin>
            {started ? `Let's finish setting up ${orgName}` : `Welcome. Let's get ${orgName} set up.`}
          </Heading>
          <p className="text-40 leading-6">
            {canManage
              ? "It takes about 15 minutes. You can stop any time and pick up where you left off. Nothing here is hard to undo."
              : "Your organization's owner is setting things up. Meanwhile you can add donors under Donors."}
          </p>
          {canManage && (
            <div>
              <Link href={`${base}/setup`} className={buttonVariants({ size: "default" })}>
                {started ? "Continue setup" : "Start setup"}
              </Link>
            </div>
          )}
        </div>
        <ol className="mt-6 grid gap-2 sm:grid-cols-2">
          {shown.map((s, i) => (
            <li key={s.key} className="flex items-start gap-3 rounded-30 border border-border-weaker p-3">
              <span aria-hidden="true" className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-circle text-20 font-semibold", s.done ? "bg-background-success text-text-inverse" : "bg-background-strong text-text")}>
                {s.done ? "✓" : i + 1}
              </span>
              <span className="flex flex-col">
                <span className="text-30 font-semibold leading-5">
                  {SETUP_COPY[s.key].title}
                  {s.optional && <span className="font-normal text-text-weak"> (optional)</span>}
                  <span className="sr-only">{s.done ? ", done" : ", to do"}</span>
                </span>
                <span className="text-20 leading-4 text-text-weak">{SETUP_COPY[s.key].detail}</span>
              </span>
            </li>
          ))}
        </ol>
      </Card>
      <p className="text-30 leading-5 text-text-weak">
        Just looking around first? The{" "}
        <Link className="text-text-link underline" href="/app">
          sample organization
        </Link>
        {" "}is full of made-up donors and gifts you can click through.
      </p>
    </div>
  );
}
