"use client";

import { useRouter } from "next/navigation";
import type { OrgDetail } from "@maple/core/services";
import { useToast } from "@/components/ui";
import { ProfileForm } from "@/components/setup/profile-form";

export function OrgDetails({ org }: { org: OrgDetail }) {
  const router = useRouter();
  const toast = useToast();
  return (
    <ProfileForm
      org={org}
      submitLabel="Save"
      onSaved={() => {
        toast({ type: "success", title: "Saved" });
        router.refresh();
      }}
    />
  );
}
