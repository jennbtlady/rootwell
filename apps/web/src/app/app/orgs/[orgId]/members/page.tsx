import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getOrg, listMembers } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { MembersManager } from "@/components/orgs/members-manager";

export const metadata: Metadata = { title: "Team" };

export default async function MembersPage({ params }: PageProps<"/app/orgs/[orgId]/members">) {
  const { orgId } = await params;
  if (!z.string().uuid().safeParse(orgId).success) notFound();

  const session = await requireSession();
  const data = await withSession(session, async (tx) => {
    const org = await getOrg(tx, orgId);
    if (!org) return null;
    return { org, members: await listMembers(tx, orgId) };
  });
  if (!data) notFound();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/app/orgs/${orgId}`} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          {data.org.name}
        </Link>
        <h1 className="text-xl font-semibold">Team</h1>
      </div>
      <MembersManager orgId={orgId} myUserId={session.userId} myRole={data.org.role} members={data.members} />
    </div>
  );
}
