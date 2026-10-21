import { getOrg } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { SectionTabs } from "@/components/orgs/section-tabs";

/** Reports: the board dashboard first, then the lists and downloads. The tab is not also called
 * "Reports", so the area and the tab inside it never share a name. Board viewers see the dashboard only. */
export default async function ReportsLayout({ params, children }: LayoutProps<"/app/orgs/[orgId]">) {
  const { orgId } = await params;
  const base = `/app/orgs/${orgId}`;
  const session = await requireSession();
  const org = await withSession(session, (tx) => getOrg(tx, orgId));
  return (
    <div className="flex flex-col gap-4">
      {org?.role !== "board_viewer" && (
        <SectionTabs
          label="Reports"
          tabs={[
            { href: `${base}/dashboard`, label: "Board dashboard" },
            { href: `${base}/reports`, label: "Lists and downloads" },
          ]}
        />
      )}
      {children}
    </div>
  );
}
