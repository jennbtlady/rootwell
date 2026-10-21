import type { Metadata } from "next";
import Link from "next/link";
import { getBilling, getOrg, listMembers } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { formatDate } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Heading } from "@/components/ui";
import { ExportEverythingButton } from "@/components/settings/export-everything";

export const metadata: Metadata = { title: "Account and export" };

/** The continuity page: who owns the account, how to hand it over, how to get everything out. */
export default async function AccountPage({ params }: PageProps<"/app/orgs/[orgId]/settings/account">) {
  const { orgId } = await params;
  const session = await requireSession();
  const [org, members, billing] = await withSession(session, (tx) => Promise.all([getOrg(tx, orgId), listMembers(tx, orgId), getBilling(tx, orgId)]));
  if (!org) return null;
  const owner = members.find((m) => m.role === "owner");
  const admins = members.filter((m) => m.role === "admin" && m.status === "active");
  const base = `/app/orgs/${orgId}/settings`;
  const link = "text-text-link underline";
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Heading variant="heading30" as="h1" noMargin>
          Account and export
        </Heading>
        <p className="mt-1 max-w-2xl text-30 leading-5 text-text-weak">Your donor records belong to you. This page makes sure they outlive any one person or any one subscription.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Who owns this account</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-30 leading-5">
          <p>
            <strong>{owner?.fullName ?? owner?.email ?? "No owner on record"}</strong>
            {owner?.fullName && <span className="text-text-weak"> ({owner.email})</span>} is the owner. The owner manages billing and can hand the account to someone else.
          </p>
          <p>
            {admins.length === 0
              ? "There are no admins besides the owner. Add at least one, so someone else can step in if the owner is away."
              : `Admins who can also manage settings: ${admins.map((a) => a.fullName ?? a.email).join(", ")}.`}
          </p>
          <p>
            To hand the account over, go to <Link className={link} href={`${base}/team`}>Team</Link> and use Transfer ownership. The new owner must already be an active member. Do this before someone leaves.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Download everything</CardTitle>
          <CardDescription>Every donor, gift, note, and setting, as spreadsheets in one zip file. It works even if the subscription has ended. Keep a copy somewhere safe once a year.</CardDescription>
        </CardHeader>
        <CardContent>
          <ExportEverythingButton orgId={orgId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>If the subscription ends</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-30 leading-5">
          <p>Nothing is deleted. The account becomes read only for at least 90 days: everyone can still sign in, see everything, and download everything, but nothing can be added or changed.</p>
          <p>Restart the subscription at any time under <Link className={link} href={`${base}/billing`}>Billing</Link> and pick up where you left off.</p>
          {billing && !billing.isSample && (
            <p className="text-text-weak">
              Right now: {billing.writable ? "everything works." : `read only${billing.readOnlyUntil ? `, at least until ${formatDate(billing.readOnlyUntil)}` : ""}.`}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
