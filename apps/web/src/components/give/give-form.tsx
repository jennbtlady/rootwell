"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { grossUpForFee } from "@maple/core";
import { Alert, AlertDescription, Button, Card, Checkbox, FormField, Input, Select, Textarea } from "@/components/ui";
import { brandingImageUrl } from "@/lib/brand";
import { cn } from "@/lib/cn";
import { useEarlyTyping } from "@/lib/early-typing";
import { BOT_CHECK_WAIT, useBotCheck } from "@/components/bot-check";
import { openCheckout } from "@/components/give/embed-bridge";

const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 ? 2 : 0 });

export type GiveAnimal = { id: string; name: string; description: string | null; photoPath: string | null };

export function GiveForm({
  slug,
  orgName,
  amounts,
  funds,
  allowMonthly,
  offerCoverFees,
  animals = [],
  allowTribute = false,
  allowMessage = false,
  embedded = false,
}: {
  slug: string;
  orgName: string;
  amounts: number[];
  funds: { id: string; name: string }[];
  allowMonthly: boolean;
  offerCoverFees: boolean;
  animals?: GiveAnimal[];
  allowTribute?: boolean;
  allowMessage?: boolean;
  embedded?: boolean;
}) {
  const [choice, setChoice] = useState<string>(String(amounts[1] ?? amounts[0] ?? ""));
  const [other, setOther] = useState("");
  const [monthly, setMonthly] = useState(false);
  const [fundId, setFundId] = useState(funds[0]?.id ?? "");
  const [cover, setCover] = useState(offerCoverFees);
  // Fundraising Phase 2: sponsor an animal, give in honor or memory of someone, leave a note.
  const [animalId, setAnimalId] = useState("");
  const [tributeOn, setTributeOn] = useState(false);
  const [tributeKind, setTributeKind] = useState<"honor" | "memory">("honor");
  const [honoree, setHonoree] = useState("");
  const [notifyName, setNotifyName] = useState("");
  const [notifyEmail, setNotifyEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // In an embed frame without the embed script, the donor opens checkout with a click.
  const [manualCheckout, setManualCheckout] = useState<string | null>(null);
  const name = useId();
  const form = useRef<HTMLFormElement>(null);
  const bot = useBotCheck();
  // An amount tapped before the page's scripts loaded is the amount given.
  useEarlyTyping(form, (field, value, checked) => {
    if (field === `${name}-freq`) setMonthly(value === "monthly");
    if (field === `${name}-amt`) setChoice(value);
    if (field === `${name}-other`) setOther(value);
    if (field === `${name}-fund`) setFundId(value);
    if (field === `${name}-cover`) setCover(checked);
  });

  const dollars = choice === "other" ? Number(other.replace(/[$,\s]/g, "")) : Number(choice);
  const valid = Number.isFinite(dollars) && dollars >= 1 && dollars <= 100000;
  const giftCents = valid ? Math.round(dollars * 100) : 0;
  const totalCents = valid && cover && offerCoverFees ? grossUpForFee(giftCents) : giftCents;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return setError("Enter an amount between $1 and $100,000.");
    if (tributeOn && !honoree.trim()) return setError("Type the name of the person or pet this gift honors, or uncheck the tribute box.");
    if (bot.required && !bot.token) return setError(BOT_CHECK_WAIT);
    setPending(true);
    setError(null);
    const res = await fetch(`/api/v1/public/give/${slug}/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        amount: dollars,
        monthly: allowMonthly && monthly,
        fundId: animalId ? null : fundId || null,
        coverFee: cover && offerCoverFees,
        animalId: animalId || null,
        tribute: allowTribute && tributeOn ? { kind: tributeKind, honoreeName: honoree, notifyName: notifyName || null, notifyEmail: notifyEmail || null } : null,
        message: allowMessage && message.trim() ? message.trim() : null,
        botCheck: bot.token ?? undefined,
      }),
    });
    if (!res.ok) {
      setPending(false);
      // A token works once. Get a fresh one for the next try.
      bot.reset();
      const body = (await res.json().catch(() => null)) as { error?: string; issues?: { message: string }[] } | null;
      return setError(body?.issues?.[0]?.message ?? body?.error ?? "Something went wrong. Please try again.");
    }
    const { url } = (await res.json()) as { url: string };
    if ((await openCheckout(url, embedded)) === "needs_click") {
      setPending(false);
      setManualCheckout(url);
    }
  }

  const pill = (checked: boolean) =>
    cn(
      "flex min-h-11 cursor-pointer items-center justify-center rounded-30 border px-3 text-40 font-semibold has-[:focus-visible]:shadow-focus",
      checked ? "border-border-primary bg-background-primary-weakest text-text-primary" : "border-border-weak bg-background-body text-text hover:border-border-primary",
    );

  return (
    <Card>
      <form ref={form} method="post" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {allowMonthly && (
          <fieldset>
            <legend className="mb-2 text-30 font-semibold">How often</legend>
            <div className="grid grid-cols-2 gap-2">
              {[
                { v: false, l: "One time" },
                { v: true, l: "Every month" },
              ].map((o) => (
                <label key={o.l} className={pill(monthly === o.v)}>
                  <input type="radio" className="sr-only" name={`${name}-freq`} value={o.v ? "monthly" : "once"} checked={monthly === o.v} onChange={() => setMonthly(o.v)} />
                  {o.l}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <fieldset>
          <legend className="mb-2 text-30 font-semibold">Amount</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {amounts.map((a) => (
              <label key={a} className={pill(choice === String(a))}>
                <input type="radio" className="sr-only" name={`${name}-amt`} value={a} checked={choice === String(a)} onChange={() => setChoice(String(a))} />
                {usd(a * 100)}
              </label>
            ))}
            <label className={pill(choice === "other")}>
              <input type="radio" className="sr-only" name={`${name}-amt`} value="other" checked={choice === "other"} onChange={() => setChoice("other")} />
              Other
            </label>
          </div>
        </fieldset>
        {choice === "other" && (
          <FormField id={`${name}-other`} label="Your amount" required>
            {(f) => <Input {...f} inputMode="decimal" insertBefore="$" autoFocus name={`${name}-other`} value={other} onChange={(e) => setOther(e.target.value)} />}
          </FormField>
        )}
        {animals.length > 0 && (
          <fieldset>
            <legend className="mb-2 text-30 font-semibold">Sponsor an animal (optional)</legend>
            <div className="flex flex-col gap-2">
              <label className={cn(pill(animalId === ""), "justify-start text-30")}>
                <input type="radio" className="sr-only" name={`${name}-animal`} value="" checked={animalId === ""} onChange={() => setAnimalId("")} />
                No, give where it is needed
              </label>
              {animals.map((a) => {
                const photo = brandingImageUrl(a.photoPath);
                return (
                  <label key={a.id} className={cn(pill(animalId === a.id), "justify-start gap-3 py-2 text-left")}>
                    <input type="radio" className="sr-only" name={`${name}-animal`} value={a.id} checked={animalId === a.id} onChange={() => setAnimalId(a.id)} />
                    {photo && (
                      // eslint-disable-next-line @next/next/no-img-element -- an organization's own upload, any size
                      <img src={photo} alt="" className="size-14 shrink-0 rounded-20 object-cover" />
                    )}
                    <span className="flex flex-col">
                      <span>Sponsor {a.name}</span>
                      {a.description && <span className="text-30 font-normal text-text-weak">{a.description}</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
        {funds.length > 1 && !animalId && (
          <FormField id={`${name}-fund`} label="Where your gift goes">
            {(f) => (
              <Select {...f} name={`${name}-fund`} value={fundId} onChange={(e) => setFundId(e.target.value)}>
                {funds.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        )}
        {allowTribute && (
          <div className="flex flex-col gap-3">
            <Checkbox label="Give in honor or memory of someone" help="A person or a pet." name={`${name}-tribute`} checked={tributeOn} onChange={(e) => setTributeOn(e.target.checked)} />
            {tributeOn && (
              <div className="flex flex-col gap-3 border-l-2 border-border-weak pl-4">
                <fieldset>
                  <legend className="sr-only">Kind of tribute</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ["honor", "In honor of"],
                        ["memory", "In memory of"],
                      ] as const
                    ).map(([v, l]) => (
                      <label key={v} className={pill(tributeKind === v)}>
                        <input type="radio" className="sr-only" name={`${name}-tkind`} value={v} checked={tributeKind === v} onChange={() => setTributeKind(v)} />
                        {l}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <FormField id={`${name}-honoree`} label="Their name" required>
                  {(f) => <Input {...f} autoComplete="off" maxLength={120} value={honoree} onChange={(e) => setHonoree(e.target.value)} />}
                </FormField>
                <FormField id={`${name}-nname`} label="Let someone know: their name" optional>
                  {(f) => <Input {...f} autoComplete="off" maxLength={120} value={notifyName} onChange={(e) => setNotifyName(e.target.value)} />}
                </FormField>
                <FormField id={`${name}-nemail`} label="Their email" optional help={`${orgName} emails them that you gave. The amount stays private.`}>
                  {(f) => <Input {...f} type="email" autoComplete="off" maxLength={200} value={notifyEmail} onChange={(e) => setNotifyEmail(e.target.value)} />}
                </FormField>
              </div>
            )}
          </div>
        )}
        {allowMessage && (
          <FormField id={`${name}-message`} label={`A message for ${orgName}`} optional help="Up to 500 characters.">
            {(f) => <Textarea {...f} rows={3} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} />}
          </FormField>
        )}
        {offerCoverFees && (
          <Checkbox
            label={valid ? `Add ${usd(grossUpForFee(giftCents) - giftCents)} to cover the card fee` : "Add a little to cover the card fee"}
            help="So all of your gift reaches us."
            name={`${name}-cover`}
            checked={cover}
            onChange={(e) => setCover(e.target.checked)}
          />
        )}
        {bot.element}
        {manualCheckout && (
          <Alert>
            <AlertDescription>
              Payment opens on Stripe&rsquo;s secure page.{" "}
              <a href={manualCheckout} target="_blank" rel="noopener" className="font-semibold underline">
                Continue to secure payment
              </a>
            </AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" size="default" fullWidth loading={pending} disabled={!valid}>
          {valid ? `Give ${usd(totalCents)}${allowMonthly && monthly ? " a month" : ""}` : "Give"}
        </Button>
      </form>
    </Card>
  );
}
