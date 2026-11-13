import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { withPublic } from "@maple/db";
import { getDb } from "@maple/api";
import { publicDonationPage } from "@maple/core/services";
import { Heading } from "@/components/ui";
import { PublicShell } from "@/components/give/public-shell";

export const metadata: Metadata = { title: "Thank you", robots: { index: false, follow: false } };

export default async function ThanksPage({ params }: PageProps<"/give/[slug]/thanks">) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{3,50}$/.test(slug)) notFound();
  const page = await withPublic(getDb(), (tx) => publicDonationPage(tx, slug));
  if (!page) notFound();
  return (
    <main>
      <PublicShell orgName={page.orgName} branding={page.branding} logoPath={page.logoPath}>
        <Heading variant="heading20" as="h1" noMargin>
          Thank you
        </Heading>
        <p className="whitespace-pre-line text-40 leading-7">
          {page.thankYou ??
            `Your gift to ${page.orgName} was received. Stripe will email you a receipt.`}
        </p>
        <p>
          <Link className="text-text-link underline" href={`/give/${slug}`}>
            Back to the giving page
          </Link>
        </p>
      </PublicShell>
    </main>
  );
}
