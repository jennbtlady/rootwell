import type { Gift } from "@maple/core/services";

/**
 * The extras an online donor added to a gift (fundraising Phase 2), in a line under the fund:
 * the animal they sponsored, who the gift honors, and their message.
 */
export function GiftExtras({ g }: { g: Pick<Gift, "sponsorAnimalName" | "tribute" | "donorMessage"> }) {
  const parts = [
    g.sponsorAnimalName ? `Sponsoring ${g.sponsorAnimalName}` : null,
    g.tribute ? `${g.tribute.kind === "honor" ? "In honor of" : "In memory of"} ${g.tribute.honoreeName}` : null,
  ].filter(Boolean);
  if (!parts.length && !g.donorMessage) return null;
  return (
    <span className="mt-0.5 block text-20 text-text-weak">
      {parts.join(". ")}
      {g.donorMessage && (
        <span className="block whitespace-pre-line italic">
          <span className="sr-only">Donor&rsquo;s message: </span>&ldquo;{g.donorMessage}&rdquo;
        </span>
      )}
    </span>
  );
}
