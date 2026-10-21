import type { SetupKey } from "@maple/core/services";

/** Plain names for each setup step. The walkthrough (components/setup) and Home share them. */
export const SETUP_COPY: Record<SetupKey, { title: string; detail: string }> = {
  profile: { title: "About your organization", detail: "Your EIN and mailing address, for thank-you letters and tax statements." },
  funds: { title: "Where gifts go", detail: "The pots of money gifts go into, like General operating." },
  rules: { title: "How gifts are recorded", detail: "The recommended rules, accepted in one click." },
  donors: { title: "Your donors", detail: "Bring in a spreadsheet, or add a few people." },
  team: { title: "Your team", detail: "Invite the people who help. Optional." },
  thanks: { title: "Your thank-you letter", detail: "Check the letter donors will get, and who signs it." },
  online: { title: "Take gifts online", detail: "Optional. Connect Stripe and make a giving page." },
};
