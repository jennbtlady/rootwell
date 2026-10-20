import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MfaVerifyForm } from "@/components/auth/mfa-verify-form";
import { safeNextPath } from "@/lib/session";

export const metadata: Metadata = { title: "Two-step sign-in" };

export default async function MfaVerifyPage({ searchParams }: PageProps<"/mfa/verify">) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>One more step</CardTitle>
        <CardDescription>Enter the code from your authenticator app.</CardDescription>
      </CardHeader>
      <CardContent>
        <MfaVerifyForm next={next} />
      </CardContent>
    </Card>
  );
}
