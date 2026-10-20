import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/** Extracts the text of each page, for asserting what a generated PDF says. */
export async function pdfPages(buf: ArrayBuffer | Uint8Array): Promise<string[]> {
  // pdfjs refuses Node Buffers, so copy into a plain Uint8Array.
  const data = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i);
    const c = await p.getTextContent();
    pages.push(c.items.map((it) => ("str" in it ? it.str : "")).join(" ").replace(/\s+/g, " "));
  }
  return pages;
}
