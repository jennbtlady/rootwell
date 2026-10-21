"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AckTemplate, CodingRow, Member, OrgDetail, SetupStep } from "@maple/core/services";
import type { GiftEntryStandards } from "@maple/core";
import { cn } from "@/lib/cn";
import { Badge, Card, Heading } from "@/components/ui";
import { ProfileForm } from "./profile-form";
import { FundsStep } from "./funds-step";
import { RulesStep } from "./rules-step";
import { DonorsStep } from "./donors-step";
import { TeamStep } from "./team-step";
import { ThanksStep } from "./thanks-step";
import { DoneStep } from "./done-step";
import { WIZARD_STEPS, type WizardKey } from "@/lib/wizard-steps";

/**
 * The guided setup (docs/usability/2026-10-21-persona-walkthroughs.md). One step at a time, in
 * the order things depend on each other, done right here: no trips into Settings. Every step
 * can be skipped and finished later. Progress counts only decisions a person made.
 */
export { WIZARD_STEPS, type WizardKey } from "@/lib/wizard-steps";

export type WizardData = {
  org: OrgDetail;
  steps: SetupStep[];
  funds: CodingRow[];
  campaigns: CodingRow[];
  standards: GiftEntryStandards;
  members: Member[];
  letter: AckTemplate | null;
  myUserId: string;
};

export function SetupWizard({ data, current }: { data: WizardData; current: WizardKey }) {
  const router = useRouter();
  const base = `/app/orgs/${data.org.id}`;
  const index = WIZARD_STEPS.findIndex((s) => s.key === current);
  const done = (key: WizardKey) => (key === "done" ? false : Boolean(data.steps.find((s) => s.key === key)?.done));
  const go = (key: WizardKey) => {
    router.push(`${base}/setup?step=${key}`);
    router.refresh();
  };
  const next = () => go(WIZARD_STEPS[Math.min(index + 1, WIZARD_STEPS.length - 1)]!.key);
  const back = index > 0 ? () => go(WIZARD_STEPS[index - 1]!.key) : undefined;
  const nav = { next, back, skip: next };
  const step = WIZARD_STEPS[index]!;
  const counted = WIZARD_STEPS.filter((s) => s.key !== "done");
  const doneCount = counted.filter((s) => done(s.key)).length;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-30 font-semibold text-text-weak">Getting set up</p>
        <Heading variant="heading20" as="h1" noMargin>
          {step.title}
        </Heading>
      </div>

      <nav aria-label="Setup steps">
        <p className="mb-2 text-30 text-text-weak sm:hidden">
          Step {index + 1} of {WIZARD_STEPS.length}. {doneCount} of {counted.length} done.
        </p>
        <ol className="hidden flex-wrap gap-1 sm:flex">
          {WIZARD_STEPS.map((s, i) => {
            const isCurrent = s.key === current;
            const isDone = done(s.key);
            return (
              <li key={s.key}>
                <Link
                  href={`${base}/setup?step=${s.key}`}
                  aria-current={isCurrent ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-30 leading-5 outline-none focus-visible:shadow-focus",
                    isCurrent ? "bg-background-primary-weakest font-semibold text-text-primary shadow-border-primary-weaker" : "text-text-weak hover:bg-background hover:text-text",
                  )}
                >
                  <span aria-hidden="true" className={cn("flex size-5 items-center justify-center rounded-circle text-20 font-semibold", isDone ? "bg-background-success text-text-inverse" : "bg-background-strong text-text")}>
                    {isDone ? "✓" : i + 1}
                  </span>
                  {s.short}
                  {isDone && <span className="sr-only"> (done)</span>}
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>

      <Card className="p-4 sm:p-6">
        {current === "profile" && (
          <div className="flex flex-col gap-4">
            <Intro>These go on every thank-you letter and year-end statement, so donors can claim their gifts. You can change them later under Settings, Organization details.</Intro>
            <ProfileForm org={data.org} submitLabel="Save and continue" onSaved={next} extraActions={<SkipButton onClick={next} />} />
          </div>
        )}
        {current === "funds" && <FundsStep data={data} nav={nav} />}
        {current === "rules" && <RulesStep data={data} nav={nav} />}
        {current === "donors" && <DonorsStep data={data} nav={nav} />}
        {current === "team" && <TeamStep data={data} nav={nav} />}
        {current === "thanks" && <ThanksStep data={data} nav={nav} />}
        {current === "done" && <DoneStep data={data} />}
      </Card>

      <div className="flex flex-wrap items-center gap-3 text-30">
        {back && (
          <button type="button" onClick={back} className="rounded-20 text-text-link outline-none hover:underline focus-visible:shadow-focus">
            <span aria-hidden="true">‹ </span>Back
          </button>
        )}
        <span className="grow" />
        <Link href={base} className="rounded-20 text-text-link outline-none hover:underline focus-visible:shadow-focus">
          Finish later
        </Link>
        {done(step.key) && <Badge variant="success">This step is done</Badge>}
      </div>
    </div>
  );
}

export type WizardNav = { next: () => void; back?: () => void; skip: () => void };

export function Intro({ children }: { children: React.ReactNode }) {
  return <p className="max-w-2xl text-40 leading-6 text-text">{children}</p>;
}

export function SkipButton({ onClick, label = "Skip for now" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} className="rounded-20 px-2 py-2 text-30 font-medium text-text-link outline-none hover:underline focus-visible:shadow-focus">
      {label}
    </button>
  );
}
