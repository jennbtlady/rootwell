"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { AckTemplate } from "@maple/core/services";
import { api, errorMessage } from "@/lib/api";
import { Alert, AlertDescription, Badge, Button, Card, FormField, Input, Textarea, useToast } from "@/components/ui";

export function TemplateEditor({ orgId, template }: { orgId: string; template: AckTemplate }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(template.name);
  const [subject, setSubject] = useState(template.subject ?? "");
  const [body, setBody] = useState(template.body);
  const [signature, setSignature] = useState(template.signature ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const missingIrs = !body.includes("{{substantiation}}");

  async function save(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await api().api.v1.orgs[":orgId"]["ack-templates"].$put({
      param: { orgId },
      json: { id: template.id, name, channel: template.channel, subject: template.channel === "email" ? subject : null, body, signature: signature || null },
    });
    setPending(false);
    if (!res.ok) return setError(await errorMessage(res));
    toast({ type: "success", title: "Template saved" });
    router.refresh();
  }

  const p = `tpl-${template.id}`;
  return (
    <Card>
      <form onSubmit={save} className="flex flex-col gap-4" noValidate>
        <div className="flex items-center gap-2">
          <Badge variant="neutral">{template.channel === "email" ? "Email" : "Letter"}</Badge>
        </div>
        <FormField id={`${p}-name`} label="Name">
          {(f) => <Input {...f} value={name} onChange={(e) => setName(e.target.value)} />}
        </FormField>
        {template.channel === "email" && (
          <FormField id={`${p}-subject`} label="Subject line">
            {(f) => <Input {...f} value={subject} onChange={(e) => setSubject(e.target.value)} />}
          </FormField>
        )}
        <FormField id={`${p}-body`} label="Message" help="Leave a blank line between paragraphs.">
          {(f) => <Textarea {...f} rows={12} value={body} onChange={(e) => setBody(e.target.value)} />}
        </FormField>
        <FormField id={`${p}-sig`} label="Signature" optional>
          {(f) => <Textarea {...f} rows={4} value={signature} onChange={(e) => setSignature(e.target.value)} />}
        </FormField>
        <div aria-live="polite" className="flex flex-col gap-2">
          {missingIrs && (
            <Alert variant="warning">
              <AlertDescription>This template no longer includes {"{{substantiation}}"}. Gifts of $250 or more need that statement in writing for the donor to deduct them.</AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
        <div>
          <Button type="submit" loading={pending}>
            Save template
          </Button>
        </div>
      </form>
    </Card>
  );
}
