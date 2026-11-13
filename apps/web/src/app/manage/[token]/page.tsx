import type { Metadata } from "next";
import { systemClaims, withRls } from "@maple/db";
import { getDb } from "@maple/api";
import { verifyManageLink } from "@maple/api/integrations";
import { monthlyGiftForManage } from "@maple/core/services";
import { Alert, AlertDescription, AlertTitle, Heading } from "@/components/ui";
import { PublicShell } from "@/components/give/public-shell";
import { ManageButton } from "@/components/give/manage-button";

export const metadata: Metadata = { title: "Your monthly gift", robots: { index: false, follow: false } };

const usd = (s: string) => Number(s).toLocaleString("en-US", { style: "currency", currency: "USD" });

/**
 * A monthly donor's private page, from the link in their receipt (fundraising Phase 2). No
 * account: the link is signed. Opening it changes nothing; the button takes the donor to
 * Stripe's own page to change their card or stop the gift.
 */
export default async function ManagePage({ params }: PageProps<"/manage/[token]">) {
  const { token } = await params;
  const link = token.length <= 400 ? verifyManageLink(token) : null;
  const gift = link ? await withRls(getDb(), systemClaims(link.orgId), (tx) => monthlyGiftForManage(tx, link.orgId, link.subscriptionId)) : null;

  if (!gift) {
    return (
      <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-10">
        <Heading variant="heading20" as="h1" noMargin>
          This link does not work
        </Heading>
        <p className="text-40 leading-7">It may have expired. Use the link in your most recent receipt email, or contact the organization you give to.</p>
      </main>
    );
  }

  return (
    <main>
      <PublicShell orgName={gift.orgName} branding={gift.branding} logoPath={gift.logoPath}>
        <Heading variant="heading20" as="h1" noMargin>
          Your monthly gift
        </Heading>
        <p className="text-40 leading-7">
          {usd(gift.amount)} a month to {gift.orgName}
          {gift.designation ? `, for ${gift.designation.replace(/^Sponsoring /, "sponsoring ")}` : ""}.
        </p>
        {gift.status === "ended" ? (
          <Alert>
            <AlertTitle>This monthly gift has stopped</AlertTitle>
            <AlertDescription>You will not be charged again. Thank you for your support.</AlertDescription>
          </Alert>
        ) : (
          <>
            <p className="text-40 leading-7">You can change the card it uses, or stop it. Both happen on Stripe&rsquo;s secure page.</p>
            <ManageButton token={token} />
          </>
        )}
      </PublicShell>
    </main>
  );
}
