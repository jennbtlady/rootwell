import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { buttonVariants, Heading, Paragraph } from "@/components/ui";

export default async function Home() {
  if (await getSession()) redirect("/app");
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <Heading variant="heading10" noMargin>
        Maple Ledger
      </Heading>
      <Paragraph noMargin className="max-w-md text-balance text-text-weak">
        A simple donor database for small nonprofits.
      </Paragraph>
      <div className="flex gap-3">
        <Link href="/sign-in" className={buttonVariants()}>
          Sign in
        </Link>
        <Link href="/sign-up" className={buttonVariants({ variant: "secondary" })}>
          Create account
        </Link>
      </div>
    </main>
  );
}
