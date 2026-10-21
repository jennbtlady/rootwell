import nodemailer from "nodemailer";

export type Mail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
};

export type Mailer = { send: (m: Mail) => Promise<void>; from: string };

let override: Mailer | undefined;
/** For tests. */
export function setMailer(m: Mailer | undefined) {
  override = m;
}

/**
 * Resend when RESEND_API_KEY is set; otherwise SMTP_URL (local Supabase's mail catcher is
 * smtp://127.0.0.1:54325). With neither, sending fails with a plain message.
 */
export function getMailer(): Mailer {
  if (override) return override;
  const from = process.env.EMAIL_FROM ?? "Rootwell <no-reply@example.com>";
  const key = process.env.RESEND_API_KEY;
  if (key) {
    return {
      from,
      async send(m) {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
          body: JSON.stringify({
            from, to: [m.to], subject: m.subject, text: m.text, html: m.html,
            attachments: m.attachments?.map((a) => ({ filename: a.filename, content: a.content.toString("base64") })),
          }),
        });
        if (!res.ok) throw new Error(`Email service said ${res.status}`);
      },
    };
  }
  const url = process.env.SMTP_URL;
  if (url) {
    const transport = nodemailer.createTransport(url);
    return {
      from,
      async send(m) {
        await transport.sendMail({ from, to: m.to, subject: m.subject, text: m.text, html: m.html, attachments: m.attachments });
      },
    };
  }
  return {
    from,
    async send() {
      throw new Error("Email is not set up. Add RESEND_API_KEY, or SMTP_URL for local testing.");
    },
  };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Plain paragraphs to simple, readable HTML. Template text is escaped, never trusted as HTML. */
export function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;font:16px/1.5 -apple-system,Segoe UI,Arial,sans-serif;color:#121c2d">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}
