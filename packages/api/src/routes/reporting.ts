import { Hono } from "hono";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { withRls, type RlsTx } from "@maple/db";
import { REPORT_IDS, REPORTS, reportParams, toCsv, unknownMergeFields } from "@maple/core";
import {
  createShareLink,
  getDashboard,
  listAckQueue,
  listShareLinks,
  listTemplates,
  recordAcks,
  redactForBoard,
  refreshDashboard,
  renderAcks,
  revokeShareLink,
  runReport,
  saveTemplate,
  setHideBoardNames,
  statementDonors,
  recordStatementSends,
  toPrint,
  letterhead,
} from "@maple/core/services";
import type { ApiEnv } from "../env";
import { getDb } from "../db";
import { validate } from "../validate";
import { getMailer, textToHtml } from "../email/mailer";
import { renderLetters, renderStatements } from "../pdf/documents";

const orgParam = z.object({ orgId: z.string().uuid() });
const idParam = orgParam.extend({ id: z.string().uuid() });
const giftIds = z.array(z.string().uuid()).min(1).max(1000);

async function roleIn(tx: RlsTx, orgId: string): Promise<{ role: string | null; hideNames: boolean }> {
  const r = await tx.execute(sql`select m.role, o.hide_board_names from org_memberships m join organizations o on o.id = m.org_id where m.org_id = ${orgId} and m.user_id = app.uid() and m.status = 'active'`);
  const x = r[0] as { role: string; hide_board_names: boolean } | undefined;
  return { role: x?.role ?? null, hideNames: x?.hide_board_names ?? true };
}
const forbidden = { error: "You do not have permission to do that." };

