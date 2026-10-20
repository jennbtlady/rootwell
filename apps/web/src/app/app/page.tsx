import Link from "next/link";
import { listMyOrgs } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ExploreSampleButton } from "@/components/orgs/sample-org-buttons";
import { ROLE_LABEL } from "@/components/orgs/role-labels";

export default async function AppHome() {
  const session = await requireSession();
  const orgs = await withSession(session, (tx) => listMyOrgs(tx));
  const hasSample = orgs.some((o) => o.isSample);

  if (orgs.length === 0) {
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader>
          <CardTitle>Set up your organization</CardTitle>
          <CardDescription>You will be its owner. You can invite your team right after.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Link href="/app/orgs/new" className={buttonVariants()}>
            Create organization
          </Link>
          <ExploreSampleButton />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Your organizations</h1>
        <Link href="/app/orgs/new" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Add another
        </Link>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {orgs.map((o) => (
          <li key={o.id}>
            <Link
              href={`/app/orgs/${o.id}`}
              aria-label={`${o.name}, ${ROLE_LABEL[o.role]}${o.isSample ? ", sample" : ""}`}
              className="block rounded-lg border p-4 hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="font-medium">
                {o.name}
                {o.isSample && <span className="ml-2 rounded bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">Sample</span>}
              </div>
              <div className="text-sm text-muted-foreground">{ROLE_LABEL[o.role]}</div>
            </Link>
          </li>
        ))}
      </ul>
      {!hasSample && (
        <div className="max-w-sm">
          <ExploreSampleButton />
        </div>
      )}
    </div>
  );
}
