"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Alert, AlertDescription, Button, Input } from "@/components/ui";
import { buttonVariants } from "@/components/ui/button";
import { Intro, SkipButton, type WizardData, type WizardNav } from "./setup-wizard";

type Row = { first: string; last: string; email: string };
const blank = (): Row => ({ first: "", last: "", email: "" });

/** Three ways in: bring a spreadsheet, add a few by hand here, or start empty. */
export function DonorsStep({ data, nav }: { data: WizardData; nav: WizardNav }) {
  const [mode, setMode] = useState<"choose" | "hand">("choose");
  const [rows, setRows] = useState<Row[]>([blank(), blank(), blank()]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const base = `/app/orgs/${data.org.id}`;
  const already = data.steps.find((s) => s.key === "donors")?.done;

  async function saveRows(e: FormEvent) {
    e.preventDefault();
    const filled = rows.filter((r) => r.last.trim() || r.first.trim());
    if (filled.some((r) => !r.last.trim())) return setError("Each person needs a last name.");
    setPending(true);
    setError(null);
    for (const r of filled) {
      const res = await api().api.v1.orgs[":orgId"].constituents.$post({
        param: { orgId: data.org.id },
        json: { firstName: r.first.trim() || null, lastName: r.last.trim(), emails: r.email.trim() ? [{ email: r.email.trim() }] : [] } as never,
      });
      if (!res.ok) {
        setPending(false);
        return setError(await errorMessage(res, `Could not add ${r.first} ${r.last}. Check the email address.`));
      }
    }
    setPending(false);
    nav.next();
  }

  if (mode === "hand") {
    return (
      <form onSubmit={saveRows} className="flex flex-col gap-4" noValidate>
        <Intro>Add a few people now. You can add details like addresses later from each person&apos;s page.</Intro>
        <div className="flex flex-col gap-3">
          {rows.map((r, i) => (
            <fieldset key={i} className="grid gap-2 sm:grid-cols-3">
              <legend className="sr-only">Person {i + 1}</legend>
              <label className="flex flex-col gap-1 text-30 font-medium">
                First name
                <Input value={r.first} onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, first: e.target.value } : y)))} autoComplete="off" />
              </label>
              <label className="flex flex-col gap-1 text-30 font-medium">
                Last name
                <Input value={r.last} onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, last: e.target.value } : y)))} autoComplete="off" />
              </label>
              <label className="flex flex-col gap-1 text-30 font-medium">
                Email (optional)
                <Input type="email" value={r.email} onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, email: e.target.value } : y)))} autoComplete="off" />
              </label>
            </fieldset>
          ))}
        </div>
        <div>
          <Button variant="secondary" size="small" onClick={() => setRows((x) => [...x, blank()])}>
            Add another person
          </Button>
        </div>
        {error && (
          <Alert variant="error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" loading={pending} disabled={!rows.some((r) => r.last.trim())}>
            Save and continue
          </Button>
          <SkipButton onClick={() => setMode("choose")} label="Back to the choices" />
        </div>
      </form>
    );
  }

  const option = "flex flex-col gap-1 rounded-30 border border-border-weaker bg-background-weakest p-4 text-left outline-none hover:shadow-border-primary focus-visible:shadow-focus";
  return (
    <div className="flex flex-col gap-4">
      <Intro>{already ? "You have donors in your records. Bring in more, or move on." : "How would you like to start your donor list?"}</Intro>
      <div className="grid gap-3 sm:grid-cols-3">
        <Link href={`${base}/imports/new`} className={option}>
          <span className="text-40 font-semibold">Bring in a spreadsheet</span>
          <span className="text-30 leading-5 text-text-weak">From your old database, Excel, or Google Sheets. You check everything before it is saved, and you can undo it.</span>
        </Link>
        <button type="button" onClick={() => setMode("hand")} className={option}>
          <span className="text-40 font-semibold">Add a few by hand</span>
          <span className="text-30 leading-5 text-text-weak">Type in a handful of people now. Good if your list is short.</span>
        </button>
        <button type="button" onClick={nav.skip} className={option}>
          <span className="text-40 font-semibold">Start with an empty list</span>
          <span className="text-30 leading-5 text-text-weak">Add people as gifts come in. You can import later.</span>
        </button>
      </div>
      {already && (
        <div>
          <button type="button" onClick={nav.next} className={cn(buttonVariants())}>
            Continue
          </button>
        </div>
      )}
    </div>
  );
}
