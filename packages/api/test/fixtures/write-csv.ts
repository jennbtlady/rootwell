import { writeFileSync } from "node:fs";
import { HEADERS, bigFile, messyFile, toCsv } from "./import-fixture";

// Writes the CSV fixtures the browser tests upload. Invented people only.
// Run: pnpm --filter @maple/db exec tsx ../api/test/fixtures/write-csv.ts <messy.csv> <big.csv>
writeFileSync(process.argv[2]!, toCsv(HEADERS, messyFile("e2e")));
writeFileSync(process.argv[3]!, toCsv(HEADERS, bigFile(5000, 11, "e2e")));
