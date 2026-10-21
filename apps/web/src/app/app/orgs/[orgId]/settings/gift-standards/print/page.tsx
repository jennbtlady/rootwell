import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GIFT_FIELDS, GIFT_FIELD_LABEL, requiredGiftFields } from "@maple/core";
import { getOrg, getStandards, listCoding } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { formatDate, today } from "@/lib/format";

export const metadata: Metadata = { title: "Gift entry rules" };

/** The org's SOP as a one-page document. Styled for paper: print it or save as PDF. */
export default async function PrintStandardsPage({ params }: PageProps<"/app/orgs/[orgId]/settings/gift-standards/print">) {
  const { orgId } = await params;
  const session = await requireSession();
  const data = await withSession(session, async (tx) => {
    const org = await getOrg(tx, orgId);
    if (!org) return null;
    const [standards, funds, campaigns, appeals] = await Promise.all([getStandards(tx, orgId), listCoding(tx, "funds", orgId), listCoding(tx, "campaigns", orgId), listCoding(tx, "appeals", orgId)]);
    return { org, standards, funds, campaigns, appeals };
  });
  if (!data || !data.standards) notFound();
  const { org, standards } = data;
  const required = requiredGiftFields(standards);
  const defaultFund = data.funds.find((f) => f.id === standards.defaultFundId);

  return (
    <article className="mx-auto max-w-2xl bg-background-body p-8 text-30 leading-6 text-text print:p-0">
      <header className="mb-6 border-b border-border-weaker pb-4">
        <h1 className="text-60 font-semibold tracking-[-0.02em]">Gift entry rules</h1>
        <p className="text-text-weak">
          {org.name} · as of {formatDate(today())}
        </p>
      </header>

      <section className="mb-6">
        <h2 className="mb-2 text-40 font-semibold">How a gift gets entered</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Open or start today&apos;s batch under Gifts. One batch per deposit.</li>
          <li>Enter the expected total from the deposit slip.</li>
          <li>For each gift, find the donor first. If no one matches, check the spelling, then add them.</li>
          <li>Fill every required field below. The form will not save without them.</li>
          <li>When the batch total matches the deposit, an admin posts it. Posted gifts cannot be changed.</li>
          <li>Every posted gift waits in the acknowledgment queue until it is thanked.</li>
        </ol>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-40 font-semibold">Fields</h2>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border-weak text-left text-text-weak">
              <th className="py-1 pr-3 font-semibold">Field</th>
              <th className="py-1 pr-3 font-semibold">Rule</th>
              <th className="py-1 font-semibold">Our instruction</th>
            </tr>
          </thead>
          <tbody>
            {GIFT_FIELDS.map((f) => (
              <tr key={f} className="border-b border-border-weaker align-top">
                <td className="py-1 pr-3 font-medium">{GIFT_FIELD_LABEL[f]}</td>
                <td className="py-1 pr-3 text-text-weak">
                  {required.has(f) ? "Required" : f === "checkNumber" && standards.checkNumberForChecks ? "Required for checks" : "Optional"}
                  {f === "fundId" && defaultFund ? ` · defaults to ${defaultFund.name}` : ""}
                </td>
                <td className="py-1">{standards.fieldInstructions[f] ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        {(
          [
            ["Funds", data.funds],
            ["Campaigns", data.campaigns],
            ["Appeals", data.appeals],
          ] as const
        ).map(([label, rows]) => (
          <div key={label}>
            <h2 className="mb-1 text-40 font-semibold">{label}</h2>
            {rows.length === 0 ? (
              <p className="text-text-weak">None set up.</p>
            ) : (
              <ul className="space-y-0.5">
                {rows.map((r) => (
                  <li key={r.id}>
                    {r.name}
                    {r.code ? <span className="text-text-weak"> ({r.code})</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </section>

      {standards.conventions && (
        <section className="mb-6">
          <h2 className="mb-2 text-40 font-semibold">Other conventions</h2>
          <p className="whitespace-pre-wrap">{standards.conventions}</p>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-40 font-semibold">Who can do what</h2>
        <ul className="space-y-0.5">
          <li>
            <strong>Staff</strong> enter donors, gifts and notes.
          </li>
          <li>
            <strong>Admins</strong> also post batches, manage the team and change these standards.
          </li>
          <li>
            <strong>The owner</strong> also exports everything and can transfer the account.
          </li>
          <li>
            <strong>Board viewers</strong> see the dashboard and reports only.
          </li>
        </ul>
      </section>
    </article>
  );
}
