"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { renderTemplate, substantiation } from "@maple/core";
import { api, errorMessage } from "@/lib/api";
import { Alert, AlertDescription, Button, FormField, Input } from "@/components/ui";
import { Intro, SkipButton, type WizardData, type WizardNav } from "./setup-wizard";

/**
 * Shows the thank-you letter filled in with the organization's own details and a made-up gift,
 * and asks who signs it. Saving it is the decision that ticks this step.
 */
export function ThanksStep({ data, nav }: { data: WizardData; nav: WizardNav }) {
  const letter = data.letter;
  const [signer, setSigner] = useState("");
  const [title, setTitle] = useState("Executive Director");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const a = data.org.address;
  const address = [a.line1, a.line2, [a.city, a.state].filter(Boolean).join(", ") + (a.postalCode ? ` ${a.postalCode}` : "")].filter((x) => x && x.trim()).join("\n");
  const fund = data.funds[0]?.name ?? "General operating";
  const signature = `With thanks,\n\n\n\n${signer.trim() || "(your name)"}\n${title.trim()}`;

  const preview = useMemo(() => {
    if (!letter) return "";
    const ctx = {
      salutation: "Jordan",
      donor_name: "Jordan Rivera",
      first_name: "Jordan",
      gift_amount: "$100.00",
      gift_date: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
      fund,
      campaign: data.campaigns[0]?.name ?? "",
      deductible_amount: "$100.00",
      substantiation: substantiation({ amount: "100", deductibleAmount: null, giftType: "one_time", giftDate: "", notes: null }, data.org.name),
      org_name: data.org.name,
      org_ein: data.org.ein ?? "(your EIN)",
      org_address: address,
      today: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    };
    return renderTemplate(`${letter.body}\n\n${signature}`, ctx);
  }, [letter, signature, fund, data.org, data.campaigns, address]);

  async function save() {
    if (!letter) return nav.next();
    setPending(true);
    setError(null);
    const res = await api().api.v1.orgs[":orgId"]["ack-templates"].$put({
      param: { orgId: data.org.id },
      json: { id: letter.id, name: letter.name, channel: "letter", subject: letter.subject, body: letter.body, signature },
    });
    setPending(false);
    if (!res.ok) return setError(await errorMessage(res));
    nav.next();
  }

  return (
    <div className="flex flex-col gap-5">
      <Intro>Thanking donors within two days is the best way to get a second gift. Here is the letter you will send, with a made-up gift. It already includes the wording the IRS requires.</Intro>
      {!data.org.ein && (
        <Alert variant="warning">
          <AlertDescription>Your EIN is missing, so the letter shows &quot;(your EIN)&quot;. Add it in the first step if you have one.</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
        <div className="whitespace-pre-line rounded-30 border border-border-weak bg-background-body p-5 font-serif text-40 leading-7 text-text shadow-elevation-10" aria-label="Letter preview">
          {address && <p className="mb-4 text-30 leading-5 text-text-weak">{`${data.org.name}\n${address}`}</p>}
          {preview}
        </div>
        <div className="flex flex-col gap-3">
          <FormField id="sign-name" label="Who signs the letters?">
            {(f) => <Input {...f} autoComplete="name" value={signer} onChange={(e) => setSigner(e.target.value)} />}
          </FormField>
          <FormField id="sign-title" label="Their title">
            {(f) => <Input {...f} value={title} onChange={(e) => setTitle(e.target.value)} />}
          </FormField>
          <p className="text-20 leading-4 text-text-weak">
            Want different words?{" "}
            <Link className="text-text-link underline" href={`/app/orgs/${data.org.id}/acknowledgments/templates`}>
              Change the wording
            </Link>
            . Have your accountant read it once before tax season.
          </p>
        </div>
      </div>
      {error && (
        <Alert variant="error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button loading={pending} onClick={save} disabled={!signer.trim()}>
          Looks good, use this letter
        </Button>
        <SkipButton onClick={nav.skip} />
      </div>
    </div>
  );
}
