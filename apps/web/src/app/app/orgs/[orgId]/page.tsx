import { notFound } from "next/navigation";
import { z } from "zod";
import { getOrg } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default async function OrgPage({ params }: PageProps<"/app/orgs/[orgId]">) {
  const { orgId } = await params;
  if (!z.string().uuid().safeParse(orgId).success) notFound();

  const session = await requireSession();
  const org = await withSession(session, (tx) => getOrg(tx, orgId));
  if (!org) notFound();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{org.name}</h1>
      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
          <CardDescription>Constituents, gifts and the dashboard arrive in the next phase.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <dt className="text-muted-foreground">Fiscal year starts</dt>
            <dd>{MONTHS[org.fiscalYearStartMonth - 1]}</dd>
            <dt className="text-muted-foreground">Time zone</dt>
            <dd>{org.timezone.replace("_", " ")}</dd>
            <dt className="text-muted-foreground">Plan</dt>
            <dd className="capitalize">{org.subscriptionStatus.replace("_", " ")}</dd>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
