import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getConstituent, listAuditForRow, listBatches, listGiftsForConstituent, listInteractions, listTags } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { formatDate, formatMoney } from "@/lib/format";
import { Badge, buttonVariants, Card, Heading } from "@/components/ui";
import { ConstituentTabs } from "@/components/constituents/constituent-tabs";

export default async function ConstituentPage({ params }: PageProps<"/app/orgs/[orgId]/constituents/[constituentId]">) {
  const { orgId, constituentId } = await params;
  if (!z.string().uuid().safeParse(constituentId).success) notFound();
  const session = await requireSession();
  const data = await withSession(session, async (tx) => {
    const c = await getConstituent(tx, orgId, constituentId);
    if (!c) return null;
    const [gifts, interactions, audit, tags, openBatches] = await Promise.all([
      listGiftsForConstituent(tx, orgId, c.id),
      listInteractions(tx, orgId, c.id),
      listAuditForRow(tx, orgId, "constituents", c.id),
      listTags(tx, orgId),
      listBatches(tx, orgId, { status: "open", limit: 1 }),
    ]);
    return { c, gifts, interactions, audit, tags, openBatch: openBatches[0] ?? null };
  });
  if (!data) notFound();
  const { c } = data;
  const base = `/app/orgs/${orgId}`;
  const primaryAddress = c.addresses[0];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Heading variant="heading30" as="h1" noMargin>
              {c.displayName}
            </Heading>
            {c.type !== "person" && <Badge variant="decorative10">{c.type === "household" ? "Household" : "Organization"}</Badge>}
            {c.deceased && <Badge>Deceased</Badge>}
            {c.doNotContact && <Badge variant="warning">Do not contact</Badge>}
            {c.tags.map((t) => (
              <Badge key={t.id} variant="neutral">
                {t.name}
              </Badge>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-30 leading-5 text-text-weak">
            {c.primaryEmail && (
              <a href={`mailto:${c.primaryEmail}`} className="hover:text-text-link hover:underline">
                {c.primaryEmail}
              </a>
            )}
            {c.primaryPhone && (
              <a href={`tel:${c.primaryPhone}`} className="hover:text-text-link hover:underline">
                {c.primaryPhone}
              </a>
            )}
            {primaryAddress && <span>{[primaryAddress.line1, primaryAddress.city, primaryAddress.state, primaryAddress.postalCode].filter(Boolean).join(", ")}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          {data.openBatch && (
            <Link href={`${base}/batches/${data.openBatch.id}?constituent=${c.id}`} className={buttonVariants({ size: "small" })}>
              Add gift
            </Link>
          )}
          <Link href={`${base}/constituents/${c.id}/edit`} className={buttonVariants({ variant: "secondary", size: "small" })}>
            Edit
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Lifetime", formatMoney(c.lifetimeTotal), `${c.giftCount} gift${c.giftCount === 1 ? "" : "s"}`],
          ["This fiscal year", formatMoney(c.thisYearTotal), ""],
          ["Last fiscal year", formatMoney(c.lastYearTotal), ""],
          ["Last gift", c.lastGiftOn ? formatDate(c.lastGiftOn) : "None yet", c.firstGiftOn ? `First ${formatDate(c.firstGiftOn)}` : ""],
        ].map(([label, value, sub]) => (
          <Card key={label} className="p-4 sm:p-4">
            <div className="text-20 font-semibold uppercase tracking-wide text-text-weak">{label}</div>
            <div className="mt-1 text-50 font-semibold tabular-nums">{value}</div>
            {sub && <div className="text-20 text-text-weak">{sub}</div>}
          </Card>
        ))}
      </div>

      <ConstituentTabs orgId={orgId} constituent={c} gifts={data.gifts} interactions={data.interactions} audit={data.audit} allTags={data.tags} userId={session.userId} />
    </div>
  );
}
