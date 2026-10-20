import Link from "next/link";
import { listMyOrgs } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { Badge, buttonVariants, Card, CardContent, CardDescription, CardHeader, CardTitle, Heading } from "@/components/ui";
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
        <CardContent>
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
        <Heading variant="heading30" as="h1" noMargin>
          Your organizations
        </Heading>
        <Link href="/app/orgs/new" className={buttonVariants({ variant: "secondary", size: "small" })}>
          Add another
        </Link>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {orgs.map((o) => (
          <li key={o.id}>
            <Link
              href={`/app/orgs/${o.id}`}
              aria-label={`${o.name}, ${ROLE_LABEL[o.role]}${o.isSample ? ", sample" : ""}`}
              className="block rounded-30 border border-border-weaker bg-background-weakest p-4 outline-none transition-[box-shadow] hover:shadow-border-primary focus-visible:shadow-focus"
            >
              <div className="flex items-center gap-2 text-30 font-semibold leading-5">
                <span className="truncate">{o.name}</span>
                {o.isSample && <Badge variant="new">Sample</Badge>}
              </div>
              <div className="mt-1 text-30 leading-5 text-text-weak">{ROLE_LABEL[o.role]}</div>
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
