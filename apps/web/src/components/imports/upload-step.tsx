"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, errorMessage } from "@/lib/api";
import { Alert, AlertDescription, AlertTitle, Button, Radio, RadioGroup, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { parseFile, type ParsedFile } from "./parse-file";

const CHUNK = 500;

export function UploadStep({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<"constituents" | "constituents_gifts">("constituents_gifts");
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(f: File | null) {
    setFile(f);
    setParsed(null);
    setError(null);
    if (!f) return;
    setReading(true);
    try {
      setParsed(await parseFile(f));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReading(false);
    }
  }

  async function upload(e: FormEvent) {
    e.preventDefault();
    if (!parsed || !file) return;
    setError(null);
    setProgress(0);
    const created = await api().api.v1.orgs[":orgId"].imports.$post({ param: { orgId }, json: { kind, fileName: file.name, headers: parsed.headers, expectedRows: parsed.rows.length } });
    if (created.status !== 201) {
      setProgress(null);
      return setError(await errorMessage(created));
    }
    const { id } = await created.json();
    for (let i = 0; i < parsed.rows.length; i += CHUNK) {
      const res = await api().api.v1.orgs[":orgId"].imports[":id"].rows.$post({ param: { orgId, id }, json: { offset: i, rows: parsed.rows.slice(i, i + CHUNK) } });
      if (!res.ok) {
        setProgress(null);
        return setError(`The upload stopped at row ${i + 1}. ${await errorMessage(res)}`);
      }
      setProgress(Math.min(parsed.rows.length, i + CHUNK));
    }
    router.push(`/app/orgs/${orgId}/imports/${id}`);
  }

  return (
    <form onSubmit={upload} className="flex max-w-3xl flex-col gap-6" noValidate>
      <RadioGroup legend="What is in the file?">
        <Radio name="kind" value="constituents_gifts" label="People and their gifts" help="One gift per row, with the person's details repeated on each row. Most exports from other donor tools look like this." checked={kind === "constituents_gifts"} onChange={() => setKind("constituents_gifts")} />
        <Radio name="kind" value="constituents" label="People only" help="One person per row. No gift amounts." checked={kind === "constituents"} onChange={() => setKind("constituents")} />
      </RadioGroup>

      <div className="flex flex-col gap-2">
        <label htmlFor="import-file" className="text-30 font-medium leading-5">
          Spreadsheet
        </label>
        <input
          id="import-file"
          type="file"
          accept=".csv,.xlsx,.xls,text/csv"
          aria-describedby="import-file-help"
          onChange={(e) => choose(e.target.files?.[0] ?? null)}
          className="block w-full text-30 text-text file:mr-3 file:rounded-30 file:border-0 file:bg-background-weakest file:px-3 file:py-2 file:font-semibold file:text-text file:shadow-border-weak hover:file:shadow-border-primary"
        />
        <p id="import-file-help" className="text-30 leading-5 text-text-weak">
          CSV or Excel, up to 50,000 rows. The first row must be column names. The file is read on this computer; only the rows you import are sent.
        </p>
      </div>

      <div aria-live="polite">
        {reading && <p className="text-30 text-text-weak">Reading the file...</p>}
        {error && (
          <Alert variant="error">
            <AlertTitle>That file could not be used</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>

      {parsed && (
        <section className="flex flex-col gap-3">
          <p className="text-30 leading-5">
            <strong>{parsed.rows.length.toLocaleString()}</strong> rows and <strong>{parsed.headers.length}</strong> columns. The first rows:
          </p>
          <Table label="First rows of the file">
            <THead>
              <TR>
                {parsed.headers.map((h) => (
                  <TH key={h}>{h}</TH>
                ))}
              </TR>
            </THead>
            <TBody>
              {parsed.rows.slice(0, 3).map((r, i) => (
                <TR key={i}>
                  {r.map((c, j) => (
                    <TD key={j} className="max-w-48 truncate text-text-weak">
                      {c}
                    </TD>
                  ))}
                </TR>
              ))}
            </TBody>
          </Table>
          {progress !== null && (
            <div className="flex flex-col gap-1" role="status">
              <div className="h-2 w-full overflow-hidden rounded-pill bg-background-strong">
                <div className="h-full bg-background-primary transition-[width]" style={{ width: `${Math.round((progress / parsed.rows.length) * 100)}%` }} />
              </div>
              <span className="text-30 text-text-weak">
                Uploaded {progress.toLocaleString()} of {parsed.rows.length.toLocaleString()} rows
              </span>
            </div>
          )}
          <div>
            <Button type="submit" loading={progress !== null}>
              Continue to matching columns
            </Button>
          </div>
        </section>
      )}
    </form>
  );
}
