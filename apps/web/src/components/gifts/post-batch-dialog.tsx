"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Batch } from "@maple/core/services";
import { api, errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { depositCheck } from "@/lib/deposit-check";
import { Alert, AlertDescription, Button, FormField, Input, Modal, useToast } from "@/components/ui";

/**
 * Posting, explained. A batch that matches gets a plain "these become final" confirmation.
 * One that does not gets the difference in dollars, with "Go back and check" as the first
 * choice. The database refuses to post a mismatch either way; this says why before it happens.
 */
export function PostBatchDialog({ orgId, batch, open, onClose }: { orgId: string; batch: Batch; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const check = depositCheck(batch);
  const [fixing, setFixing] = useState(false);
  const [expectedTotal, setExpectedTotal] = useState(batch.expectedTotal ?? "");
  const [expectedCount, setExpectedCount] = useState(batch.expectedCount == null ? "" : String(batch.expectedCount));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function post() {
    setPending(true);
    setError(null);
    const res = await api().api.v1.orgs[":orgId"].batches[":id"].post.$post({ param: { orgId, id: batch.id } });
    setPending(false);
    if (!res.ok) return setError(await errorMessage(res));
    const { postedCount, postedTotal } = (await res.json()) as { postedCount: number; postedTotal: string };
    toast({ type: "success", title: "Batch posted", description: `${postedCount} ${postedCount === 1 ? "gift" : "gifts"} totaling ${formatMoney(postedTotal)} are final. Next: thank these donors.` });
    onClose();
    router.refresh();
  }

  async function correctAndPost() {
    setPending(true);
    setError(null);
    const res = await api().api.v1.orgs[":orgId"].batches[":id"].$patch({
      param: { orgId, id: batch.id },
      json: {
        batchDate: batch.batchDate,
        description: batch.description,
        notes: batch.notes,
        expectedTotal: expectedTotal.replace(/[$,\s]/g, "") || null,
        expectedCount: expectedCount.trim() === "" ? null : Number(expectedCount),
      },
    });
    if (!res.ok) {
      setPending(false);
      return setError(await errorMessage(res));
    }
    await post();
  }

  const n = batch.giftCount;
  const gifts = `${n} ${n === 1 ? "gift" : "gifts"}`;

  if (check.matches) {
    return (
      <Modal
        open={open}
        onOpenChange={(o) => !o && onClose()}
        title={`Post these ${gifts}?`}
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Not yet
            </Button>
            <Button loading={pending} onClick={post}>
              Post batch
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-30 leading-5">
          <p>
            They add up to <strong>{formatMoney(batch.giftTotal)}</strong>
            {batch.expectedTotal != null ? ", which matches the deposit slip." : "."}
          </p>
          <p>Posting makes them final. No one can change them by accident, so your records always agree with the bank. A mistake found later is fixed with a correcting gift.</p>
          {error && (
            <Alert variant="error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="This batch does not match the deposit slip"
      footer={
        fixing ? (
          <>
            <Button variant="secondary" onClick={() => setFixing(false)}>
              Cancel
            </Button>
            <Button loading={pending} onClick={correctAndPost}>
              Correct and post
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onClose}>Go back and check</Button>
            <Button variant="secondary" onClick={() => setFixing(true)}>
              The slip was wrong
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-3 text-30 leading-5">
        <ul className="flex list-disc flex-col gap-1 pl-5">
          {check.diff !== 0 && (
            <li>
              These gifts add up to <strong>{formatMoney(batch.giftTotal)}</strong>. The deposit slip says <strong>{formatMoney(batch.expectedTotal!)}</strong>. That is{" "}
              <strong>
                {formatMoney(Math.abs(check.diff) / 100)} {check.diff > 0 ? "short" : "over"}
              </strong>
              .
            </li>
          )}
          {check.countDiff !== 0 && <li>{check.countText}.</li>}
        </ul>
        {!fixing ? (
          <p>A batch is posted only when it matches, so your records agree with the bank. Look for a gift typed with the wrong amount, or a check that is missing. You can remove a gift and enter it again.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <p>If the gifts are right and the slip total was typed wrong, correct it here. It must match what went into the bank.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField id="fix-total" label="Deposit slip total">
                {(f) => <Input {...f} inputMode="decimal" insertBefore="$" value={expectedTotal} onChange={(e) => setExpectedTotal(e.target.value)} />}
              </FormField>
              <FormField id="fix-count" label="Number of gifts on the slip" optional>
                {(f) => <Input {...f} inputMode="numeric" value={expectedCount} onChange={(e) => setExpectedCount(e.target.value)} />}
              </FormField>
            </div>
          </div>
        )}
        {error && (
          <Alert variant="error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    </Modal>
  );
}
