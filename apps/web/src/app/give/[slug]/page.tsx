import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { withPublic } from "@maple/db";
import { getDb } from "@maple/api";
import { stripeGateway } from "@maple/api/integrations";
import { publicDonationPage } from "@maple/core/services";
import { Alert, AlertDescription, AlertTitle, Heading } from "@/components/ui";
import { GiveForm } from "@/components/give/give-form";

const SLUG = /^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])$/;

async function load(slug: string) {
  if (!SLUG.test(slug)) return null;
  return withPublic(getDb(), (tx) => publicDonationPage(tx, slug));
}

export async function generateMetadata({ params }: PageProps<"/give/[slug]">): Promise<Metadata> {
  const page = await load((await params).slug);
  return page ? { title: `${page.title}: ${page.orgName}` } : { title: "Giving page not found" };
}

/** The public giving page. No sign-in. Knows only what app.public_donation_page returns. */
export default async function GivePage({ params }: PageProps<"/give/[slug]">) {
  const { slug } = await params;
  const page = await load(slug);
  if (!page) notFound();
  const simulated = stripeGateway().mode === "simulated";
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-8">
      <div>
        <p className="text-30 font-semibold text-text-weak">{page.orgName}</p>
        <Heading variant="heading20" as="h1" noMargin>
          {page.title}
        </Heading>
      </div>
      {page.intro && <p className="whitespace-pre-line text-40 leading-7">{page.intro}</p>}
      {simulated && page.stripeAccount && (
        <Alert variant="warning">
          <AlertTitle>Test mode</AlertTitle>
          <AlertDescription>This page is for trying things out. No real card is charged.</AlertDescription>
        </Alert>
      )}
      {page.stripeAccount ? (
        <GiveForm slug={slug} amounts={page.amounts} funds={page.funds} allowMonthly={page.allowMonthly} offerCoverFees={page.offerCoverFees} />
      ) : (
        <Alert>
          <AlertTitle>Not taking gifts online yet</AlertTitle>
          <AlertDescription>Please contact {page.orgName} to give.</AlertDescription>
        </Alert>
      )}
      <p className="text-20 text-text-weak">Payments are handled by Stripe. {page.orgName} does not see or store your card number.</p>
    </main>
  );
}
