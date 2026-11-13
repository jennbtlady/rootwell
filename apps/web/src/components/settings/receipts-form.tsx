"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { buildReceipt, type ReceiptSettings } from "@maple/core";
import { api, errorMessage } from "@/lib/api";
import { Alert, AlertDescription, AlertTitle, Button, Card, Checkbox, FormField, Heading, Input, Textarea, useToast } from "@/components/ui";

/**
 * Online receipt settings (fundraising Phase 2): on or off, the thank-you text, the tax
 * statement, the signature, and where replies go. The preview is the real receipt text.
 */
export function ReceiptsForm({
  orgId,
  orgName,
  hasEin,
  settings,
  defaults,
  canEdit,
}: {
  orgId: string;
  orgName: string;
  hasEin: boolean;
  settings: ReceiptSettings;
  defaults: { taxStatement: string; thankYou: string; signature: string };
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [enabled, setEnabled] = useState(settings.enabled !== false);
  const [thankYou, setThankYou] = useState(settings.thankYou ?? "");
  const [taxStatement, setTaxStatement] = useState(settings.taxStatement ?? "");
  const [signature, setSignature] = useState(settings.signature ?? "");
  const [replyTo, setReplyTo] = useState(settings.replyTo ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const preview = useMemo(
    () =>
      buildReceipt({ name: orgName, ein: null }, { thankYou, taxStatement: taxStatement || defaults.taxStatement, signature }, "Alex Sample", {
        amountCents: 5000,
        deductibleCents: null,
        giftDate: new Date().toISOString().slice(0, 10),
        designation: "General",
        monthly: false,
        tribute: null,
        manageUrl: null,
      }),
    [orgName, thankYou, taxStatement, signature, defaults.taxStatement],
  );

  async function save(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setErrors({});
    const res = await api().api.v1.orgs[":orgId"].receipts.$put({ param: { orgId }, json: { enabled, thankYou, taxStatement, signature, replyTo } });
    setPending(false);
    if (!res.ok) {
      const body = (await res.clone().json().catch(() => null)) as { issues?: { path: string; message: string }[] } | null;
      if (body?.issues?.length) return setErrors(Object.fromEntries(body.issues.map((i) => [i.path, i.message])));
      return toast({ type: "error", title: "Not saved", description: await errorMessage(res) });
    }
    toast({ type: "success", title: "Saved", description: "New receipts use these words." });
    router.refresh();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <form onSubmit={save} className="flex flex-col gap-4" noValidate>
          {!canEdit && (
            <Alert>
              <AlertDescription>Only owners and admins can change receipts.</AlertDescription>
            </Alert>
          )}
          <fieldset disabled={!canEdit} className="flex flex-col gap-4">
            <Checkbox label="Email a receipt for every online gift" help="Turn off only if you send your own. Gifts then wait on your thank-you list." checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <FormField id="rc-thanks" label="Thank-you" optional help={`Leave empty for: "${defaults.thankYou}"`} error={errors.thankYou}>
              {(f) => <Textarea {...f} rows={3} maxLength={2000} value={thankYou} onChange={(e) => setThankYou(e.target.value)} />}
            </FormField>
            <FormField id="rc-tax" label="Tax-exempt statement" optional help="Leave empty to use the standard one, shown in the preview." error={errors.taxStatement}>
              {(f) => <Textarea {...f} rows={3} maxLength={1000} value={taxStatement} onChange={(e) => setTaxStatement(e.target.value)} />}
            </FormField>
            {!hasEin && (
              <Alert variant="warning">
                <AlertTitle>Add your EIN</AlertTitle>
                <AlertDescription>Receipts are clearer with your EIN. Add it in Organization details.</AlertDescription>
              </Alert>
            )}
            <FormField id="rc-sign" label="Sign off as" optional help={`Leave empty for "${defaults.signature}".`} error={errors.signature}>
              {(f) => <Input {...f} maxLength={200} value={signature} onChange={(e) => setSignature(e.target.value)} />}
            </FormField>
            <FormField id="rc-reply" label="Replies go to" optional help="When a donor answers a receipt, it goes here. Use your office email." error={errors.replyTo}>
              {(f) => <Input {...f} type="email" autoComplete="email" maxLength={200} value={replyTo} onChange={(e) => setReplyTo(e.target.value)} />}
            </FormField>
            <div>
              <Button type="submit" loading={pending}>
                Save
              </Button>
            </div>
          </fieldset>
        </form>
      </Card>
      <Card>
        <Heading variant="heading40" as="h2">
          Preview
        </Heading>
        <p className="mb-2 text-30 font-semibold">{preview.subject}</p>
        <div className="whitespace-pre-line text-30 leading-6" aria-label="Receipt preview">
          {preview.text}
        </div>
      </Card>
    </div>
  );
}
