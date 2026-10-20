import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getOrg, listBatches, listConstituents } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { formatDate, formatMoney } from "@/lib/format";
import { buttonVariants, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { RemoveSampleButton } from "@/components/orgs/sample-org-buttons";
import { ROLE_LABEL } from "@/components/orgs/role-labels";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Overview: the few numbers and links a person wants when they open an organization. */
export default async function OrgPage({ params }: PageProps<"/app/orgs/[orgId]">) {
  const { orgId } = await params;
  const session = await requireSession();
  const data = await withSession(session, async (tx) => {
    const org = await getOrg(tx, orgId);
    if (!org) return null;
    const [{ total }, openBatches] = await Promise.all([listConstituents(tx, orgId, { limit: 1 }), listBatches(tx, orgId, { status: "open", limit: 5 })]);
    return { org, constituentCount: total, openBatches };
  });
  if (!data) notFound();
  const { org } = data;
  if (org.role === "board_viewer") redirect(`/app/orgs/${orgId}/dashboard`);
  const base = `/app/orgs/${orgId}`;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-30 leading-5 text-text-weak">You are {org.role === "owner" ? "the owner" : `a ${ROLE_LABEL[org.role].toLowerCase()}`}.</p>

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

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Constituents</CardTitle>
            <CardDescription>{data.constituentCount === 0 ? "No one yet." : `${data.constituentCount} people, households and organizations.`}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Link href={`${base}/constituents`} className={buttonVariants({ variant: "secondary", size: "small" })}>
                Open list
              </Link>
              <Link href={`${base}/constituents/new`} className={buttonVariants({ size: "small" })}>
                Add constituent
              </Link>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Open gift batches</CardTitle>
            <CardDescription>{data.openBatches.length === 0 ? "Nothing waiting to be posted." : `${data.openBatches.length} open.`}</CardDescription>
          </CardHeader>
          <CardContent>
            {data.openBatches.length > 0 && (
              <ul className="flex flex-col gap-1 text-30 leading-5">
                {data.openBatches.map((b) => (
                  <li key={b.id} className="flex justify-between gap-2">
                    <Link href={`${base}/batches/${b.id}`} className="text-text-link underline-offset-2 hover:underline">
                      {formatDate(b.batchDate)}
                      {b.description ? ` · ${b.description}` : ""}
                    </Link>
                    <span className="tabular-nums text-text-weak">
                      {b.giftCount} · {formatMoney(b.giftTotal)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div>
              <Link href={`${base}/batches`} className={buttonVariants({ variant: "secondary", size: "small" })}>
                All batches
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
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
