import Link from "next/link";
import { listMyOrgs } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  staff: "Staff",
  board_viewer: "Board viewer",
};

export default async function AppHome() {
  const session = await requireSession();
  const orgs = await withSession(session, (tx) => listMyOrgs(tx));

  if (orgs.length === 0) {
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader>
          <CardTitle>Set up your organization</CardTitle>
          <CardDescription>You will be its owner. You can invite your team right after.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/app/orgs/new" className={buttonVariants()}>
            Create organization
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Your organizations</h1>
        <Link href="/app/orgs/new" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Add another
        </Link>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {orgs.map((o) => (
          <li key={o.id}>
            <Link href={`/app/orgs/${o.id}`} aria-label={`${o.name}, ${ROLE_LABEL[o.role] ?? o.role}`} className="block rounded-lg border p-4 hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <div className="font-medium">{o.name}</div>
              <div className="text-sm text-muted-foreground">{ROLE_LABEL[o.role] ?? o.role}</div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
