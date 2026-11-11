"use client";

import { useId, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { BRANDING_IMAGE_MAX_BYTES, BRANDING_IMAGE_TYPES, brandingWarnings, DEFAULT_BRANDING, type OrgBranding } from "@maple/core";
import { api, errorMessage } from "@/lib/api";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { brandingImageUrl } from "@/lib/brand";
import { Alert, AlertDescription, AlertTitle, Button, Card, FormField, HelpText, Input, useToast } from "@/components/ui";
import { PublicShell } from "@/components/give/public-shell";

type State = { primaryColor: string; accentColor: string; logoPath: string | null; headerImagePath: string | null };

/**
 * How public pages look (fundraising Phase 1). Two brand colors, a logo and a header image,
 * with contrast warnings as you type and a live preview. Images upload straight to the
 * branding bucket (owners and admins only, by storage policy); Save records which to use.
 */
export function BrandingForm({ orgId, orgName, branding, logoPath }: { orgId: string; orgName: string; branding: OrgBranding; logoPath: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [s, setS] = useState<State>({
    primaryColor: branding.primaryColor ?? DEFAULT_BRANDING.primaryColor,
    accentColor: branding.accentColor ?? DEFAULT_BRANDING.accentColor,
    logoPath,
    headerImagePath: branding.headerImagePath ?? null,
  });
  const [pending, setPending] = useState<string | null>(null);
  const valid = (c: string) => /^#[0-9a-fA-F]{6}$/.test(c);
  const current: OrgBranding = {
    ...(valid(s.primaryColor) ? { primaryColor: s.primaryColor.toUpperCase() } : {}),
    ...(valid(s.accentColor) ? { accentColor: s.accentColor.toUpperCase() } : {}),
    ...(s.headerImagePath ? { headerImagePath: s.headerImagePath } : {}),
  };
  const warnings = brandingWarnings(current);
  const warningFor = (f: "primaryColor" | "accentColor") => warnings.filter((w) => w.field === f).map((w) => w.message).join(" ") || undefined;

  async function upload(kind: "logo" | "header", e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!(BRANDING_IMAGE_TYPES as readonly string[]).includes(file.type)) return toast({ type: "error", title: "Not uploaded", description: "Use a PNG, JPEG or WebP image." });
    if (file.size > BRANDING_IMAGE_MAX_BYTES) return toast({ type: "error", title: "Not uploaded", description: "Use an image under 2 MB." });
    setPending(kind);
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${orgId}/${kind}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const { error } = await createSupabaseBrowser().storage.from("branding").upload(path, file, { contentType: file.type, cacheControl: "31536000" });
    setPending(null);
    if (error) return toast({ type: "error", title: "Not uploaded", description: "The image did not upload. Check you are signed in with two-step sign-in, then try again." });
    setS((x) => ({ ...x, [kind === "logo" ? "logoPath" : "headerImagePath"]: path }));
    toast({ type: "success", title: "Uploaded", description: "Choose Save to use it on your public pages." });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!valid(s.primaryColor) || !valid(s.accentColor)) return toast({ type: "error", title: "Not saved", description: "Use colors like #1A6B3C: a # and six letters or numbers." });
    setPending("save");
    const res = await api().api.v1.orgs[":orgId"].branding.$put({
      param: { orgId },
      json: { primaryColor: s.primaryColor, accentColor: s.accentColor, logoPath: s.logoPath, headerImagePath: s.headerImagePath },
    });
    setPending(null);
    if (!res.ok) return toast({ type: "error", title: "Not saved", description: await errorMessage(res) });
    toast({ type: "success", title: "Saved", description: "Your public pages use this look now." });
    router.refresh();
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card className="p-4 sm:p-6">
        <form method="post" onSubmit={save} className="flex flex-col gap-5" noValidate>
          <ColorField id="primary" label="Main color" help="Buttons and links on your public pages." value={s.primaryColor} warning={warningFor("primaryColor")} onChange={(v) => setS((x) => ({ ...x, primaryColor: v }))} />
          <ColorField id="accent" label="Accent color" help="Progress bars and highlights." value={s.accentColor} warning={warningFor("accentColor")} onChange={(v) => setS((x) => ({ ...x, accentColor: v }))} />
          <ImageField id="logo" label="Logo" help="Shown beside your name. PNG, JPEG or WebP, under 2 MB." path={s.logoPath} alt={`${orgName} logo`} busy={pending === "logo"} onPick={(e) => upload("logo", e)} onRemove={() => setS((x) => ({ ...x, logoPath: null }))} />
          <ImageField id="header" label="Header image" help="A wide photo across the top, such as your building or an animal in your care. About 1600 by 400 pixels works well." path={s.headerImagePath} alt="" busy={pending === "header"} onPick={(e) => upload("header", e)} onRemove={() => setS((x) => ({ ...x, headerImagePath: null }))} />
          {warnings.length > 0 && (
            <Alert variant="warning">
              <AlertTitle>Some people may find these colors hard to read</AlertTitle>
              <AlertDescription>You can still save. The notes under each color say what to change.</AlertDescription>
            </Alert>
          )}
          <div>
            <Button type="submit" loading={pending === "save"} disabled={pending === "logo" || pending === "header"}>
              Save
            </Button>
          </div>
        </form>
      </Card>
      <section aria-labelledby="preview-title" className="flex flex-col gap-2">
        <h2 id="preview-title" className="text-30 font-semibold">
          Preview
        </h2>
        <p className="text-20 text-text-weak">How a giving page looks with these settings. Nothing here is live until you save.</p>
        {/* inert: a picture of the page, not a second form to tab through. */}
        <div inert className="overflow-hidden rounded-30 border border-border-weaker bg-background-body">
          <PublicShell orgName={orgName} branding={current} logoPath={s.logoPath}>
            <h3 className="font-display text-[1.75rem] leading-tight">Help an animal find a home</h3>
            <p className="text-40 leading-7">Every gift feeds, treats and shelters an animal while it waits for its family.</p>
            <div className="grid grid-cols-3 gap-2">
              {[25, 50, 100].map((a, i) => (
                <span key={a} className={i === 1 ? "flex min-h-11 items-center justify-center rounded-30 border border-border-primary bg-background-primary-weakest font-semibold text-text-primary" : "flex min-h-11 items-center justify-center rounded-30 border border-border-weak bg-background-body font-semibold"}>
                  ${a}
                </span>
              ))}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-background-weak" aria-hidden>
              <div className="h-full w-3/5" style={{ background: "var(--brand-accent)" }} />
            </div>
            <Button type="button" fullWidth>
              Give $50
            </Button>
          </PublicShell>
        </div>
      </section>
    </div>
  );
}

