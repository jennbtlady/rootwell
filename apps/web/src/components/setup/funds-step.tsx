"use client";

import { useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/api";
import { Alert, AlertDescription, Button, Checkbox, FormField, Heading, Input } from "@/components/ui";
import { Intro, SkipButton, type WizardData, type WizardNav } from "./setup-wizard";

const STARTERS = [
  { name: "General operating", help: "For anything. Most gifts go here." },
  { name: "Programs", help: "Gifts meant for your services." },
  { name: "Building", help: "Gifts for a building, repairs, or equipment." },
  { name: "Scholarships", help: "Gifts set aside for scholarships." },
];

/**
 * Funds, then an optional current campaign. One idea at a time: a fund is the pot the money
 * goes into; a campaign is the effort that brought it in.
 */
export function FundsStep({ data, nav }: { data: WizardData; nav: WizardNav }) {
  const existing = new Set(data.funds.map((f) => f.name.toLowerCase()));
  const [picked, setPicked] = useState<string[]>(data.funds.length ? [] : ["General operating"]);
  const [other, setOther] = useState("");
  const [campaign, setCampaign] = useState("");
  const [goal, setGoal] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const orgId = data.org.id;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const names = [...picked, ...other.split(",").map((s) => s.trim()).filter(Boolean)].filter((n) => !existing.has(n.toLowerCase()));
    for (const name of names) {
      const res = await api().api.v1.orgs[":orgId"].coding[":kind"].$post({ param: { orgId, kind: "funds" }, json: { name, active: true } });
      if (!res.ok) {
        setPending(false);
        return setError(await errorMessage(res, `Could not add "${name}". Is the name already used?`));
      }
    }
    if (campaign.trim()) {
      const res = await api().api.v1.orgs[":orgId"].coding[":kind"].$post({
        param: { orgId, kind: "campaigns" },
        json: { name: campaign.trim(), active: true, goalAmount: goal.replace(/[$,\s]/g, "") || null, endsOn: endsOn || null },
      });
      if (!res.ok) {
        setPending(false);
        return setError(await errorMessage(res, "Could not add the campaign. Check the goal amount."));
      }
    }
    setPending(false);
    nav.next();
  }

  const nothingYet = data.funds.length === 0 && picked.length === 0 && !other.trim();

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <section className="flex flex-col gap-3">
        <Intro>A fund is the pot of money a gift goes into. Most small organizations need one or two. You can add more any time.</Intro>
        {data.funds.length > 0 && (
          <p className="text-30 leading-5">
            You already have: <strong>{data.funds.map((f) => f.name).join(", ")}</strong>.
          </p>
        )}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-30 font-semibold">{data.funds.length ? "Add more funds" : "Pick your funds"}</legend>
          {STARTERS.filter((s) => !existing.has(s.name.toLowerCase())).map((s) => (
            <Checkbox key={s.name} label={s.name} help={s.help} checked={picked.includes(s.name)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, s.name] : p.filter((x) => x !== s.name)))} />
          ))}
        </fieldset>
        <FormField id="fund-other" label="Other funds" optional help="Your own names, separated by commas. For example: Food pantry, Summer camp.">
          {(f) => <Input {...f} value={other} onChange={(e) => setOther(e.target.value)} />}
        </FormField>
      </section>

      <section className="flex flex-col gap-3 border-t border-border-weaker pt-5">
        <Heading variant="heading40" as="h2" noMargin>
          Is a fundraising push going on right now?
        </Heading>
        <p className="max-w-2xl text-30 leading-5 text-text-weak">
          Optional. A campaign is the effort that brought a gift in, like a spring appeal or a gala. Name it here and new gifts will be marked with it until you change it. Add a goal to see progress on your dashboard.
        </p>
        <div className="grid gap-3 sm:grid-cols-[1fr_10rem_11rem]">
          <FormField id="camp-name" label="Campaign name" optional>
            {(f) => <Input {...f} placeholder="Spring appeal" value={campaign} onChange={(e) => setCampaign(e.target.value)} />}
          </FormField>
          <FormField id="camp-goal" label="Goal" optional>
            {(f) => <Input {...f} inputMode="decimal" insertBefore="$" value={goal} onChange={(e) => setGoal(e.target.value)} disabled={!campaign.trim()} />}
          </FormField>
          <FormField id="camp-end" label="Ends" optional>
            {(f) => <Input {...f} type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} disabled={!campaign.trim()} />}
          </FormField>
        </div>
      </section>

      {error && (
        <Alert variant="error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" loading={pending} disabled={nothingYet}>
          Save and continue
        </Button>
        <SkipButton onClick={nav.skip} />
      </div>
    </form>
  );
}
