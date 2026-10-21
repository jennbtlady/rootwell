"use client";

import Link from "next/link";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { Alert, AlertDescription, Button, Checkbox, FormField, Select } from "@/components/ui";
import { Intro, SkipButton, type WizardData, type WizardNav } from "./setup-wizard";

/**
 * The recommended gift rules, in plain words, accepted with one button. The full rules page
 * (Settings, Gift entry rules) is there for anyone who wants more.
 */
export function RulesStep({ data, nav }: { data: WizardData; nav: WizardNav }) {
  const s = data.standards;
  const [useBatches, setUseBatches] = useState(s.useBatches);
  const [defaultFundId, setDefaultFundId] = useState(s.defaultFundId ?? data.funds[0]?.id ?? "");
  const [defaultCampaignId, setDefaultCampaignId] = useState(s.defaultCampaignId ?? data.campaigns.find((c) => c.active)?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    setError(null);
    const res = await api().api.v1.orgs[":orgId"]["gift-standards"].$put({
      param: { orgId: data.org.id },
      json: { ...s, useBatches, defaultFundId: defaultFundId || null, defaultCampaignId: defaultCampaignId || null },
    });
    setPending(false);
    if (!res.ok) return setError(await errorMessage(res));
    nav.next();
  }

  return (
    <div className="flex flex-col gap-5">
      <Intro>These are the rules we recommend for a small office. They keep your records complete without slowing you down.</Intro>
      <ul className="flex max-w-2xl list-disc flex-col gap-2 pl-5 text-40 leading-6">
        <li>Every gift needs who gave it, how much, the date, the fund, and how they paid. For checks, the check number too.</li>
        <li>
          Gifts are grouped by bank deposit. When the gifts add up to the deposit slip, you make the group final. A final gift cannot be changed by accident, so your records always match the bank.
        </li>
      </ul>
      <Checkbox
        label="Group gifts by bank deposit (recommended)"
        help="Turn off only if you record gifts one at a time and never match them to deposits."
        checked={useBatches}
        onChange={(e) => setUseBatches(e.target.checked)}
      />
      <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
        <FormField id="rule-fund" label="Fund filled in on new gifts" help="Staff can change it on each gift.">
          {(f) => (
            <Select {...f} value={defaultFundId} onChange={(e) => setDefaultFundId(e.target.value)}>
              <option value="">None</option>
              {data.funds.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField id="rule-campaign" label="Campaign filled in on new gifts" help="The fundraising push going on now, if any.">
          {(f) => (
            <Select {...f} value={defaultCampaignId} onChange={(e) => setDefaultCampaignId(e.target.value)} disabled={data.campaigns.length === 0}>
              <option value="">None</option>
              {data.campaigns.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>
      </div>
      {data.funds.length === 0 && (
        <Alert variant="warning">
          <AlertDescription>You have no funds yet. Go back one step to add one, or the gift form will have nothing to choose.</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button loading={pending} onClick={save}>
          Use these rules
        </Button>
        <SkipButton onClick={nav.skip} />
      </div>
      <p className="text-20 text-text-weak">
        Want more control, like requiring a campaign on every gift or adding your own notes under each field?{" "}
        <Link className="text-text-link underline" href={`/app/orgs/${data.org.id}/settings/gift-standards`}>
          See all gift rules
        </Link>
        .
      </p>
    </div>
  );
}
