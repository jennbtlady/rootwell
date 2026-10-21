import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { Heading } from "@/components/ui";
import { anchorClass } from "@/components/ui/text";
import { ConstituentForm } from "@/components/constituents/constituent-form";

export const metadata: Metadata = { title: "Add a donor" };

/**
 * Add a donor. From the gift form, `batch` and `name` come along: the name typed in the
 * donor search fills the form, and saving goes back to the batch with this donor chosen.
 */
export default async function NewConstituentPage({ params, searchParams }: PageProps<"/app/orgs/[orgId]/constituents/new">) {
  const { orgId } = await params;
  const sp = await searchParams;
  const batch = typeof sp.batch === "string" && z.string().uuid().safeParse(sp.batch).success ? sp.batch : null;
  const name = typeof sp.name === "string" ? sp.name.slice(0, 200) : "";
  return (
    <div className="flex flex-col gap-4">
      <div>
        {batch && (
          <Link href={`/app/orgs/${orgId}/batches/${batch}`} className={`${anchorClass} text-30`}>
            Back to the batch
          </Link>
        )}
        <Heading variant="heading30" as="h1" noMargin className={batch ? "mt-1" : undefined}>
          Add a donor
        </Heading>
        {batch && <p className="mt-1 text-30 leading-5 text-text-weak">After saving, you go back to the batch with this donor filled in.</p>}
      </div>
      <ConstituentForm orgId={orgId} existing={null} prefillName={name} returnToBatch={batch} />
    </div>
  );
}
