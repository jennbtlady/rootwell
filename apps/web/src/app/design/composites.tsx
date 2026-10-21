"use client";

import { useState } from "react";
import { Button, ConfirmHost, CopyButton, useConfirm } from "@/components/ui";

function ConfirmDemo() {
  const confirm = useConfirm();
  const [answer, setAnswer] = useState<string>("");
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="destructive_secondary"
        onClick={async () => setAnswer((await confirm({ title: "Remove the $25.00 gift from Ana Ruiz?", body: "It comes out of this batch. Nothing else changes.", confirmLabel: "Remove gift", destructive: true })) ? "Confirmed" : "Cancelled")}
      >
        Open a confirm
      </Button>
      <span className="text-30 text-text-weak" role="status">
        {answer}
      </span>
    </div>
  );
}

/** The confirm dialog and copy button, which need the browser. */
export function Composites() {
  return (
    <ConfirmHost>
      <div className="flex flex-col gap-4">
        <ConfirmDemo />
        <div>
          <CopyButton text="https://example.org/board/sample" variant="secondary" />
        </div>
      </div>
    </ConfirmHost>
  );
}
