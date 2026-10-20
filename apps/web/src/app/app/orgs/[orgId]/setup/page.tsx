import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrg, setupProgress } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { SETUP_COPY } from "@/lib/setup-steps";
import { Alert, AlertDescription, AlertTitle, Badge, Card, Heading } from "@/components/ui";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Get set up" };

/**
 * Placeholder for the guided setup walkthrough. Today it lists the steps in order, ticks
 * them off from the data, and links to each page. The walkthrough is a future build.
 */
export default async function SetupPage({ params }: PageProps<"/app/orgs/[orgId]/setup">) {
  const { orgId } = await params;
  const session = await requireSession();
  const [org, steps] = await withSession(session, (tx) => Promise.all([getOrg(tx, orgId), setupProgress(tx, orgId)]));
  if (!org || !steps) notFound();
  const done = steps.filter((s) => s.done && !s.optional).length;
  const needed = steps.filter((s) => !s.optional).length;
  const canManage = org.role === "owner" || org.role === "admin";
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Heading variant="heading30" as="h1" noMargin>
          Get set up
        </Heading>
        <p className="mt-1 max-w-2xl text-30 leading-5 text-text-weak">
          {done} of {needed} steps done. Do them in any order and come back any time. Each step ticks itself off when it is done.
        </p>
      </div>
      <Alert>
        <AlertTitle>A guided walkthrough is coming</AlertTitle>
        <AlertDescription>Soon this page will walk you through each step without leaving it. For now, each step links to the page where you do it.</AlertDescription>
      </Alert>
      {!canManage && <p className="text-30 text-text-weak">Most of these steps are for the owner or an admin.</p>}
      <ol className="flex flex-col gap-3">
        {steps.map((s, i) => {
          const c = SETUP_COPY[s.key];
          return (
            <li key={s.key}>
              <Card className="flex flex-wrap items-center gap-3">
                <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-circle bg-background-weak text-30 font-semibold">
                  {i + 1}
                </span>
                <div className="min-w-0 grow basis-60">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-40 font-semibold">{c.title}</h2>
                    {s.done ? <Badge variant="success">Done</Badge> : s.optional ? <Badge>Optional</Badge> : <Badge variant="neutral">To do</Badge>}
                  </div>
                  <p className="text-30 leading-5 text-text-weak">{c.detail}</p>
                </div>
                {canManage && (
                  <Link href={`/app/orgs/${orgId}/${c.path}`} className={buttonVariants({ variant: s.done ? "secondary" : "primary", size: "small" })}>
                    {s.done ? "Review" : c.action}
                    <span className="sr-only">: {c.title}</span>
                  </Link>
                )}
              </Card>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
