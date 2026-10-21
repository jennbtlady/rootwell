import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { buttonVariants, Heading, Paragraph } from "@/components/ui";
import { anchorClass } from "@/components/ui/text";

const POINTS = [
  { title: "Set up in about 30 minutes", text: "A short guide walks you through your funds, your donors and your thank-you letter. Bring a spreadsheet if you have one." },
  { title: "Thank every donor on time", text: "Each gift waits in a thank-you list until it is thanked. Letters and year-end statements fill in your EIN and address." },
  { title: "Show your board how it is going", text: "A plain dashboard and a read-only link, so the board sees progress without a login." },
];

/**
 * The first page a new visitor sees. It says what this is, who it is for, and what it costs
 * to try, then leads with starting, not signing in (persona walkthroughs).
 */
export default async function Home() {
  if (await getSession()) redirect("/app");
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-4 py-16">
      <div className="flex flex-col items-center gap-5 text-center">
        <Heading variant="heading10" as="h1" noMargin>
          Maple Ledger
        </Heading>
        <Paragraph noMargin className="max-w-xl text-balance text-50 leading-8">
          A simple donor database for nonprofits with one to five staff. Record gifts, thank donors, and keep your board informed.
        </Paragraph>
        <div className="flex flex-col items-center gap-2">
          <Link href="/sign-up" className={buttonVariants({ size: "default" })}>
            Start your free 30-day trial
          </Link>
          <p className="text-30 text-text-weak">No card needed to start.</p>
        </div>
        <p className="text-30">
          Already have an account?{" "}
          <Link href="/sign-in" className={anchorClass}>
            Sign in
          </Link>
        </p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-3">
        {POINTS.map((p) => (
          <li key={p.title} className="rounded-30 border border-border-weaker bg-background-weakest p-4">
            <h2 className="text-40 font-semibold leading-6">{p.title}</h2>
            <p className="mt-1 text-30 leading-5 text-text-weak">{p.text}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
