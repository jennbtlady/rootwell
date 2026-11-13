"use client";

import { useState } from "react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, FormField, Textarea, useToast } from "@/components/ui";

/**
 * Share or embed a giving page (fundraising Phase 1): the link, and the snippet that puts the
 * form on the nonprofit's own website. One snippet works on WordPress and on a custom site.
 */
export function EmbedCode({ origin, slug, active }: { origin: string; slug: string; active: boolean }) {
  const toast = useToast();
  const [copied, setCopied] = useState<string | null>(null);
  const link = `${origin}/give/${slug}`;
  const snippet = `<script src="${origin}/embed.js" data-rootwell-give="${slug}" async></script>`;

  async function copy(what: "link" | "code", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast({ type: "error", title: "Not copied", description: "Select the text and copy it yourself." });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Share and embed</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <CardDescription>{active ? "Send people the link, or put the form right on your own website." : "This page is turned off. Turn it on before you share it."}</CardDescription>
        <div className="flex flex-wrap items-center gap-2">
          <a href={link} target="_blank" rel="noopener" className="break-all text-30 text-text-link underline">
            {link}
          </a>
          <Button type="button" variant="secondary" size="small" onClick={() => copy("link", link)}>
            {copied === "link" ? "Copied" : "Copy link"}
          </Button>
        </div>
        <FormField
          id="embed-code"
          label="Code for your website"
          help="WordPress: add a Custom HTML block where the form should go, and paste this in. Other sites: paste it into the page's HTML. The form grows to fit, and payment opens on Stripe's secure page."
        >
          {(f) => <Textarea {...f} readOnly rows={3} value={snippet} className="font-mono text-20" onFocus={(e) => e.currentTarget.select()} />}
        </FormField>
        <div>
          <Button type="button" variant="secondary" size="small" onClick={() => copy("code", snippet)}>
            {copied === "code" ? "Copied" : "Copy code"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
