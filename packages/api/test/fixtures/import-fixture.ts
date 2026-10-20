/**
 * Invented donors for import tests. Deterministic: the same seed gives the same file.
 * `bigFile(n)` makes n gift rows across about n/4 people, with constituent columns
 * repeated per gift the way most exported spreadsheets look.
 */
const FIRST = ["Dana", "Marcus", "Priya", "Tom", "Elena", "Jamal", "Ruth", "Kenji", "Aisha", "Walter", "Sofia", "Liam", "Grace", "Hector", "Nora", "Felix", "Yuki", "Omar", "Ingrid", "Caleb", "Mei", "Lucia", "Raj", "Miriam", "Andre", "Hannah", "Kofi", "Beatrice", "Victor", "Chloe"];
const LAST = ["Rivera", "Chen", "Natarajan", "Okafor", "Vasquez", "Washington", "Goldberg", "Sato", "Mohammed", "Brennan", "Morales", "Doyle", "Kim", "Alvarez", "Fitzgerald", "Marchetti", "Tanaka", "Haddad", "Solberg", "Thornton", "Wong", "Ferreira", "Patel", "Levine", "Baptiste", "Schmidt", "Mensah", "Lindqvist", "Petrov", "Dubois"];
const FUNDS = ["General", "Food purchasing", "Building"];
const CAMPAIGNS = ["Spring appeal", "Fall appeal", "Gala", ""];

export const HEADERS = ["Donor ID", "First Name", "Last Name", "Email", "Phone", "Address", "City", "State", "Zip", "Amount", "Date", "Fund", "Campaign", "Method", "Check No"];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

export function bigFile(rows: number, seed = 7, tag = "x"): string[][] {
  const r = rng(seed);
  const people = Math.max(1, Math.round(rows / 4));
  const out: string[][] = [];
  for (let i = 0; i < rows; i++) {
    const p = Math.floor(r() * people);
    const first = FIRST[p % FIRST.length]!;
    const last = `${LAST[Math.floor(p / FIRST.length) % LAST.length]!}${p >= FIRST.length * LAST.length ? p : ""}`;
    const email = `${first}.${last}.${p}.${tag}@example.org`.toLowerCase();
    const month = 1 + Math.floor(r() * 12);
    const day = 1 + Math.floor(r() * 28);
    const year = 2023 + Math.floor(r() * 3);
    const method = ["Check", "Cash", "Visa", "ACH"][Math.floor(r() * 4)]!;
    out.push([
      `D-${tag}-${p}`, first, last, email, `217-555-${String(1000 + (p % 9000)).padStart(4, "0")}`, `${100 + p} Elm St`, "Springfield", "IL", "62701",
      `$${[25, 50, 100, 250, 500][Math.floor(r() * 5)]}`, `${month}/${day}/${year}`, FUNDS[Math.floor(r() * FUNDS.length)]!,
      CAMPAIGNS[Math.floor(r() * CAMPAIGNS.length)]!, method, method === "Check" ? String(1000 + i) : "",
    ]);
  }
  return out;
}

/** Twelve rows with every kind of trouble the wizard must handle. */
export function messyFile(tag: string): string[][] {
  return [
    ["", "Dana", "Rivera", `dana.${tag}@example.org`, "217-555-0100", "12 Elm St", "Springfield", "il", "62701", "$100.00", "3/14/2025", "General", "Spring appeal", "check", "1001"],
    ["", "Dana", "Rivera", `DANA.${tag}@Example.org`, "", "12 Elm St", "Springfield", "IL", "62701", "50", "2025-06-01", "General", "", "cash", ""],
    ["", "Rivera,", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["", "Tom", "Okafor", "not-an-email", "", "", "", "", "", "25", "4/1/2025", "", "", "", ""],
    ["", "Priya", "Natarajan", `priya.${tag}@example.org`, "12", "", "", "", "", "(40.00)", "5/2/2025", "General", "", "Visa", ""],
    ["", "Hector", "Alvarez", "", "", "", "", "", "", "75", "someday", "Building", "", "", ""],
    ["", "Grace", "Kim", `grace.${tag}@example.org`, "", "", "", "", "", "", "", "", "", "", ""],
    ["", "Marcus", "Chen", `marcus.${tag}@example.org`, "", "", "", "", "", "200", "1/5/2025", "New Roof Fund", "Capital campaign", "Stock", ""],
    ["", "Kenji", "Sato", "", "", "", "", "", "", "30", "2/2/2025", "General", "", "barter", ""],
    ["", "Walter", "Brennan", `walter.${tag}@example.org`, "", "", "", "", "", "0", "2/2/2025", "General", "", "", ""],
    ["", "Ruth", "Goldberg", "", "", "", "", "", "", "45", "13/2/2025", "General", "", "cash", ""],
    ["", "Elena", "Vasquez", `elena.${tag}@example.org`, "", "", "", "", "", "60", "3/3/2027", "General", "", "cash", ""],
  ];
}

export function toCsv(headers: string[], rows: string[][]): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n") + "\n";
}