export const reporting = new Hono<ApiEnv>()
  // ---- dashboard
  .get("/:orgId/dashboard", validate("param", orgParam), async (c) => {
    const { orgId } = c.req.valid("param");
    const out = await withRls(getDb(), c.get("claims"), async (tx) => {
      const { role, hideNames } = await roleIn(tx, orgId);
      if (!role) return null;
      const snap = await getDashboard(tx, orgId);
      if (!snap) return null;
      return role === "board_viewer" ? { ...snap, data: redactForBoard(snap.data, hideNames) } : snap;
    });
    if (!out) return c.json({ error: "Not found" }, 404);
    return c.json(out);
  })
  .post("/:orgId/dashboard/refresh", validate("param", orgParam), async (c) => {
    const { orgId } = c.req.valid("param");
    const out = await withRls(getDb(), c.get("claims"), async (tx) => {
      const { role, hideNames } = await roleIn(tx, orgId);
      if (!role) return null;
      const snap = await refreshDashboard(tx, orgId);
      return snap && role === "board_viewer" ? { ...snap, data: redactForBoard(snap.data, hideNames) } : snap;
    });
    if (!out) return c.json({ error: "Not found" }, 404);
    return c.json(out);
  })
  // ---- board sharing (owners and admins; RLS enforces)
  .get("/:orgId/board-links", validate("param", orgParam), async (c) => {
    const { orgId } = c.req.valid("param");
    const items = await withRls(getDb(), c.get("claims"), (tx) => listShareLinks(tx, orgId));
    return c.json({ items });
  })
  .post("/:orgId/board-links", validate("param", orgParam), validate("json", z.object({ label: z.string().trim().min(1).max(80) })), async (c) => {
    const { orgId } = c.req.valid("param");
    const created = await withRls(getDb(), c.get("claims"), (tx) => createShareLink(tx, orgId, c.req.valid("json").label));
    return c.json(created, 201);
  })
  .delete("/:orgId/board-links/:id", validate("param", idParam), async (c) => {
    const { orgId, id } = c.req.valid("param");
    const ok = await withRls(getDb(), c.get("claims"), (tx) => revokeShareLink(tx, orgId, id));
    if (!ok) return c.json({ error: "Not found" }, 404);
    return c.body(null, 204);
  })
  .patch("/:orgId/board-settings", validate("param", orgParam), validate("json", z.object({ hideBoardNames: z.boolean() })), async (c) => {
    const { orgId } = c.req.valid("param");
    const ok = await withRls(getDb(), c.get("claims"), (tx) => setHideBoardNames(tx, orgId, c.req.valid("json").hideBoardNames));
    if (!ok) return c.json(forbidden, 403);
    return c.json({ ok: true });
  })
  // ---- reports
  .get("/:orgId/reports/:reportId", validate("param", orgParam.extend({ reportId: z.enum(REPORT_IDS) })), validate("query", reportParams.extend({ format: z.enum(["json", "csv"]).default("json") })), async (c) => {
    const { orgId, reportId } = c.req.valid("param");
    const { format, ...params } = c.req.valid("query");
    const result = await withRls(getDb(), c.get("claims"), async (tx) => {
      const { role } = await roleIn(tx, orgId);
      if (!role) return "missing" as const;
      if (role === "board_viewer") return "forbidden" as const;
      return runReport(tx, orgId, reportId, params);
    });
    if (result === "missing") return c.json({ error: "Not found" }, 404);
    if (result === "forbidden") return c.json(forbidden, 403);
    if (format === "csv") {
      const title = REPORTS.find((r) => r.id === reportId)!.title.toLowerCase().replace(/\s+/g, "-");
      const rows = result.totals ? [...result.rows, result.totals] : result.rows;
      // The file name says which dates the numbers cover, so it can be checked against the page.
      const dates = result.range ? `${result.range.from}-to-${result.range.to}` : new Date().toISOString().slice(0, 10);
      return c.body(toCsv(result.columns, rows), 200, { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${title}-${dates}.csv"` });
    }
    return c.json(result);
  })
  // ---- acknowledgment templates and queue
  .get("/:orgId/ack-templates", validate("param", orgParam), async (c) => {
    const { orgId } = c.req.valid("param");
    const items = await withRls(getDb(), c.get("claims"), (tx) => listTemplates(tx, orgId));
    return c.json({ items });
  })
  .put("/:orgId/ack-templates", validate("param", orgParam), validate("json", z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(80), channel: z.enum(["letter", "email"]), subject: z.string().trim().max(200).nullable(), body: z.string().trim().min(1).max(10000), signature: z.string().trim().max(500).nullable() })), async (c) => {
    const { orgId } = c.req.valid("param");
    const t = c.req.valid("json");
    const unknown = unknownMergeFields(`${t.subject ?? ""} ${t.body} ${t.signature ?? ""}`);
    if (unknown.length) return c.json({ error: "Invalid input", issues: [{ path: "body", message: `Unknown merge field: ${unknown.map((u) => `{{${u}}}`).join(", ")}` }] }, 400);
    const saved = await withRls(getDb(), c.get("claims"), (tx) => saveTemplate(tx, orgId, t));
    return c.json(saved);
  })
  .get("/:orgId/ack-queue", validate("param", orgParam), validate("query", z.object({ limit: z.coerce.number().int().min(1).max(500).default(100), offset: z.coerce.number().int().min(0).default(0) })), async (c) => {
    const { orgId } = c.req.valid("param");
    const result = await withRls(getDb(), c.get("claims"), (tx) => listAckQueue(tx, orgId, c.req.valid("query")));
    return c.json(result);
  })
  .post("/:orgId/acks/preview", validate("param", orgParam), validate("json", z.object({ giftIds: giftIds.max(1), templateId: z.string() })), async (c) => {
    const { orgId } = c.req.valid("param");
    const { giftIds: ids, templateId } = c.req.valid("json");
    const out = await withRls(getDb(), c.get("claims"), async (tx) => {
      const t = (await listTemplates(tx, orgId)).find((x) => x.id === templateId);
      return t ? (await renderAcks(tx, orgId, ids, t)).docs[0] ?? null : null;
    });
    if (!out) return c.json({ error: "Not found" }, 404);
    return c.json(out);
  })
  .post("/:orgId/acks/email", validate("param", orgParam), validate("json", z.object({ giftIds, templateId: z.string() })), async (c) => {
    const { orgId } = c.req.valid("param");
    const { giftIds: ids, templateId } = c.req.valid("json");
    const claims = c.get("claims");
    const rendered = await withRls(getDb(), claims, async (tx) => {
      const t = (await listTemplates(tx, orgId)).find((x) => x.id === templateId && x.channel === "email");
      return t ? { t, ...(await renderAcks(tx, orgId, ids, t)) } : null;
    });
    if (!rendered) return c.json({ error: "Choose an email template." }, 400);
    const mailer = getMailer();
    const results: { giftId: string; channel: "email"; status: "sent" | "failed"; recipient: string | null; error: string | null; templateId: string }[] = [];
    let skipped = 0;
    for (const d of rendered.docs) {
      if (!d.to.email || d.doNotEmail) {
        skipped++;
        continue;
      }
      try {
        const body = `${d.body}\n\n${d.signature ?? ""}`.trim();
        await mailer.send({ to: d.to.email, subject: d.subject ?? `Thank you from ${rendered.org.name}`, text: body, html: textToHtml(body) });
        results.push({ giftId: d.giftId, channel: "email", status: "sent", recipient: d.to.email, error: null, templateId });
      } catch (e) {
        results.push({ giftId: d.giftId, channel: "email", status: "failed", recipient: d.to.email, error: (e as Error).message.slice(0, 300), templateId });
      }
    }
    await withRls(getDb(), claims, (tx) => recordAcks(tx, orgId, results));
    const failed = results.filter((r) => r.status === "failed");
    return c.json({ sent: results.length - failed.length, failed: failed.length, skipped, firstError: failed[0]?.error ?? null });
  })
  .post("/:orgId/acks/letters", validate("param", orgParam), validate("json", z.object({ giftIds, templateId: z.string(), markSent: z.boolean().default(false) })), async (c) => {
    const { orgId } = c.req.valid("param");
    const { giftIds: ids, templateId, markSent } = c.req.valid("json");
    const out = await withRls(getDb(), c.get("claims"), async (tx) => {
      const t = (await listTemplates(tx, orgId)).find((x) => x.id === templateId && x.channel === "letter");
      if (!t) return null;
      const r = await renderAcks(tx, orgId, ids, t);
      if (markSent) await recordAcks(tx, orgId, r.docs.map((d) => ({ giftId: d.giftId, channel: "letter" as const, status: "sent" as const, recipient: d.to.addressLines.join(", ") || null, error: null, templateId })));
      return r;
    });
    if (!out) return c.json({ error: "Choose a letter template." }, 400);
    const pdf = await renderLetters(out.org, out.docs);
    return c.body(new Uint8Array(pdf), 200, { "content-type": "application/pdf", "content-disposition": `attachment; filename="thank-you-letters-${new Date().toISOString().slice(0, 10)}.pdf"` });
  })
  .post("/:orgId/acks/mark", validate("param", orgParam), validate("json", z.object({ giftIds, method: z.enum(["letter", "email", "phone", "in_person"]) })), async (c) => {
    const { orgId } = c.req.valid("param");
    const { giftIds: ids, method } = c.req.valid("json");
    await withRls(getDb(), c.get("claims"), (tx) => recordAcks(tx, orgId, ids.map((giftId) => ({ giftId, channel: method, status: "marked" as const, recipient: null, error: null, templateId: null }))));
    return c.json({ marked: ids.length });
  })
  // ---- annual statements (owners and admins)
  .get("/:orgId/statements/:year", validate("param", orgParam.extend({ year: z.coerce.number().int().min(2000).max(2100) })), async (c) => {
    const { orgId, year } = c.req.valid("param");
    const out = await withRls(getDb(), c.get("claims"), async (tx) => {
      const { role } = await roleIn(tx, orgId);
      if (role !== "owner" && role !== "admin") return null;
      return statementDonors(tx, orgId, year);
    });
    if (!out) return c.json(forbidden, 403);
    return c.json({ donors: out.map((d) => ({ constituentId: d.constituentId, name: d.name, email: d.email, doNotEmail: d.doNotEmail, hasAddress: d.addressLines.length > 0, gifts: d.gifts.length, total: d.total, deductibleTotal: d.deductibleTotal, emailedAt: d.emailedAt, printedAt: d.printedAt })) });
  })
  .post(
    "/:orgId/statements/:year/pdf",
    validate("param", orgParam.extend({ year: z.coerce.number().int().min(2000).max(2100) })),
    // only "to_print": just the donors without email, and record that theirs were printed.
    validate("json", z.object({ constituentIds: z.array(z.string().uuid()).max(5000).optional(), only: z.enum(["to_print"]).optional() })),
    async (c) => {
      const { orgId, year } = c.req.valid("param");
      const body = c.req.valid("json");
      const out = await withRls(getDb(), c.get("claims"), async (tx) => {
        const { role } = await roleIn(tx, orgId);
        if (role !== "owner" && role !== "admin") return null;
        const all = await statementDonors(tx, orgId, year, body.constituentIds);
        const donors = body.only === "to_print" ? all.filter(toPrint) : all;
        if (body.only === "to_print" && donors.length) {
          await recordStatementSends(tx, orgId, year, donors.map((d) => ({ constituentId: d.constituentId, channel: "print" as const, status: "sent" as const, recipient: null, error: null })));
        }
        return { org: await letterhead(tx, orgId), donors };
      });
      if (!out) return c.json(forbidden, 403);
      if (!out.donors.length) return c.json({ error: "There are no statements to print for that year." }, 409);
      const pdf = await renderStatements(out.org, year, out.donors);
      const name = body.only === "to_print" ? `${year}-statements-to-print.pdf` : `${year}-giving-statements.pdf`;
      return c.body(new Uint8Array(pdf), 200, { "content-type": "application/pdf", "content-disposition": `attachment; filename="${name}"` });
    },
  )
  // Emails each donor their statement once. Donors already emailed for that year are skipped
  // unless resend is true, so a second click never sends duplicate tax letters.
  .post("/:orgId/statements/:year/email", validate("param", orgParam.extend({ year: z.coerce.number().int().min(2000).max(2100) })), validate("json", z.object({ constituentIds: z.array(z.string().uuid()).max(5000).optional(), resend: z.boolean().default(false) })), async (c) => {
    const { orgId, year } = c.req.valid("param");
    const out = await withRls(getDb(), c.get("claims"), async (tx) => {
      const { role } = await roleIn(tx, orgId);
      if (role !== "owner" && role !== "admin") return null;
      return { org: await letterhead(tx, orgId), donors: await statementDonors(tx, orgId, year, c.req.valid("json").constituentIds) };
    });
    if (!out) return c.json(forbidden, 403);
    const mailer = getMailer();
    const resend = c.req.valid("json").resend;
    let sent = 0;
    let skipped = 0;
    let alreadySent = 0;
    const failures: string[] = [];
    const records: { constituentId: string; channel: "email"; status: "sent" | "failed"; recipient: string | null; error: string | null }[] = [];
    for (const d of out.donors) {
      if (toPrint(d)) {
        skipped++;
        continue;
      }
      if (d.emailedAt && !resend) {
        alreadySent++;
        continue;
      }
      try {
        const pdf = await renderStatements(out.org, year, [d]);
        const text = `Dear ${d.name},\n\nAttached is your ${year} giving statement from ${out.org.name}. Thank you for your support this year.\n\nPlease keep it for your tax records.\n\n${out.org.name}`;
        await mailer.send({ to: d.email!, subject: `Your ${year} giving statement from ${out.org.name}`, text, html: textToHtml(text), attachments: [{ filename: `${year}-giving-statement.pdf`, content: pdf, contentType: "application/pdf" }] });
        sent++;
        records.push({ constituentId: d.constituentId, channel: "email", status: "sent", recipient: d.email, error: null });
      } catch (e) {
        const message = (e as Error).message.slice(0, 200);
        failures.push(message);
        records.push({ constituentId: d.constituentId, channel: "email", status: "failed", recipient: d.email, error: message });
      }
    }
    if (records.length) await withRls(getDb(), c.get("claims"), (tx) => recordStatementSends(tx, orgId, year, records));
    return c.json({ sent, skipped, alreadySent, failed: failures.length, firstError: failures[0] ?? null });
  });
