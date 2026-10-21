"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp } from "lucide-react";
import { DASHBOARD_CARDS, type DashboardView, type LayoutItem } from "@maple/core";
import { api, errorMessage } from "@/lib/api";
import { Alert, AlertDescription, Button, Card, Checkbox, Heading, useConfirm, useToast } from "@/components/ui";

const TITLE: Record<DashboardView, string> = { staff: "Customize Home", board: "Customize the board dashboard" };
const WHO: Record<DashboardView, string> = {
  staff: "Everyone in your organization sees this layout on Home.",
  board: "Board members see this layout here and on every board link.",
};

/**
 * Owners and admins choose which cards show, and in what order. One layout per organization
 * for each view. Moving uses Up and Down buttons rather than dragging, so it works by
 * keyboard, with a screen reader, and on a phone.
 */
export function DashboardCustomizer({ orgId, view, layout, canCustomize, children }: { orgId: string; view: DashboardView; layout: LayoutItem[]; canCustomize: boolean; children: React.ReactNode }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LayoutItem[]>(layout);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  const def = new Map(DASHBOARD_CARDS[view].map((c) => [c.id, c]));

  if (!canCustomize) return <>{children}</>;

  if (!editing) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex justify-end print:hidden">
          <Button
            variant="secondary"
            size="small"
            onClick={() => {
              setDraft(layout);
              setError(null);
              setEditing(true);
            }}
          >
            Customize
          </Button>
        </div>
        {children}
      </div>
    );
  }

  function move(i: number, by: -1 | 1) {
    const j = i + by;
    if (j < 0 || j >= draft.length) return;
    const next = [...draft];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setDraft(next);
    const label = def.get(next[j]!.id)?.label ?? "";
    setAnnounce(`${label} moved to position ${j + 1} of ${next.length}.`);
    // Keep focus on the same button of the card that moved, so pressing it again keeps going.
    requestAnimationFrame(() => {
      const btn = listRef.current?.querySelector<HTMLButtonElement>(`[data-move="${next[j]!.id}:${by}"]`);
      (btn && !btn.disabled ? btn : listRef.current?.querySelector<HTMLButtonElement>(`[data-move="${next[j]!.id}:${-by}"]`))?.focus();
    });
  }

  async function save() {
    if (!draft.some((d) => d.shown)) return setError("Show at least one card.");
    setSaving(true);
    setError(null);
    const res = await api().api.v1.orgs[":orgId"]["dashboard-layout"].$put({ param: { orgId }, json: { view, cards: draft } });
    setSaving(false);
    if (!res.ok) return setError(await errorMessage(res));
    toast({ type: "success", title: "Layout saved", description: WHO[view] });
    setEditing(false);
    router.refresh();
  }

  async function reset() {
    if (!(await confirm({ title: "Go back to the standard layout?", body: "Every card shows again, in the original order.", confirmLabel: "Use the standard layout" }))) return;
    setSaving(true);
    const res = await api().api.v1.orgs[":orgId"]["dashboard-layout"][":view"].$delete({ param: { orgId, view } });
    setSaving(false);
    if (!res.ok) return setError(await errorMessage(res));
    toast({ type: "success", title: "Standard layout restored" });
    setEditing(false);
    router.refresh();
  }

  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-6">
      <div>
        <Heading variant="heading30" as="h2" noMargin>
          {TITLE[view]}
        </Heading>
        <p className="mt-1 max-w-2xl text-30 leading-5 text-text-weak">Choose which cards show and their order. {WHO[view]}</p>
      </div>
      <ol ref={listRef} className="flex flex-col divide-y divide-border-weaker rounded-30 border border-border-weaker" aria-label="Cards, in order">
        {draft.map((item, i) => {
          const card = def.get(item.id)!;
          return (
            <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 p-3">
              <Checkbox
                label={card.label}
                help={card.description}
                checked={item.shown}
                onChange={(e) => setDraft(draft.map((d) => (d.id === item.id ? { ...d, shown: e.target.checked } : d)))}
              />
              <span className="flex gap-1">
                <Button variant="secondary" size="small" data-move={`${item.id}:-1`} disabled={i === 0} aria-label={`Move ${card.label} up`} onClick={() => move(i, -1)}>
                  <ArrowUp className="size-4" aria-hidden="true" />
                  Up
                </Button>
                <Button variant="secondary" size="small" data-move={`${item.id}:1`} disabled={i === draft.length - 1} aria-label={`Move ${card.label} down`} onClick={() => move(i, 1)}>
                  <ArrowDown className="size-4" aria-hidden="true" />
                  Down
                </Button>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      {error && (
        <Alert variant="error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        <Button loading={saving} onClick={save}>
          Save layout
        </Button>
        <Button variant="secondary" onClick={() => setEditing(false)}>
          Cancel
        </Button>
        <Button variant="link" onClick={reset}>
          Use the standard layout
        </Button>
      </div>
    </Card>
  );
}
