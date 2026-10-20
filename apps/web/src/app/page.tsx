import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { buttonVariants } from "@/components/ui/button";

export default async function Home() {
  if (await getSession()) redirect("/app");
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Maple Ledger</h1>
      <p className="max-w-md text-balance text-muted-foreground">A simple donor database for small nonprofits.</p>
      <div className="flex gap-3">
        <Link href="/sign-in" className={buttonVariants()}>
          Sign in
        </Link>
        <Link href="/sign-up" className={buttonVariants({ variant: "outline" })}>
          Create account
        </Link>
      </div>
    </main>
  );
}
