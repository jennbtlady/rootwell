import { SectionTabs } from "@/components/orgs/section-tabs";

/** Donors: find and add people, and keep the records clean. */
export default async function DonorsLayout({ params, children }: LayoutProps<"/app/orgs/[orgId]">) {
  const base = `/app/orgs/${(await params).orgId}`;
  return (
    <div className="flex flex-col gap-4">
      <SectionTabs
        label="Donors"
        tabs={[
          { href: `${base}/constituents`, label: "All donors", match: [`${base}/imports`] },
          { href: `${base}/duplicates`, label: "Possible duplicates", match: [`${base}/merges`] },
          { href: `${base}/health`, label: "Clean up" },
        ]}
      />
      {children}
    </div>
  );
}
