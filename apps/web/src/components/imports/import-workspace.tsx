"use client";

import { useState } from "react";
import type { ImportJob, SavedMapping } from "@maple/core/services";
import { ImportSteps } from "./import-steps";
import { MappingStep } from "./mapping-step";
import { ProblemsStep } from "./problems-step";
import { ReviewStep } from "./review-step";
import { CommitStep } from "./commit-step";
import { DoneView } from "./done-view";

/** Chooses the step from the job's state. Each step can send the person back to an earlier one. */
export function ImportWorkspace({ orgId, job, samples, saved }: { orgId: string; job: ImportJob; samples: string[][]; saved: SavedMapping[] }) {
  const [remap, setRemap] = useState(false);

  if (job.status === "committed" || job.status === "rolled_back") {
    return (
      <>
        <ImportSteps current={5} done />
        <DoneView orgId={orgId} job={job} />
      </>
    );
  }
  if (job.status === "uploading" || remap) {
    return (
      <>
        <ImportSteps current={2} />
        <MappingStep orgId={orgId} job={job} samples={samples} saved={saved} onDone={() => setRemap(false)} />
      </>
    );
  }
  const errors = job.counts.error;
  const review = job.people.review;
  const step = errors > 0 ? 3 : review > 0 ? 4 : 5;
  return (
    <>
      <ImportSteps current={step} />
      {step === 3 && <ProblemsStep orgId={orgId} job={job} onRemap={() => setRemap(true)} />}
      {step === 4 && <ReviewStep orgId={orgId} job={job} />}
      {step === 5 && <CommitStep orgId={orgId} job={job} onRemap={() => setRemap(true)} />}
    </>
  );
}
