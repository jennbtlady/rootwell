"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, errorMessage } from "@/lib/api";
import { today } from "@/lib/format";
import { Alert, AlertDescription, Button, FormField, Input, Modal } from "@/components/ui";

export function NewBatchForm({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [batchDate, setBatchDate] = useState(today());
  const [description, setDescription] = useState("");
  const [expectedTotal, setExpectedTotal] = useState("");
  const [expectedCount, setExpectedCount] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await api().api.v1.orgs[":orgId"].batches.$post({
      param: { orgId },
      json: { batchDate, description: description || null, expectedTotal: expectedTotal || null, expectedCount: expectedCount ? Number(expectedCount) : null, notes: null },
    });
    setPending(false);
    if (res.status !== 201) return setError(await errorMessage(res));
    const { id } = await res.json();
    setOpen(false);
    router.push(`/app/orgs/${orgId}/batches/${id}`);
    router.refresh();
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>New batch</Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="New batch"
        description="One batch per deposit works best. Enter what the deposit slip says and the gifts must add up to it before posting."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="new-batch" loading={pending}>
              Start batch
            </Button>
          </>
        }
      >
        <form method="post" id="new-batch" onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="batch-date" label="Batch date" required>
              {(f) => <Input {...f} type="date" value={batchDate} onChange={(e) => setBatchDate(e.target.value)} />}
            </FormField>
            <FormField id="batch-desc" label="Description" optional>
              {(f) => <Input {...f} placeholder="Monday mail" value={description} onChange={(e) => setDescription(e.target.value)} />}
            </FormField>
            <FormField id="batch-total" label="Expected total" optional help="From the deposit slip. Leave empty to skip the check.">
              {(f) => <Input {...f} inputMode="decimal" insertBefore="$" value={expectedTotal} onChange={(e) => setExpectedTotal(e.target.value)} />}
            </FormField>
            <FormField id="batch-count" label="Expected number of gifts" optional>
              {(f) => <Input {...f} inputMode="numeric" value={expectedCount} onChange={(e) => setExpectedCount(e.target.value)} />}
            </FormField>
          </div>
          <div aria-live="polite">
            {error && (
              <Alert variant="error">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </form>
      </Modal>
    </>
  );
}
