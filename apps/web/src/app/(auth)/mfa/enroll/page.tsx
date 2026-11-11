import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { MfaEnrollForm } from "@/components/auth/mfa-enroll-form";
import { safeNextPath } from "@/lib/session";

export const metadata: Metadata = { title: "Set up two-step sign-in" };

export default async function MfaEnrollPage({ searchParams }: PageProps<"/mfa/enroll">) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Set up two-step sign-in</CardTitle>
        <CardDescription>
          A second step protects donor data: a code from an app on your phone. Owners and admins need it to use Rootwell, and everyone needs it to download donor lists. This takes about two minutes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <MfaEnrollForm next={next} />
      </CardContent>
    </Card>
  );
}
