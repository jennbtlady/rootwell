import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignInForm } from "@/components/auth/sign-in-form";
import { safeNextPath } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  const initialError = params.error === "link" ? "That link has expired or was already used. Sign in again to get a new one." : undefined;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Use your password, or get a one-time link by email.</CardDescription>
      </CardHeader>
      <CardContent>
        <SignInForm next={next} initialError={initialError} />
      </CardContent>
    </Card>
  );
}
