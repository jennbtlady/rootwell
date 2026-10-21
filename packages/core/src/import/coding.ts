/**
 * Matching the fund, campaign and appeal names in an import file to the ones the
 * organization already has. "General" in a file should become "General operating", not a
 * second fund. The person confirms every suggestion before the import runs.
 */
export type CodingField = "fund" | "campaign" | "appeal";
export const CODING_FIELDS: CodingField[] = ["fund", "campaign", "appeal"];

export type CodingSuggestion = { id: string | null; how: "exact" | "similar" | "none" };

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** Same name or code is exact. Otherwise one existing name that shares every word of the shorter name is similar. */
export function suggestCoding(value: string, existing: { id: string; name: string; code: string | null }[]): CodingSuggestion {
  const v = value.trim().toLowerCase();
  const exact = existing.find((e) => e.name.trim().toLowerCase() === v || (e.code ?? "").trim().toLowerCase() === v);
  if (exact) return { id: exact.id, how: "exact" };
  const vw = words(value);
  if (vw.length === 0) return { id: null, how: "none" };
  const similar = existing.filter((e) => {
    const ew = words(e.name);
    const [short, long] = vw.length <= ew.length ? [vw, ew] : [ew, vw];
    return short.length > 0 && short.every((w) => long.some((l) => l === w || (w.length >= 4 && l.startsWith(w))));
  });
  // Only suggest when the answer is clear. Two possible funds means the person chooses.
  return similar.length === 1 ? { id: similar[0]!.id, how: "similar" } : { id: null, how: "none" };
}
