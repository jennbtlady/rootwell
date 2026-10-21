import type { Batch } from "@maple/core/services";
import { formatMoney } from "./format";

const cents = (v: string | number | null | undefined) => (v == null ? null : Math.round(Number(v) * 100));

/** How a batch compares with its deposit slip, in words. Used by the batch page and the posting dialog. */
export function depositCheck(b: Pick<Batch, "giftTotal" | "giftCount" | "expectedTotal" | "expectedCount">) {
  const total = cents(b.giftTotal) ?? 0;
  const expected = cents(b.expectedTotal);
  const diff = expected == null ? 0 : expected - total; // positive: short, negative: over
  const countDiff = b.expectedCount == null ? 0 : b.expectedCount - b.giftCount;
  return {
    matches: diff === 0 && countDiff === 0,
    totalText: expected == null ? null : diff === 0 ? "Matches the deposit slip" : `${formatMoney(Math.abs(diff) / 100)} ${diff > 0 ? "short of" : "over"} the deposit slip (${formatMoney(expected / 100)})`,
    countText:
      b.expectedCount == null
        ? null
        : countDiff === 0
          ? `All ${b.expectedCount} gifts on the slip`
          : countDiff > 0
            ? `${countDiff} ${countDiff === 1 ? "gift" : "gifts"} fewer than the slip lists (${b.expectedCount})`
            : `${-countDiff} more ${-countDiff === 1 ? "gift" : "gifts"} than the slip lists (${b.expectedCount})`,
    diff,
    countDiff,
  };
}
