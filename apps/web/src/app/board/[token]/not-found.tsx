import type { Metadata } from "next";
import { Card, Heading } from "@/components/ui";

export const metadata: Metadata = { title: "Board link not active", robots: { index: false, follow: false } };

/**
 * Shown, with a 404 status, for a board link that was turned off or never existed. A board
 * member who clicks an old link in an email gets a plain answer instead of an error page.
 */
export default function BoardLinkOff() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-12">
      <Card className="p-5 sm:p-6">
        <Heading variant="heading20" as="h1">
          This board link is no longer active
        </Heading>
        <p className="text-40 leading-6">The organization that shared it has turned it off, or the link was copied incompletely.</p>
        <p className="mt-3 text-40 leading-6">Ask your executive director or board chair for a new link. Nothing is wrong on your end.</p>
      </Card>
    </main>
  );
}
