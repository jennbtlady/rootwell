import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDashboard, getOrg, inSetupMode, setupProgress, staffHome } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { buttonVariants, Card, CardContent, CardDescription, CardHeader, CardTitle, Heading } from "@/components/ui";
import { RemoveSampleButton } from "@/components/orgs/sample-org-buttons";
import { DashboardCustomizer } from "@/components/dashboard/dashboard-customizer";
import { StaffDashboard } from "@/components/dashboard/staff-dashboard";
import { ROLE_LABEL } from "@/components/orgs/role-labels";
import { SetupHome } from "@/components/setup/setup-home";
import { SETUP_COPY } from "@/lib/setup-steps";

/** Overview: the few numbers and links a person wants when they open an organization. */
export default async function OrgPage({ params }: PageProps<"/app/orgs/[orgId]">) {
  const { orgId } = await params;
  const session = await requireSession();
  const data = await withSession(session, async (tx) => {
    const org = await getOrg(tx, orgId);
    if (!org) return null;
    if (org.role === "board_viewer") return { org, steps: [], snap: null, live: null, setup: false };
    const steps = (await setupProgress(tx, orgId)) ?? [];
    // A new organization sees the setup guide on Home instead of a dashboard of zeros.
    const setup = !org.isSample && (await inSetupMode(tx, orgId, steps));
    if (setup) return { org, steps, snap: null, live: null, setup };
    const [snap, live] = await Promise.all([getDashboard(tx, orgId), staffHome(tx, orgId)]);
    return { org, steps, snap, live, setup };
  });
  if (!data) notFound();
  const { org, snap, live } = data;
  if (org.role === "board_viewer") redirect(`/app/orgs/${orgId}/dashboard`);
  const base = `/app/orgs/${orgId}`;
  const canManage = org.role === "owner" || org.role === "admin";
  if (data.setup) return <SetupHome orgId={orgId} orgName={org.name} steps={data.steps} canManage={canManage} />;
  const unfinished = data.steps.filter((st) => !st.done && !st.optional);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Heading variant="heading30" as="h1" noMargin>
          Home
        </Heading>
        {live && live.recentGifts.length > 0 && <div className="flex flex-wrap gap-2">
          <Link href={`${base}/batches`} className={buttonVariants({ size: "small" })}>
            Enter gifts
          </Link>
          <Link href={`${base}/constituents/new`} className={buttonVariants({ variant: "secondary", size: "small" })}>
            Add a donor
          </Link>
        </div>}
      </div>
      <p className="sr-only">You are {org.role === "owner" ? "the owner" : `a ${ROLE_LABEL[org.role].toLowerCase()}`}.</p>

      {org.isSample && (
        <p className="rounded-30 bg-background-new-weakest px-4 py-3 text-30 leading-5 text-text">
          <strong>This is the sample organization.</strong> Nothing here is real. Click around as much as you like.
        </p>
      )}

      {!org.isSample && canManage && unfinished.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Finish setting up</CardTitle>
            <CardDescription>
              {unfinished.length} {unfinished.length === 1 ? "step" : "steps"} left: {unfinished.map((st) => SETUP_COPY[st.key].title.toLowerCase()).join(", ")}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href={`${base}/setup`} className={buttonVariants({ size: "small" })}>
              Continue setup
            </Link>
          </CardContent>
        </Card>
      )}

      {snap && live && (
        // The customize button appears once there is a dashboard to arrange (after the first gift).
        <DashboardCustomizer orgId={orgId} view="staff" layout={org.dashboardLayouts.staff} canCustomize={canManage && live.recentGifts.length > 0}>
          <StaffDashboard base={base} data={snap.data} live={live} layout={org.dashboardLayouts.staff} />
        </DashboardCustomizer>
      )}

      {org.isSample && org.role === "owner" && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Done exploring?</CardTitle>
            <CardDescription>Remove the sample organization and its made-up data. Your own organization is not affected.</CardDescription>
          </CardHeader>
          <CardContent>
            <RemoveSampleButton orgId={orgId} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
