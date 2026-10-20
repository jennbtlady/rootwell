import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
          Owners and admins protect donor data with a second step: a code from an app on your phone. This takes about two minutes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <MfaEnrollForm next={next} />
      </CardContent>
    </Card>
  );
}
