import { SectionTabs } from "@/components/orgs/section-tabs";

/** Fundraising, Giving pages: the pages donors give on, and the animals they can sponsor. */
export default async function GivingLayout({ params, children }: LayoutProps<"/app/orgs/[orgId]/fundraising">) {
  const base = `/app/orgs/${(await params).orgId}/fundraising`;
  return (
    <div className="flex flex-col gap-4">
      <SectionTabs
        label="Giving pages"
        tabs={[
          { href: `${base}/pages`, label: "Giving pages" },
          { href: `${base}/animals`, label: "Animals to sponsor" },
        ]}
      />
      {children}
    </div>
  );
}
