"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { CodingRow, DonationPage } from "@maple/core/services";
import { api, errorMessage } from "@/lib/api";
import { useEarlyTyping } from "@/lib/early-typing";
import { Alert, AlertDescription, Button, Card, Checkbox, FormField, Input, Select, Textarea, useToast, useConfirm } from "@/components/ui";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);

export function DonationPageForm({ orgId, funds, campaigns, animals = [], page }: { orgId: string; funds: CodingRow[]; campaigns: CodingRow[]; animals?: { id: string; name: string; active: boolean }[]; page: DonationPage | null }) {
  const confirm = useConfirm();
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState(page?.title ?? "");
  const [slug, setSlug] = useState(page?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!page);
  const [intro, setIntro] = useState(page?.intro ?? "");
  const [thankYou, setThankYou] = useState(page?.thankYou ?? "");
  const [fundIds, setFundIds] = useState<string[]>(page?.fundIds ?? (funds[0] ? [funds[0].id] : []));
  const [campaignId, setCampaignId] = useState(page?.campaignId ?? "");
  const [amounts, setAmounts] = useState((page?.amounts ?? [25, 50, 100, 250]).join(", "));
  const [allowMonthly, setAllowMonthly] = useState(page?.allowMonthly ?? true);
  const [offerCoverFees, setOfferCoverFees] = useState(page?.offerCoverFees ?? true);
  const [allowTribute, setAllowTribute] = useState(page?.allowTribute ?? false);
  const [allowMessage, setAllowMessage] = useState(page?.allowMessage ?? false);
  const [animalIds, setAnimalIds] = useState<string[]>(page?.animalIds ?? []);
  const [active, setActive] = useState(page?.active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const back = `/app/orgs/${orgId}/fundraising/pages`;
  // Text typed before the page's scripts loaded (a slow phone, a first visit) is kept.
  const formRef = useRef<HTMLFormElement>(null);
  useEarlyTyping(formRef, (field, value) => {
    if (field === "title") setTitle(value);
    if (field === "slug" && value) {
      setSlug(value.toLowerCase());
      setSlugTouched(true);
    }
    if (field === "intro") setIntro(value);
    if (field === "amounts") setAmounts(value);
    if (field === "thankYou") setThankYou(value);
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = amounts
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((x) => Number(x.replace(/[$]/g, "")));
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = "Give the page a title";
    if (parsed.some((n) => !Number.isInteger(n) || n < 1 || n > 100000)) errs.amounts = "Use whole dollar amounts between 1 and 100,000, separated by commas";
    else if (parsed.length < 1 || parsed.length > 6) errs.amounts = "Use one to six amounts";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setPending(true);
    setFormError(null);
    const json = { slug, title, intro: intro || null, thankYou: thankYou || null, fundIds, campaignId: campaignId || null, amounts: parsed, allowMonthly, offerCoverFees, allowTribute, allowMessage, animalIds, active };
    const res = page
      ? await api().api.v1.orgs[":orgId"]["donation-pages"][":id"].$put({ param: { orgId, id: page.id }, json })
      : await api().api.v1.orgs[":orgId"]["donation-pages"].$post({ param: { orgId }, json });
    setPending(false);
    if (!res.ok) {
      const body = (await res.clone().json().catch(() => null)) as { issues?: { path: string; message: string }[] } | null;
      if (body?.issues?.length) return setErrors(Object.fromEntries(body.issues.map((i) => [i.path, i.message])));
      return setFormError(await errorMessage(res));
    }
    toast({ type: "success", title: page ? "Page saved" : "Page made" });
    router.push(back);
    router.refresh();
  }

  async function remove() {
    if (!page || !(await confirm({ title: `Delete "${page.title}"?`, body: "Its link stops working. Gifts already made stay.", confirmLabel: "Delete page", destructive: true }))) return;
    const res = await api().api.v1.orgs[":orgId"]["donation-pages"][":id"].$delete({ param: { orgId, id: page.id } });
    if (res.status !== 204) return setFormError(await errorMessage(res));
    router.push(back);
    router.refresh();
  }

  const toggleFund = (id: string, on: boolean) => setFundIds((cur) => (on ? [...cur, id] : cur.filter((x) => x !== id)));

  return (
    <Card>
      <form ref={formRef} method="post" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {formError && (
          <Alert variant="error">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}
        <FormField id="dp-title" label="Title" required error={errors.title} help="Donors see this at the top of the page.">
          {(f) => (
            <Input
              {...f}
              name="title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
            />
          )}
        </FormField>
        <FormField id="dp-slug" label="Web address" required error={errors.slug} help="Lowercase letters, numbers, and dashes. Changing it breaks links you already shared.">
          {(f) => (
            <Input
              {...f}
              name="slug"
              insertBefore="/give/"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value.toLowerCase());
              }}
            />
          )}
        </FormField>
        <FormField id="dp-intro" label="Message to donors" optional error={errors.intro} help="A few sentences on what a gift does.">
          {(f) => <Textarea {...f} name="intro" rows={4} value={intro} onChange={(e) => setIntro(e.target.value)} />}
        </FormField>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-30 font-semibold">Funds donors can choose</legend>
          <p className="text-20 text-text-weak">The first one checked is chosen for them unless they pick another. Check none to leave the fund for staff to set.</p>
          {funds.map((f) => (
            <Checkbox key={f.id} label={f.name} checked={fundIds.includes(f.id)} onChange={(e) => toggleFund(f.id, e.target.checked)} />
          ))}
        </fieldset>
        <FormField id="dp-campaign" label="Campaign" optional help="Every gift from this page is counted toward it.">
          {(f) => (
            <Select {...f} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              <option value="">None</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField id="dp-amounts" label="Suggested amounts" required error={errors.amounts} help="Whole dollars, separated by commas. Donors can also type their own.">
          {(f) => <Input {...f} name="amounts" inputMode="numeric" value={amounts} onChange={(e) => setAmounts(e.target.value)} />}
        </FormField>
        <Checkbox label="Let donors give every month" checked={allowMonthly} onChange={(e) => setAllowMonthly(e.target.checked)} />
        <Checkbox label="Ask donors to cover the card fee" help="Adds about 2.2% plus 30 cents if they agree, so the full gift reaches you." checked={offerCoverFees} onChange={(e) => setOfferCoverFees(e.target.checked)} />
        <Checkbox label="Let donors give in honor or memory of someone" help="They can name a person or pet, and ask you to email someone about the gift." checked={allowTribute} onChange={(e) => setAllowTribute(e.target.checked)} />
        <Checkbox label="Let donors leave a message" help="A short note to you, shown on the gift." checked={allowMessage} onChange={(e) => setAllowMessage(e.target.checked)} />
        {animals.length > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-30 font-semibold">Animals donors can sponsor</legend>
            <p className="text-20 text-text-weak">
              Donors can pick one. Their gift goes to that animal&rsquo;s fund. Keep the list in{" "}
              <a className="text-text-link underline" href={`/app/orgs/${orgId}/fundraising/animals`}>
                Animals to sponsor
              </a>
              .
            </p>
            {animals.map((a) => (
              <Checkbox
                key={a.id}
                label={a.active ? a.name : `${a.name} (hidden)`}
                checked={animalIds.includes(a.id)}
                onChange={(e) => setAnimalIds((xs) => (e.target.checked ? [...xs, a.id] : xs.filter((x) => x !== a.id)))}
              />
            ))}
          </fieldset>
        )}
        <FormField id="dp-thanks" label="Thank-you message" optional help="Shown after they give.">
          {(f) => <Textarea {...f} name="thankYou" rows={3} value={thankYou} onChange={(e) => setThankYou(e.target.value)} />}
        </FormField>
        <Checkbox label="Page is on" help="Turn off to stop taking gifts without deleting the page." checked={active} onChange={(e) => setActive(e.target.checked)} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={pending} disabled={!title.trim() || !slug}>
            {page ? "Save" : "Make page"}
          </Button>
          <Button variant="secondary" onClick={() => router.push(back)}>
            Cancel
          </Button>
          {page && (
            <>
              <span className="grow" />
              <Button variant="destructive_secondary" onClick={remove}>
                Delete page
              </Button>
            </>
          )}
        </div>
      </form>
    </Card>
  );
}
