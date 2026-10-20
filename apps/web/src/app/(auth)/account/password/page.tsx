import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SetPasswordForm } from "@/components/auth/set-password-form";
import { getSession, safeNextPath } from "@/lib/session";

export const metadata: Metadata = { title: "Set a password" };

export default async function SetPasswordPage({ searchParams }: PageProps<"/account/password">) {
  if (!(await getSession())) redirect("/sign-in?next=/account/password");
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome. Set a password.</CardTitle>
        <CardDescription>You are signed in from your invitation link. Choose a password for next time.</CardDescription>
      </CardHeader>
      <CardContent>
        <SetPasswordForm next={next} />
      </CardContent>
    </Card>
  );
}
