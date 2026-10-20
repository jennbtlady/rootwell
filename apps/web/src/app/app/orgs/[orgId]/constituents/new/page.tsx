import type { Metadata } from "next";
import { Heading } from "@/components/ui";
import { ConstituentForm } from "@/components/constituents/constituent-form";

export const metadata: Metadata = { title: "Add constituent" };

export default async function NewConstituentPage({ params }: PageProps<"/app/orgs/[orgId]/constituents/new">) {
  const { orgId } = await params;
  return (
    <div className="flex flex-col gap-4">
      <Heading variant="heading30" as="h1" noMargin>
        Add constituent
      </Heading>
      <ConstituentForm orgId={orgId} existing={null} />
    </div>
  );
}
