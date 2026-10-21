import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDashboard, getOrg, setupProgress, staffHome } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { buttonVariants, Card, CardContent, CardDescription, CardHeader, CardTitle, Heading } from "@/components/ui";
import { RemoveSampleButton } from "@/components/orgs/sample-org-buttons";
import { StaffDashboard } from "@/components/dashboard/staff-dashboard";
import { ROLE_LABEL } from "@/components/orgs/role-labels";

/** Overview: the few numbers and links a person wants when they open an organization. */
export default async function OrgPage({ params }: PageProps<"/app/orgs/[orgId]">) {
  const { orgId } = await params;
  const session = await requireSession();
  const data = await withSession(session, async (tx) => {
    const org = await getOrg(tx, orgId);
    if (!org) return null;
    if (org.role === "board_viewer") return { org, steps: [], snap: null, live: null };
    const [steps, snap, live] = await Promise.all([setupProgress(tx, orgId), getDashboard(tx, orgId), staffHome(tx, orgId)]);
    return { org, steps: steps ?? [], snap, live };
  });
  if (!data) notFound();
  const { org, snap, live } = data;
  if (org.role === "board_viewer") redirect(`/app/orgs/${orgId}/dashboard`);
  const base = `/app/orgs/${orgId}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Heading variant="heading30" as="h1" noMargin>
          Home
        </Heading>
        <div className="flex flex-wrap gap-2">
          <Link href={`${base}/batches`} className={buttonVariants({ size: "small" })}>
            Enter gifts
          </Link>
          <Link href={`${base}/constituents/new`} className={buttonVariants({ variant: "secondary", size: "small" })}>
            Add a donor
          </Link>
        </div>
      </div>
      <p className="sr-only">You are {org.role === "owner" ? "the owner" : `a ${ROLE_LABEL[org.role].toLowerCase()}`}.</p>

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

      {!org.isSample && (org.role === "owner" || org.role === "admin") && data.steps.some((st) => !st.done && !st.optional) && (
        <Card>
          <CardHeader>
            <CardTitle>Get set up</CardTitle>
            <CardDescription>
              {data.steps.filter((st) => st.done && !st.optional).length} of {data.steps.filter((st) => !st.optional).length} steps done. Funds, gift rules, your donors, your team, and thank-you letters.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href={`${base}/setup`} className={buttonVariants({ size: "small" })}>
              See the steps
            </Link>
          </CardContent>
        </Card>
      )}

      {snap && live && <StaffDashboard base={base} data={snap.data} live={live} />}
    </div>
  );
}
