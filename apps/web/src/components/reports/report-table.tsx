import Link from "next/link";
import type { ReportResult } from "@maple/core";
import { formatDate, formatMoney } from "@/lib/format";
import { EmptyState, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { anchorClass } from "@/components/ui/text";

export function ReportTable({ orgId, title, result }: { orgId: string; title: string; result: ReportResult }) {
  if (result.columns.length === 0) return <EmptyState title="Choose the filters above" />;
  if (result.rows.length === 0) return <EmptyState title="No one on this list">That can be good news.</EmptyState>;
  const show = result.rows.slice(0, 500);
  const fmt = (kind: string | undefined, v: unknown) => (v == null || v === "" ? "" : kind === "money" ? formatMoney(v as string) : kind === "date" ? formatDate(String(v)) : kind === "number" ? Number(v).toLocaleString() : String(v));
  return (
    <div className="flex flex-col gap-2">
      <p className="text-30 text-text-weak">
        {result.rows.length.toLocaleString()} rows{result.rows.length > 500 ? ". The first 500 are shown; the download has them all." : "."}
      </p>
      <Table label={title}>
        <THead>
          <TR>
            {result.columns.map((c) => (
              <TH key={c.key} align={c.kind === "money" || c.kind === "number" ? "right" : "left"}>
                {c.label}
              </TH>
            ))}
          </TR>
        </THead>
        <TBody>
          {show.map((r, i) => (
            <TR key={i}>
              {result.columns.map((c) => (
                <TD key={c.key} align={c.kind === "money" || c.kind === "number" ? "right" : "left"}>
                  {c.kind === "link" && r.id ? (
                    <Link href={`/app/orgs/${orgId}/constituents/${r.id}`} className={anchorClass}>
                      {String(r[c.key])}
                    </Link>
                  ) : (
                    fmt(c.kind, r[c.key])
                  )}
                </TD>
              ))}
            </TR>
          ))}
          {result.totals && (
            <TR className="bg-background-weak font-semibold">
              {result.columns.map((c) => (
                <TD key={c.key} align={c.kind === "money" || c.kind === "number" ? "right" : "left"}>
                  {fmt(c.kind === "link" ? undefined : c.kind, result.totals![c.key])}
                </TD>
              ))}
            </TR>
          )}
        </TBody>
      </Table>
    </div>
  );
}
