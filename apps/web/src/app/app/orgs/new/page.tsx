import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { NewOrgForm } from "@/components/orgs/new-org-form";

export const metadata: Metadata = { title: "New organization" };

export default function NewOrgPage() {
  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>New organization</CardTitle>
        <CardDescription>You can change any of this later in settings.</CardDescription>
      </CardHeader>
      <CardContent>
        <NewOrgForm />
      </CardContent>
    </Card>
  );
}
