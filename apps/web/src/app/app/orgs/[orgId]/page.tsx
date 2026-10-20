import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getOrg } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { Badge, buttonVariants, Card, CardContent, CardDescription, CardHeader, CardTitle, Heading } from "@/components/ui";
import { RemoveSampleButton } from "@/components/orgs/sample-org-buttons";
import { ROLE_LABEL } from "@/components/orgs/role-labels";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default async function OrgPage({ params }: PageProps<"/app/orgs/[orgId]">) {
  const { orgId } = await params;
  if (!z.string().uuid().safeParse(orgId).success) notFound();

  const session = await requireSession();
  const org = await withSession(session, (tx) => getOrg(tx, orgId));
  if (!org) notFound();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Heading variant="heading30" as="h1" noMargin className="flex items-center gap-2">
            {org.name}
            {org.isSample && <Badge variant="new">Sample</Badge>}
          </Heading>
          <p className="text-30 leading-5 text-text-weak">You are {ROLE_LABEL[org.role].toLowerCase() === "owner" ? "the owner" : `a ${ROLE_LABEL[org.role].toLowerCase()}`}.</p>
        </div>
        <Link href={`/app/orgs/${orgId}/members`} className={buttonVariants({ variant: "secondary", size: "small" })}>
          Team
        </Link>
      </div>

      {org.isSample && (
        <Card>
          <CardHeader>
            <CardTitle>This is the sample organization</CardTitle>
            <CardDescription>Nothing here is real. Click around, then remove it whenever you are ready to work with your own data.</CardDescription>
          </CardHeader>
          {org.role === "owner" && (
            <CardContent>
              <RemoveSampleButton orgId={orgId} />
            </CardContent>
          )}
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
          <CardDescription>Constituents, gifts and the dashboard arrive in the next phase.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-2 text-30 leading-5 sm:grid-cols-2">
            <dt className="text-text-weak">Fiscal year starts</dt>
            <dd>{MONTHS[org.fiscalYearStartMonth - 1]}</dd>
            <dt className="text-text-weak">Time zone</dt>
            <dd>{org.timezone.replace("_", " ")}</dd>
            <dt className="text-text-weak">Plan</dt>
            <dd className="capitalize">{org.subscriptionStatus.replace("_", " ")}</dd>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
