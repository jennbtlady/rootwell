import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getOrg, getStandards, listCoding, listMembers, listTemplates, setupProgress } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { SetupWizard } from "@/components/setup/setup-wizard";
import { WIZARD_STEPS, type WizardKey } from "@/lib/wizard-steps";

export const metadata: Metadata = { title: "Get set up" };

/**
 * The guided setup. Owners and admins do it; others are sent to Home. Opens at the step in
 * ?step=, or at the first step not yet done.
 */
export default async function SetupPage({ params, searchParams }: PageProps<"/app/orgs/[orgId]/setup">) {
  const { orgId } = await params;
  const sp = await searchParams;
  const session = await requireSession();
  const data = await withSession(session, async (tx) => {
    const org = await getOrg(tx, orgId);
    if (!org) return null;
    if (org.role !== "owner" && org.role !== "admin") return { org, denied: true as const };
    const [steps, funds, campaigns, standards, members, templates] = await Promise.all([
      setupProgress(tx, orgId),
      listCoding(tx, "funds", orgId),
      listCoding(tx, "campaigns", orgId),
      getStandards(tx, orgId),
      listMembers(tx, orgId),
      listTemplates(tx, orgId),
    ]);
    return { org, denied: false as const, steps: steps ?? [], funds, campaigns, standards, members, letter: templates.find((t) => t.channel === "letter") ?? null };
  });
  if (!data) notFound();
  if (data.denied) redirect(`/app/orgs/${orgId}`);
  if (!data.standards) notFound();

  const asked = typeof sp.step === "string" ? sp.step : undefined;
  const firstOpen = WIZARD_STEPS.find((s) => s.key !== "done" && !data.steps.find((x) => x.key === s.key)?.done)?.key ?? "done";
  const current = (WIZARD_STEPS.some((s) => s.key === asked) ? asked : firstOpen) as WizardKey;

  return (
    <SetupWizard
      current={current}
      data={{ org: data.org, steps: data.steps, funds: data.funds, campaigns: data.campaigns, standards: data.standards, members: data.members, letter: data.letter, myUserId: session.userId }}
    />
  );
}