function ColorField({ id, label, help, value, warning, onChange }: { id: string; label: string; help: string; value: string; warning?: string; onChange: (v: string) => void }) {
  const ok = /^#[0-9a-fA-F]{6}$/.test(value);
  return (
    <FormField id={id} label={label} help={help} error={ok ? undefined : "Use a color like #1A6B3C: a # and six letters or numbers."}>
      {(f) => (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <input type="color" aria-label={`${label} picker`} value={ok ? value : "#000000"} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-11 w-14 cursor-pointer rounded-20 border border-border-weak bg-background-body p-1" />
            <Input {...f} value={value} onChange={(e) => onChange(e.target.value.trim())} maxLength={7} autoComplete="off" spellCheck={false} className="max-w-32 font-mono" />
          </div>
          {warning && <HelpText variant="warning">{warning}</HelpText>}
        </div>
      )}
    </FormField>
  );
}

function ImageField({ id, label, help, path, alt, busy, onPick, onRemove }: { id: string; label: string; help: string; path: string | null; alt: string; busy: boolean; onPick: (e: ChangeEvent<HTMLInputElement>) => void; onRemove: () => void }) {
  const url = brandingImageUrl(path);
  const inputId = useId();
  return (
    <div className="flex flex-col gap-1">
      <p id={`${id}-label`} className="text-30 font-semibold">
        {label}
      </p>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={alt} className="max-h-24 w-auto max-w-full self-start rounded-20 border border-border-weaker object-contain" />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={inputId} className="inline-flex min-h-11 cursor-pointer items-center rounded-30 px-3 text-30 font-semibold text-text-primary shadow-border-primary outline-none has-[:focus-visible]:shadow-focus">
          {busy ? "Uploading..." : url ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
          <input id={inputId} type="file" accept={BRANDING_IMAGE_TYPES.join(",")} className="sr-only" aria-describedby={`${id}-help`} disabled={busy} onChange={onPick} />
        </label>
        {url && (
          <Button type="button" variant="destructive_link" size="small" onClick={onRemove}>
            Remove
          </Button>
        )}
      </div>
      <HelpText id={`${id}-help`}>{help}</HelpText>
    </div>
  );
}
