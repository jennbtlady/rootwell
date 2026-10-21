import { SectionTabs } from "@/components/orgs/section-tabs";

/** Gifts: enter them in batches, and look them up. */
export default async function GiftsLayout({ params, children }: LayoutProps<"/app/orgs/[orgId]">) {
  const base = `/app/orgs/${(await params).orgId}`;
  return (
    <div className="flex flex-col gap-4">
      <SectionTabs
        label="Gifts"
        tabs={[
          { href: `${base}/batches`, label: "Batches" },
          { href: `${base}/gifts`, label: "All gifts" },
        ]}
      />
      {children}
    </div>
  );
}
