/** The setup walkthrough's steps, in order. Shared by the server page and the client wizard. */
export const WIZARD_STEPS = [
  { key: "profile", title: "About your organization", short: "Your organization" },
  { key: "funds", title: "Where gifts go", short: "Funds" },
  { key: "rules", title: "How gifts are recorded", short: "Gift rules" },
  { key: "donors", title: "Your donors", short: "Donors" },
  { key: "team", title: "Your team", short: "Team" },
  { key: "thanks", title: "Your thank-you letter", short: "Thank-you letter" },
  { key: "done", title: "You're ready", short: "Done" },
] as const;
export type WizardKey = (typeof WIZARD_STEPS)[number]["key"];
