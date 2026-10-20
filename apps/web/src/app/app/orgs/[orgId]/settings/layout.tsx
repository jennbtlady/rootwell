import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrg } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { SettingsNav } from "@/components/settings/settings-nav";

export default async function SettingsLayout({ params, children }: LayoutProps<"/app/orgs/[orgId]/settings">) {
  const { orgId } = await params;
  const session = await requireSession();
  const org = await withSession(session, (tx) => getOrg(tx, orgId));
  if (!org || (org.role !== "owner" && org.role !== "admin")) notFound();
  return (
    <div className="grid gap-6 sm:grid-cols-[12rem_1fr]">
      <SettingsNav orgId={orgId} />
      <div>{children}</div>
      <p className="sr-only">
        <Link href={`/app/orgs/${orgId}`}>Back to organization</Link>
      </p>
    </div>
  );
}
