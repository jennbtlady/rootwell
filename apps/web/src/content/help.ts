/**
 * The knowledge base. Plain language for a volunteer treasurer. Each article is a few short
 * sections; a section's `steps` render as a numbered list. Keep these true to the app: when
 * a screen changes, change its article in the same pull request.
 */
export type HelpArticle = {
  slug: string;
  title: string;
  summary: string;
  topic: "Start here" | "Gifts" | "Donors" | "Thank-yous and reports" | "Connections" | "Your account";
  sections: { heading?: string; text?: string[]; steps?: string[] }[];
};

export const HELP: HelpArticle[] = [
  {
    slug: "getting-started",
    title: "Getting started",
    summary: "The five things to do first, in about 30 minutes.",
    topic: "Start here",
    sections: [
      { text: ["Open your organization and choose Get set up on the Overview page. It lists each step and ticks it off when it is done. You can do them in any order and stop any time."] },
      {
        heading: "The steps",
        steps: [
          "Add your funds, like General operating or Building. Add campaigns and appeals if you use them.",
          "Choose your gift entry rules: which fields every gift needs.",
          "Bring in your donors with a spreadsheet import, or add a few by hand.",
          "Invite your team.",
          "Write your thank-you letter and email once, so you can reuse them.",
        ],
      },
      { text: ["Want to look around first? The sample organization is full of made-up donors and gifts. Nothing in it is real, and you can remove it when you are done."] },
    ],
  },
  {
    slug: "enter-gifts",
    title: "Entering gifts and posting a batch",
    summary: "Gifts go into a batch, like a deposit slip. An admin posts the batch when it matches the bank.",
    topic: "Gifts",
    sections: [
      {
        steps: [
          "Go to Gifts and choose New batch. Enter the deposit date, and the total and number of checks if you have them.",
          "Add each gift: find the donor, enter the amount, fund, and payment type. The form tells you if a required field is missing.",
          "When the batch total matches the deposit, an owner or admin chooses Post batch. Posted gifts are locked so the books stay right.",
        ],
      },
      { heading: "Made a mistake after posting?", text: ["Posted gifts cannot be edited, so the history stays honest. Ask an admin to add a correcting gift in a new batch. Every change is recorded on the gift's history."] },
    ],
  },
  {
    slug: "import",
    title: "Importing a spreadsheet",
    summary: "Bring donors and gifts over from another system or a spreadsheet.",
    topic: "Donors",
    sections: [
      {
        steps: [
          "Save your spreadsheet as a CSV file. Most programs have this under Save as or Export.",
          "Go to Settings, Imports, and upload the file.",
          "Match each column to a field. Columns you do not need can be skipped.",
          "Review possible duplicates. Choose whether each row is someone already here or someone new.",
          "Commit the import.",
        ],
      },
      { heading: "Changed your mind?", text: ["An import can be rolled back from the Imports page. Everything it added is removed."] },
    ],
  },
  {
    slug: "duplicates",
    title: "Finding and merging duplicates",
    summary: "When the same person is in your records twice.",
    topic: "Donors",
    sections: [
      { text: ["Data health lists pairs that look like the same person, for example the same name and email. Open a pair to compare them side by side."] },
      { steps: ["Choose which details to keep from each record.", "Choose the Merge button. Gifts, notes, and tags move to the record you keep.", "If they are different people, choose These are different people and the pair stops showing."] },
      { heading: "Undo", text: ["A merge can be undone for 30 days from Merge history."] },
    ],
  },
  {
    slug: "thank-yous",
    title: "Thank-you letters and year-end statements",
    summary: "Thank donors in bulk, and send each donor a statement for their taxes.",
    topic: "Thank-yous and reports",
    sections: [
      { text: ["Thank-yous lists every posted gift that has not been thanked yet. Choose gifts and send emails, print letters, or mark them as thanked by phone."] },
      { heading: "Year-end statements", text: ["Each January, go to Thank-yous, Statements. Pick last year and download one PDF with a statement for every donor, or email each donor theirs. Statements show the deductible amount of each gift."] },
    ],
  },
  {
    slug: "online-giving",
    title: "Taking gifts online with Stripe",
    summary: "A giving page that adds each gift to your records for you.",
    topic: "Connections",
    sections: [
      {
        steps: [
          "Go to Settings, Integrations, and choose Connect Stripe. Sign in to Stripe, or make a free account.",
          "Go to Settings, Giving pages, and make a page. Pick the funds donors can choose and the suggested amounts.",
          "Share the page's link in emails, on social media, or on your website.",
        ],
      },
      { heading: "What happens next", text: ["Each gift is added for you and matched to the donor if they are already here. When Stripe pays out to your bank, the deposit becomes a batch. Check it against the bank and post it like any other batch."] },
      { heading: "Refunds", text: ["A refund shows on Data health. Decide whether to adjust or remove the gift, then mark it as done."] },
    ],
  },
  {
    slug: "mailchimp",
    title: "Sending your list to Mailchimp",
    summary: "Keep a Mailchimp audience up to date with names, emails, and tags.",
    topic: "Connections",
    sections: [
      { steps: ["In Mailchimp, make an API key: your profile, then Extras, then API keys.", "In Settings, Integrations, paste the key and choose an audience.", "Choose Sync now whenever you want Mailchimp to catch up."] },
      { text: ["People marked do not email, do not contact, or deceased are kept off the list. Anyone who unsubscribed in Mailchimp stays unsubscribed."] },
    ],
  },
  {
    slug: "quickbooks",
    title: "Sending deposits to QuickBooks",
    summary: "Download posted batches as journal entries for QuickBooks Online.",
    topic: "Connections",
    sections: [
      { steps: ["In Settings, Integrations, enter your bank, fees, and income account names exactly as they appear in QuickBooks.", "Give each fund its own income account under Settings, Funds, if you want.", "Download journal entries for a date range, or from a posted batch.", "In QuickBooks Online, choose Settings, Import data, Journal entries, and pick the file."] },
    ],
  },
  {
    slug: "billing",
    title: "Billing, trials, and if you stop paying",
    summary: "One monthly price, a 30-day free trial, and your data is always yours.",
    topic: "Your account",
    sections: [
      { text: ["Every new organization starts with a 30-day free trial. The owner can subscribe any time under Settings, Billing. Trial days left still count after you subscribe."] },
      { heading: "If a payment fails", text: ["Everything keeps working while Stripe tries the card again. The owner can update the card from Manage billing."] },
      { heading: "If the subscription ends", text: ["Your account becomes read only for at least 90 days. You can still see and export everything, but nothing can be added or changed. Restart the subscription to pick up where you left off."] },
    ],
  },
  {
    slug: "account-continuity",
    title: "If the owner leaves",
    summary: "Make sure the account outlives any one person.",
    topic: "Your account",
    sections: [
      { text: ["Every organization has exactly one owner. The owner can hand the account to another active member from Team, Transfer ownership. Do this before someone leaves, and keep at least one admin besides the owner."] },
      { text: ["The Account page shows who owns the account and lets owners and admins download everything as a set of spreadsheets."] },
    ],
  },
  {
    slug: "security",
    title: "Two-step sign-in and keeping data safe",
    summary: "Why we ask for a code from your phone, and what we do with donor data.",
    topic: "Your account",
    sections: [
      { text: ["Owners and admins use two-step sign-in: a password and a code from an authenticator app. It stops someone who guesses a password from reaching your donors."] },
      { text: ["Each organization's data is walled off from every other organization by the database itself. Card numbers never reach us: Stripe handles them."] },
    ],
  },
];

export const TOPICS = ["Start here", "Gifts", "Donors", "Thank-yous and reports", "Connections", "Your account"] as const;
