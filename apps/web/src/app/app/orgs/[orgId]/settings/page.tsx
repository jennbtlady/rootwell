import { redirect } from "next/navigation";

export default async function SettingsIndex({ params }: PageProps<"/app/orgs/[orgId]/settings">) {
  const { orgId } = await params;
  redirect(`/app/orgs/${orgId}/settings/coding`);
}
