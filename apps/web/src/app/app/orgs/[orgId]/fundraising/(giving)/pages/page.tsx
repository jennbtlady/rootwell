import type { Metadata } from "next";
import Link from "next/link";
import { getIntegration, getOrg, listDonationPages } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { Alert, AlertDescription, AlertTitle, Badge, EmptyState, Heading, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Giving pages" };

export default async function GivingPagesPage({ params }: PageProps<"/app/orgs/[orgId]/fundraising/pages">) {
  const { orgId } = await params;
  const session = await requireSession();
  const [pages, stripe, org] = await withSession(session, (tx) => Promise.all([listDonationPages(tx, orgId), getIntegration(tx, orgId, "stripe"), getOrg(tx, orgId)]));
  const canEdit = org?.role === "owner" || org?.role === "admin";
  const base = `/app/orgs/${orgId}/fundraising/pages`;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Heading variant="heading30" as="h1" noMargin>
            Giving pages
          </Heading>
          <p className="mt-1 max-w-2xl text-30 leading-5 text-text-weak">A page on the web where people give to you by card. Share its link in emails, on social media, or on your website.</p>
        </div>
        {canEdit && (
          <Link href={`${base}/new`} className={buttonVariants({ variant: "primary" })}>
            New giving page
          </Link>
        )}
      </div>
      {stripe?.status !== "connected" && (
        <Alert variant="warning">
          <AlertTitle>{stripe?.status === "needs_info" ? "Finish your Stripe setup to take gifts" : "Connect Stripe to take gifts"}</AlertTitle>
          <AlertDescription>
            {stripe?.status === "needs_info"
              ? "Stripe is connected but still needs a few details, such as your bank account. Your pages show a notice instead of a Give button until Stripe is ready."
              : "Your pages show a notice instead of a Give button until Stripe is connected."}{" "}
            {canEdit ? (
              <Link className="underline" href={`/app/orgs/${orgId}/settings/integrations`}>
                Connect Stripe in Settings
              </Link>
            ) : (
              "An owner or admin can connect it in Settings."
            )}
          </AlertDescription>
        </Alert>
      )}
      {pages.length === 0 ? (
        <EmptyState title="No giving pages yet">Make one page for general gifts. You can add more for campaigns later.</EmptyState>
      ) : (
        <Table label="Giving pages">
          <THead>
            <TR>
              <TH>Title</TH>
              <TH>Link</TH>
              <TH>Status</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {pages.map((p) => (
              <TR key={p.id}>
                <TD className="font-medium">{p.title}</TD>
                <TD>
                  <a className="text-text-link underline" href={`/give/${p.slug}`} target="_blank" rel="noopener">
                    /give/{p.slug}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </TD>
                <TD>{p.active ? <Badge variant="success">On</Badge> : <Badge>Off</Badge>}</TD>
                <TD align="right">
                  {canEdit && (
                    <Link className="text-text-link underline" href={`${base}/${p.id}`}>
                      Edit<span className="sr-only"> {p.title}</span>
                    </Link>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
