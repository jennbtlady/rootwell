"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { BRANDING_IMAGE_MAX_BYTES, BRANDING_IMAGE_TYPES } from "@maple/core";
import type { SponsorAnimal } from "@maple/core/services";
import { api, errorMessage } from "@/lib/api";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { brandingImageUrl } from "@/lib/brand";
import { Badge, Button, Card, Checkbox, EmptyState, FormField, Heading, Input, Select, Textarea, useConfirm, useToast } from "@/components/ui";

type Draft = { id: string | null; name: string; description: string; fundId: string; photoPath: string | null; active: boolean };
const blank: Draft = { id: null, name: "", description: "", fundId: "", photoPath: null, active: true };

/**
 * The animals donors can sponsor (fundraising Phase 2). Owners and admins keep the list;
 * staff see it. A giving page chooses which ones to show. An animal with gifts can be
 * hidden but not deleted, so its gifts keep their animal.
 */
export function AnimalsManager({ orgId, animals, funds, canEdit }: { orgId: string; animals: SponsorAnimal[]; funds: { id: string; name: string }[]; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !draft) return;
    if (!(BRANDING_IMAGE_TYPES as readonly string[]).includes(file.type)) return toast({ type: "error", title: "Not uploaded", description: "Use a PNG, JPEG or WebP photo." });
    if (file.size > BRANDING_IMAGE_MAX_BYTES) return toast({ type: "error", title: "Not uploaded", description: "Use a photo under 2 MB." });
    setPending("photo");
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${orgId}/animal-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const { error: err } = await createSupabaseBrowser().storage.from("branding").upload(path, file, { contentType: file.type, cacheControl: "31536000" });
    setPending(null);
    if (err) return toast({ type: "error", title: "Not uploaded", description: "The photo did not upload. Check you are signed in with two-step sign-in, then try again." });
    setDraft({ ...draft, photoPath: path });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    if (!draft.name.trim()) return setError("Type the animal's name");
    setPending("save");
    setError(null);
    const json = { name: draft.name, description: draft.description || null, fundId: draft.fundId || null, photoPath: draft.photoPath, active: draft.active, sortOrder: 0 };
    const res = draft.id
      ? await api().api.v1.orgs[":orgId"].animals[":id"].$put({ param: { orgId, id: draft.id }, json })
      : await api().api.v1.orgs[":orgId"].animals.$post({ param: { orgId }, json });
    setPending(null);
    if (!res.ok) return setError(await errorMessage(res));
    toast({ type: "success", title: "Saved" });
    setDraft(null);
    router.refresh();
  }

  async function remove(a: SponsorAnimal) {
    if (!(await confirm({ title: `Delete ${a.name}?`, body: "This takes them off your list and your giving pages.", confirmLabel: "Delete", destructive: true }))) return;
    const res = await api().api.v1.orgs[":orgId"].animals[":id"].$delete({ param: { orgId, id: a.id } });
    if (!res.ok) return toast({ type: "error", title: "Not deleted", description: await errorMessage(res) });
    router.refresh();
  }

  const form = draft && (
    <Card>
      <form onSubmit={save} className="flex flex-col gap-4" noValidate>
        <Heading variant="heading40" as="h2" noMargin>
          {draft.id ? `Edit ${draft.name || "animal"}` : "Add an animal"}
        </Heading>
        <FormField id="an-name" label="Name" required error={error && !draft.name.trim() ? error : undefined}>
          {(f) => <Input {...f} maxLength={80} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />}
        </FormField>
        <FormField id="an-desc" label="A sentence about them" optional help="Shown to donors. Up to 500 characters.">
          {(f) => <Textarea {...f} rows={2} maxLength={500} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />}
        </FormField>
        <FormField id="an-fund" label="Fund their gifts go to" optional help="Leave empty to use the giving page's fund.">
          {(f) => (
            <Select {...f} value={draft.fundId} onChange={(e) => setDraft({ ...draft, fundId: e.target.value })}>
              <option value="">The giving page&rsquo;s fund</option>
              {funds.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField id="an-photo" label="Photo" optional help="PNG, JPEG or WebP, under 2 MB. Square photos look best.">
          {(f) => (
            <div className="flex flex-wrap items-center gap-3">
              {draft.photoPath && (
                // eslint-disable-next-line @next/next/no-img-element -- an organization's own upload
                <img src={brandingImageUrl(draft.photoPath) ?? ""} alt={`Photo of ${draft.name || "the animal"}`} className="size-16 rounded-20 object-cover" />
              )}
              <Input {...f} type="file" accept={BRANDING_IMAGE_TYPES.join(",")} onChange={upload} disabled={pending === "photo"} />
              {draft.photoPath && (
                <Button type="button" variant="secondary" size="small" onClick={() => setDraft({ ...draft, photoPath: null })}>
                  Remove photo
                </Button>
              )}
            </div>
          )}
        </FormField>
        <Checkbox label="Show on giving pages" help="Turn off when they are adopted. Their gifts stay in your records." checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
        {error && draft.name.trim() && <p className="text-30 text-text-error">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={pending === "save"}>
            Save
          </Button>
          <Button type="button" variant="secondary" onClick={() => setDraft(null)}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );

  return (
    <div className="flex flex-col gap-4">
      {canEdit && !draft && (
        <div>
          <Button onClick={() => setDraft(blank)}>Add an animal</Button>
        </div>
      )}
      {form}
      {animals.length === 0 ? (
        <EmptyState title="No animals yet">{canEdit ? "Add the animals donors can sponsor. Then choose them on a giving page." : "An owner or admin can add animals for donors to sponsor."}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {animals.map((a) => {
            const photo = brandingImageUrl(a.photoPath);
            return (
              <li key={a.id}>
                <Card className="flex flex-wrap items-center gap-3">
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- an organization's own upload
                    <img src={photo} alt="" className="size-14 shrink-0 rounded-20 object-cover" />
                  ) : null}
                  <div className="flex min-w-0 grow flex-col">
                    <span className="flex flex-wrap items-center gap-2 text-40 font-semibold">
                      {a.name}
                      {!a.active && <Badge>Hidden</Badge>}
                    </span>
                    <span className="text-30 text-text-weak">
                      {a.fundName ? `Gifts go to ${a.fundName}` : "Gifts go to the giving page's fund"}. {a.giftCount === 1 ? "1 gift" : `${a.giftCount} gifts`} so far.
                    </span>
                  </div>
                  {canEdit && (
                    <div className="flex gap-2">
                      <Button variant="secondary" size="small" onClick={() => setDraft({ id: a.id, name: a.name, description: a.description ?? "", fundId: a.fundId ?? "", photoPath: a.photoPath ?? null, active: a.active })} aria-label={`Edit ${a.name}`}>
                        Edit
                      </Button>
                      {a.giftCount === 0 && (
                        <Button variant="destructive_secondary" size="small" onClick={() => remove(a)} aria-label={`Delete ${a.name}`}>
                          Delete
                        </Button>
                      )}
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
