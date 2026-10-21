import type { SetupStep } from "@maple/core/services";

/** Words and links for each setup step. Kept here so the setup page and the home card agree. */
export const SETUP_COPY: Record<SetupStep["key"], { title: string; detail: string; path: string; action: string }> = {
  funds: { title: "Add your funds", detail: "The buckets gifts go into, like General operating or Building. Add campaigns and appeals too if you use them.", path: "settings/coding", action: "Add funds" },
  standards: { title: "Choose your gift entry rules", detail: "Which fields every gift needs, and whether gifts wait in a batch for review before they count.", path: "settings/gift-standards", action: "Set the rules" },
  import: { title: "Bring in your donors", detail: "Upload a spreadsheet from your old system, or add people one at a time.", path: "imports", action: "Start an import" },
  team: { title: "Invite your team", detail: "Staff, an admin, or board members who only see the dashboard.", path: "settings/team", action: "Invite people" },
  thanks: { title: "Set up thank-you letters", detail: "Write the letter and email you send after a gift, once, and reuse it.", path: "acknowledgments/templates", action: "Write a template" },
  online: { title: "Take gifts online", detail: "Optional. Connect Stripe and make a giving page.", path: "settings/integrations", action: "Connect Stripe" },
};
