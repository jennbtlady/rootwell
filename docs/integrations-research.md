# Online giving integrations: research

Status: research only. Nothing here is built yet. Facts were checked on 2026-10-20 against each platform's own developer docs, help center or pricing page unless marked "unverified". Platforms change these terms often, so check again before building.

Who this is for:

- A person who runs a small nonprofit and wants to know which online gifts can flow into the CRM by themselves, and which need a file upload.
- The developer who will build it. Field names and event names are included for that reader.

How sources work in this page: every source link sits on the line under the claim it supports. "Unverified" means only a third party said it, or the official page could not be read.

## Summary

Most online giving tools that small nonprofits use fall into three groups.

1. **Tools with a free, open API we can connect to.** Givebutter, Zeffy, Square and PayPal (for gifts the nonprofit takes directly). The org pastes a key or signs in once, and gifts arrive on their own.
2. **Tools with an API that is locked behind a paid plan or a partner deal.** Donorbox (Pro plan or a $17 per month add-on), GoFundMe Pro (paid annual contract), and Meta's reporting API (needs an app that passes Meta's review).
3. **Tools with no API for nonprofits at all.** Regular GoFundMe, PayPal Giving Fund, Venmo charity profiles, Benevity and other workplace giving portals, and Network for Good (Bonterra Fundraising Essentials). The only path is to download a report and upload it through our import wizard.

Facebook, Instagram and GoFundMe gifts reach a small nonprofit through PayPal Giving Fund. The nonprofit gets the donor's name, but an email only when the donor opts in. Opt-in rates are low. No street address comes through. These gifts are receipted by PayPal Giving Fund, not by the nonprofit.

For our own donation forms, the simplest strong option is a hosted giving page on our app that hands off to Stripe Checkout on the nonprofit's own Stripe account through Stripe Connect. It is PCI SAQ A, it gets Apple Pay and Google Pay with no setup, and it works from any website builder as a link or button.

| Platform | API for the nonprofit? | Donor email? | Street address? | Our path |
| --- | --- | --- | --- | --- |
| Facebook and Instagram | Narrow, needs Meta app review | Only if donor opts in | No | CSV import |
| GoFundMe (regular) | No | Only if donor opts in | No, postal code only | CSV import |
| GoFundMe Pro (Classy) | Yes, paid plans only | Yes | Yes | CSV import first, API later if asked |
| PayPal (direct gifts) | Yes, org creates its own app | Yes | Yes | API sync |
| PayPal Giving Fund | No | Only if donor opts in | No | CSV import |
| Venmo charity profile | No | Contact info in statements, format unverified | No | CSV import |
| Zeffy | Yes, free (beta) | Yes | Yes | API sync |
| Givebutter | Yes, free | Yes | Yes | API sync |
| Donorbox | Yes, Pro plan or add-on | Yes | Yes | API sync if they have it, else CSV |
| Network for Good / Bonterra | No | Yes | Yes | CSV import |
| Benevity and workplace giving | No | Only if donor opts in | Sometimes | CSV import |
| Square | Yes, OAuth | Yes | Sometimes | API sync, low priority |

## 1. Meta: Facebook and Instagram fundraisers

### How the money flows

Since 31 October 2023, Meta works only with PayPal Giving Fund (PPGF) for nonprofits in the US, UK, Canada and Australia. Meta stopped using Meta Payments and Network for Good. A donation is a gift to PPGF, which then grants it to the nonprofit.
Source: https://www.facebook.com/government-nonprofits/blog/paypal-giving-fund
Source: https://www.facebook.com/help/2265228917040271

Those four countries are the only ones where Meta's fundraising tools exist. Meta withdrew them from the European Economic Area on 1 July 2024.
Source: https://www.facebook.com/help/1251484118194936
Source: https://fundraising.co.uk/2024/04/26/meta-announces-withdrawal-of-fundraising-products-in-eea/

Meta no longer covers processing fees. For US dollar gifts to US nonprofits the fee is 1.99% + $0.49. Donors can add an amount to cover it.
Source: https://www.facebook.com/help/android-app/286231418422971

New recurring donations on Facebook ended 15 September 2023.
Source: https://www.facebook.com/government-nonprofits/blog/paypal-giving-fund

Since 16 December 2024, US nonprofits must be enrolled with PPGF to use the main fundraising tools. Enrollment is free.
Source: https://www.facebook.com/help/2265228917040271

PPGF issues the tax receipt. Meta only sends a donation confirmation. This matters for us: the nonprofit should not send its own tax receipt for these gifts.
Source: https://www.facebook.com/government-nonprofits/blog/paypal-giving-fund

Enrolled nonprofits are paid 15 to 45 days after the gift. In the US the payment lands on the 25th of the month. Unenrolled nonprofits get a check.
Source: https://www.facebook.com/government-nonprofits/resources/basics/nonprofit-onboarding
Source: https://www.paypal.com/us/cshelp/article/help969

Older guides that say "Meta covers all fees" or "Meta pays every two weeks" describe the model before November 2023.
Source: https://www.goodunited.io/blog/facebook-fundraiser-payouts-guide

### Is there an API?

Yes, but a narrow one. Meta's Charity Reporting API returns the nonprofit's own transaction report as JSON. It holds the same data as the CSV report.
Source: https://developers.facebook.com/docs/fundraiser-api/reporting

It needs a Meta app that has passed App Review, a non-expiring Page access token with the `page_read_donations` permission granted by a Page admin, and `appsecret_proof` on each call. The flow is async: `POST /fundraisers/transactions` with a one-day range, poll the session, then page through `GET /{report_id}/transactions`. Rows arrive about two days after the gift.
Source: https://developers.facebook.com/docs/fundraiser-api/reporting
Source: https://developers.facebook.com/docs/fundraiser-api/faq

`page_read_donations` does not appear on Meta's public permissions list. Whether a new app can get it today is unverified. Vendors still describe the Fundraiser API as open to "select partners and countries". Donorfy's help center says Facebook has no API for donation data.
Source: https://developers.facebook.com/docs/permissions
Source: https://www.funraisin.co/facebook-fundraising-integration
Source: https://help-donorfy.theaccessgroup.com/en/articles/14528703-import-the-multi-day-transaction-file-from-facebook

The wider Fundraiser API (create and mirror fundraisers from another platform) sends a webhook with a payment ID but no donor details.
Source: https://developers.facebook.com/docs/fundraiser-api/faq

Plain answer: an ordinary small nonprofit cannot pull Facebook donor data by API on its own. The realistic path is the CSV report.

### What the reports contain

Meta calls its Nonprofit Manager reports "limited" and "for information only". They leave out PPGF processing fees. PPGF sends its own reports to enrolled nonprofits.
Source: https://www.facebook.com/help/1787615158233986

To download: a Page admin goes to Page Settings, Donations, Download Donation Reports, picks dates and an email address, and the CSV arrives by email. The transaction report covers up to 90 days.
Source: https://help-donorfy.theaccessgroup.com/en/articles/14528703-import-the-multi-day-transaction-file-from-facebook
Source: https://help.bloomerang.com/en/articles/13382672-facebook-fundraisers-and-bloomerang-fundraising-reports

CSV columns, as seen by an importer: Payment ID, Charge Time, Donation Amount, FB Fee, Net Payout Amount, Payout Currency, Sender Currency, Tax Amount, Tax USD Amount, Charge Action Type, Charge Date, First Name, Last Name, Email Address, Campaign ID, Fundraiser Title, Source Name, Permalink, Charity ID, Campaign Owner Name, Payment Processor, Matching Donation, Fundraiser Type, Charge Time PT. Meta does not publish this list. It comes from a vendor's import guide.
Source: https://docs.movedata.io/integrations/facebook/setting-up-facebook/

Some files also carry "Donor PSID" and "Campaign Owner PSID", which are stable Page-scoped person IDs.
Source: https://guide.beaconcrm.org/en/articles/5720137-importing-from-facebook

The API field list confirms the same data: `payment_id`, `charge_date`, `charge_action_type`, `donation_amount`, `net_payout_amount`, `first_name`, `last_name`, `email`, `fundraiser_id`, `fundraiser_title`, `fundraiser_owner_name`, `permalink_url`, `source_name`, `paypal_transaction_id`. Charge Action Type codes are S (charge), R (refund), C and D (chargebacks), K and J (chargeback reversals), N (decline).
Source: https://developers.facebook.com/docs/fundraiser-api/reporting

There is no column for recurring, no donor message, and no confirmed way to tell Instagram from Facebook.

### What donor information Meta shares

- First and last name, unless the donor chose to hide them. Blank names mean an anonymous donor.
- Email only if the donor opted to share it with the nonprofit. Reported opt-in rates are 1.5% to 10%.
- No postal address on the PPGF path. Address fields exist in the API only for the old Meta-processed path.
- The fundraiser host's name, so we can soft credit the person who ran a birthday fundraiser.

Source: https://www.facebook.com/help/adsmanagerbuiltin/1787615158233986
Source: https://www.facebook.com/help/android-app/286231418422971
Source: https://www.philanthropy.com/news/facebook-fundraising-hits-the-1-billion-mark/
Source: https://developers.facebook.com/docs/fundraiser-api/reporting

### Partners

No public Meta partner program page or application form was found.

- **GoodUnited** is a Meta Business Partner. It collects supporter contact details by messaging fundraisers and donors on Messenger, not from a Meta data feed.
  Source: https://www.goodunited.io/blog/goodunited-named-official-meta-business-partner
- **Givebutter** puts a Givebutter donate button on posts and stories. The donor pays on Givebutter, so Givebutter gets full donor details. It does not sync Meta's own fundraiser gifts.
  Source: https://help.givebutter.com/en/articles/12334348-how-to-use-the-meta-fundraising-integration
- **GoFundMe Pro (Classy)** launched a similar sharing integration in October 2024. Gifts are processed on GoFundMe Pro.
  Source: https://www.gofundme.com/c/newsroom/gofundme-and-meta-launch-first-of-its-kind-integration-to-raise-more-for-nonprofits
- **Bonterra DonorDrive** launched the same kind of integration in July 2025.
  Source: https://www.silicon.co.uk/press-release/bonterra-donordrive-and-meta-launch-new-integration-to-boost-nonprofit-fundraising-on-instagram-and-facebook
- **Funraise, Raisely, Blackbaud TeamRaiser, Qgiv and RunSignup** use the Fundraiser API to mirror peer-to-peer pages on Facebook.
  Source: https://funraise.org/integrations-facebook
  Source: https://raisely.com/integrations/facebook-fundraising
  Source: https://help.runsignup.com/support/solutions/articles/17000124727-facebook-fundraising-management-and-reports
- **Bloomerang, Donorfy, Beacon and MoveData** (for Salesforce) all use CSV import of the Meta report.
  Source: https://help.bloomerang.com/en/articles/13382672-facebook-fundraisers-and-bloomerang-fundraising-reports
  Source: https://docs.movedata.io/integrations/facebook/setting-up-facebook/

So the CRMs closest to our market import a CSV. That is the bar we need to meet.

### Import notes for the developer

- Dedupe on Payment ID. Store it as `external_id`.
- Only rows with Charge Action Type S are gifts. R, C and D reverse an earlier gift. K and J restore one. N is a decline.
- Warn the user not to open the file in Excel first. Long IDs turn into scientific notation and stop being unique.
  Source: https://guide.beaconcrm.org/en/articles/5720137-importing-from-facebook
- Donation Amount is the gross gift. Net Payout Amount is blank or zero for PPGF rows. Get the real net from the PPGF report or apply the published fee.
- Send blank-name rows to one "Anonymous Facebook donor" constituent. Match people on email or Donor PSID before name.
- Soft credit the Campaign Owner Name. Keep Fundraiser Title and Permalink in the gift reference or notes.
- Mark these gifts as receipted by PPGF so they are left out of our tax receipt run.

## 2. GoFundMe, GoFundMe Charity and Classy

### What happened

GoFundMe ended its GoFundMe Charity public API and integrations after 31 March 2021. Charities had until 31 December 2021 to export their data. Competitor blogs say the site closed in January 2022 (unverified on a GoFundMe page).
Source: https://thenonprofittimes.com/articles/tech-buying-spree-continues-as-classy-is-acquired/
Source: https://givebutter.com/blog/gofundme-charity

GoFundMe agreed to buy Classy on 6 January 2022. The deal closed by May 2022.
Source: https://thenonprofittimes.com/articles/tech-buying-spree-continues-as-classy-is-acquired/
Source: https://thenonprofittimes.com/news/acquisition-of-classy-by-gofundme-completed/

On 6 May 2025 Classy was renamed GoFundMe Pro. On 23 June 2025 GoFundMe, Inc. took over all Classy contracts.
Source: https://thenonprofittimes.com/npt_articles/gofundme-pro-launching-retiring-classy-name/
Source: https://prosupport.gofundme.com/hc/en-us/articles/37288737656091-Introducing-GoFundMe-Pro

### How a small charity gets GoFundMe money and data today

Nonprofit fundraisers on regular GoFundMe pay out through PPGF in the US, UK, Ireland, Canada and Australia. Gifts made by the 15th are paid at the end of that month.
Source: https://support.gofundme.com/hc/en-us/articles/360056093332-Receiving-nonprofit-fundraiser-payouts

GoFundMe Pay, a Stripe-based direct payout, is only for paying GoFundMe Pro customers with verified 501(c)(3) status.
Source: https://prosupport.gofundme.com/hc/en-us/articles/37288767138075-Nonprofit-Pages-on-GoFundMe

GoFundMe made Nonprofit Pages opt-in on 23 October 2025. A US nonprofit can claim its page for free. Claiming gives a free GoFundMe Pro login, which acts as the nonprofit dashboard.
Source: https://www.mnaonline.org/blog/2025/10/22/is-your-nonprofit-on-gofundme-without-your-consent-heres-what-to-do
Source: https://support.gofundme.com/hc/en-us/articles/41732842520987-Claiming-and-managing-your-US-nonprofit

In that dashboard, the "GoFundMe Channel Donations" report can be customized and exported. Data refreshes every hour. Fields: page URL and ID, source (direct or fundraiser), payment processor, donor comment, email, email opt-in, country, first name, last name, postal code, charity ID, Gift Aid, Giving Fund payout ID, gross amount, net amount, recurring (yes or no), currency, transaction date, transaction ID, status, and type.
Source: https://prosupport.gofundme.com/hc/en-us/articles/48823551669147-GoFundMe-Channel-Donations-report

Contact details appear only when the donor opted in. Anonymous gifts carry no identity. There is no street address, only postal code.
Source: https://prosupport.gofundme.com/hc/en-us/articles/48823551669147-GoFundMe-Channel-Donations-report
Source: https://www.philanthropy.com/news/gofundme-expands-its-nonprofit-offerings-and-lets-groups-see-who-is-raising-money-for-them/

Fees on certified nonprofit fundraisers: 2.2% + $0.30 in the US and Canada. There is no platform fee. Donors may tip GoFundMe.
Source: https://www.gofundme.com/c/pricing

### Is there an API?

Regular GoFundMe has no public API. GoFundMe does not say this in words, but it publishes no developer portal for it. The only API it offers is the GoFundMe Pro API.
Source: https://developers.gofundme.com/pro/overview/welcome

The GoFundMe Pro API does include endpoints to download the Nonprofit Page donations report. So GoFundMe gift data is reachable by API, but only through a Pro account with API access turned on.
Source: https://developers.gofundme.com/pro/docs

### GoFundMe Pro (Classy) API

- Host is still `api.classy.org`, version 2.0. Docs moved to developers.gofundme.com/pro.
  Source: https://developers.gofundme.com/pro/docs
- Auth is OAuth2 client credentials. Tokens last one hour.
  Source: https://developers.gofundme.com/pro/overview/authentication
- Rate limit is 1,800 requests per minute per app. Pages hold up to 100 rows.
  Source: https://developers.gofundme.com/pro/docs
- Resources include transactions, recurring donation plans, supporters, designations, dedications, fundraising pages, soft credits and payouts. Transactions carry gross, net and fee amounts, a donor-covered-fee flag, anonymous flag, dedication, company name, full billing address, phone, designation, recurring plan ID and opt-in consent.
  Source: https://developers.gofundme.com/pro/docs
- Webhooks cover supporter, transaction and recurring plan created and updated. They are delivered by Svix and must get a 2xx reply within 15 seconds.
  Source: https://prosupport.gofundme.com/hc/en-us/articles/41221411214619-Using-webhooks
- Pro and Enterprise clients make their own API app. Free plan users, third-party developers and consultants must ask the partner team through a form.
  Source: https://developers.gofundme.com/pro/overview/request-access
- No sandbox is mentioned anywhere.

Pricing is custom: "an annual upfront subscription with a transaction fee per donation". It is for US-based orgs only.
Source: https://pro.gofundme.com/c/pricing/

Third-party sites put the price at about $3,000 to $6,000 a year or more, plus a 3% platform fee (unverified).
Source: https://donorbox.org/nonprofit-blog/gofundme-pro-vs-donorbox-pro
Source: https://www.capterra.com/p/127258/Classy/pricing/

GoFundMe Pro's integrations page lists Little Green Light and Neon One through Zapier, and Bloomerang through a partner (Bytespree).
Source: https://pro.gofundme.com/c/integrations/

Plain answer: GoFundMe Pro is priced for mid-size and larger nonprofits. Few orgs with 1 to 5 staff will have it. Those that do can use a CSV export first.

## 3. Other tools small nonprofits use

### PayPal donations taken directly

This covers the Donate button, PayPal Checkout and other gifts paid straight into the nonprofit's PayPal Business account.

**API: yes.** The Transaction Search API (`GET /v1/reporting/transactions`) returns up to 31 days per call, three years back. New transactions take up to three hours to appear.
Source: https://developer.paypal.com/api/transaction-search/v1/search-get

**Data:** donor first and last name, email, full address and phone (`payer_info`), gross amount and fee, subject, note, invoice ID, custom field, and a reference type that marks subscription payments.
Source: https://developer.paypal.com/api/transaction-search/v1/definitions/payer_info
Source: https://developer.paypal.com/api/transaction-search/v1/definitions/transaction_info

There is no fund field. The fund has to come from the item name, subject or custom field the nonprofit set on its button. The Donate SDK returns `item_name`, which is the program the donor chose.
Source: https://developer.paypal.com/sdk/donate/

**Webhooks:** `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.SALE.COMPLETED` for subscription payments, and `BILLING.SUBSCRIPTION.*` for recurring plans.
Source: https://developer.paypal.com/api/rest/webhooks/event-names/

**Authentication:** two paths.

1. The nonprofit creates its own REST app in the PayPal developer dashboard, ticks "Transaction Search", and pastes the client ID and secret into our app. No PayPal approval is needed.
   Source: https://developer.paypal.com/docs/integration/direct/transaction-search/
2. We become a PayPal partner and use the Partner Referrals API to ask for transaction search access. This needs PayPal to approve our platform first.
   Source: https://developer.paypal.com/docs/multiparty/
   Source: https://developer.paypal.com/api/partner-referrals/v2/definitions/rest_endpoint_features_enum

"Log in with PayPal" only shares profile data. It gives no transaction history.
Source: https://developer.paypal.com/docs/log-in-with-paypal/

**Fees (US):** PayPal Checkout 3.49% + $0.49. Donate button 2.89% + $0.49. Confirmed charity rate 1.99% + $0.49 after PayPal approves the nonprofit. International gifts add 1.5%.
Source: https://www.paypal.com/us/webapps/mpp/merchant-fees
Source: https://www.paypal.com/us/cshelp/article/how-do-i-apply-for-the-charity-rate-help221

**No-API path:** Activity, All Reports, Activity Download. CSV, up to 12 months per file, seven years back, 50,000 rows per file. Columns include Date, Name, Type, Status, Gross, Fee, Net, From Email Address, Transaction ID, Item Title, Invoice Number, Custom Number, Note, Subject and Shipping Address.
Source: https://developer.paypal.com/docs/reports/online-reports/activity-download/

### PayPal Giving Fund

PPGF is a 501(c)(3) charity that receives gifts and grants them on. Facebook, Instagram, GoFundMe, eBay for Charity, the PayPal app, Humble Bundle and Twitch route gifts through it.
Source: https://www.paypal.com/givingfund

It charges no fees itself. Partner platforms may charge their own.
Source: https://www.paypal.com/au/cshelp/article/are-there-any-fees-charged-for-using-paypal-giving-fund--help207

Enrolled charities are paid monthly into their PayPal Business account, 15 to 45 days after the gift.
Source: https://www.paypal.com/us/cshelp/article/how-does-paypal-giving-fund-grant-donations-to-charities-help969

The charity dashboard's Activity tab lists date, donor name, email and amount, but only for donors who chose to share. It exports a CSV, 30 days per search. The exact column names are unverified.
Source: https://paypal.com/uk/cshelp/article/how-do-i-access-my-charity-dashboard-and-view-donor-information-help208

**API: none.** PPGF offers a partner path for donation platforms, not a data API for charities.
Source: https://www.paypal.com/givingfund

### Venmo

501(c)(3) nonprofits with confirmed charity status on PayPal can open a Venmo charity profile. The fee is 1.9% + $0.10 per gift, paid by the charity.
Source: https://help.venmo.com/hc/en-us/articles/6678084998291-Charity-Profile-FAQ
Source: https://help.venmo.com/hc/en-us/articles/9750561812115-Charity-Profile-Donation-Fees

Donation history lives in Venmo, not in the PayPal account. Statements download as CSV, one month per file, three years back. The column names are not published (unverified). Read the header row instead of assuming them.
Source: https://help.venmo.com/hc/en-us/articles/360016096974-Transaction-History

**API: none** for charity profiles. Venmo's own developer APIs are closed to new businesses.
Source: https://venmo.com/docs/overview

Gifts sent to a staff member's personal Venmo have no charity profile and no donor data beyond a username and a note.

### Zeffy

Zeffy is free to nonprofits and funded by optional donor tips.

**API: yes, free, in beta.** Base URL `https://api.zeffy.com/api/v1`. An admin creates a Bearer key under Settings, Integrations. Limits are 100 requests per minute and 20 per second per org. Cursor paging, up to 100 rows per page. No sandbox is mentioned.
Source: https://support.zeffy.com/get-started-with-the-zeffy-api-yourg
Source: https://www.zeffy.com/en-au/integration/api

**Data:** the payment object has buyer name, email, company, address, amount, receipt-eligible amount, currency, status, refunds, campaign, fund (ID, code, name), tribute, custom question answers, and recurring details (subscription ID, interval, status). There is no phone on the payment, and no fee or net field because Zeffy takes no fee.
Source: https://www.zeffy.com/api/docs/openapi.json

**Webhooks:** one event, `payment.completed`, with the full payment. Zeffy retries on any non-2xx reply. No signing secret is documented (unverified), so we would re-fetch the payment by ID before trusting it.
Source: https://support.zeffy.com/get-started-with-the-zeffy-api-yourg

**Exports:** "Payments" and "Itemized Payments" CSV, with all columns or a custom set. Large files are emailed. No scheduled export.
Source: https://support.zeffy.com/export-or-download-all-payments-or-tickets-associated-with-a-specific-form-u0tyj

Zeffy has no native sync to Salesforce, HubSpot or Bloomerang.
Source: https://www.zeffy.com/en-au/integration/api

### Givebutter

**API: yes, free and public.** Base URL `https://api.givebutter.com/v1`. An admin creates a Bearer key under Settings, Developers. 500 requests per minute.
Source: https://docs.givebutter.com/api-reference/authentication.md
Source: https://docs.givebutter.com/api-reference/rate-limits.md

**Data:** the transaction object is the richest of any tool here. It has first and last name, email, phone, address, amount, fee, fee covered, donated amount, payout, recurring plan ID, campaign, fund ID and code, dedication, custom fields, UTM tags, opt-in and tax-deductible amount.
Source: https://docs.givebutter.com/api-reference/transactions/get-a-transaction.md

**Webhooks:** 12 events including `transaction.succeeded`, `contact.created`, `plan.created`, `plan.canceled`, `plan.failed` and `refund.created`. Each webhook has a signing secret sent in a `Signature` header.
Source: https://docs.givebutter.com/api-reference/webhooks/create-a-webhook.md

**Pricing:** core features are free. The paid Givebutter Plus plan does not list the API or webhooks, so they appear to be free (unverified, inferred from what the page leaves out).
Source: https://help.givebutter.com/en/articles/9756989-what-is-givebutter-plus

**Exports:** "All Transactions" CSV with name, email, phone, address, fund, dedication, amount, fee, fee covered, payout, plan ID, frequency, date, soft credits and custom fields. The link is emailed. No scheduled export.
Source: https://help.givebutter.com/en/articles/2219206-export-transactions-to-csv

### Donorbox

**API: yes, behind a paywall.** Base URL `https://donorbox.org/api/v1`. HTTP Basic auth with the login email and an API key. Endpoints for campaigns, donations, plans, donors, events and tickets. Up to 100 rows per page. No published rate limit.
Source: https://github.com/donorbox/donorbox-api

**Data:** donor name and email, address, amount, processing fee, recurring flag, anonymous flag, campaign, designation, comment, employer, UTM tags and custom answers. There is no net or fee-covered field.
Source: https://github.com/donorbox/donorbox-api

**Pricing:** the "API & Zapier Integration" add-on is included with Pro ($150 per month) and most Premium plans. On the free Standard plan it costs $17 per month.
Source: https://donorbox.org/explore/pro/
Source: https://donorbox.org/zapier-integration

**Webhooks:** "Custom Webhooks" come with the same add-on. Events include `donation.created` and `donation.updated`. They are signed with HMAC-SHA256 in a `Donorbox-Signature` header. The full event list is unverified because the help page blocked reading.
Source: https://donorbox.zendesk.com/hc/en-us/articles/4733681068820-Custom-Webhooks

**Exports:** Donations, Supporters and Recurring Plans CSVs, all columns or custom. The full header list is not published.
Source: https://donorbox.org/nonprofit-blog/donation-information-page

### Network for Good and Bonterra

Bonterra bought Network for Good in 2022. The small-org product is now "Bonterra Fundraising Essentials", also called "Guided Fundraising".
Source: https://www.capterra.in/software/111128/bonterra-guided-fundraising

**API: none found** for the small-org product. Bonterra's larger EveryAction product has a REST API, but it is aimed at bigger orgs.
Source: https://docs.everyaction.com/reference

**Exports:** from the Giving tab, Bulk Actions, Export. Fields include amount charged, amount received, fee covered, payment method, campaign, date, name, email and phone. Official column names are not published.
Source: https://help.givebutter.com/en/articles/11013994-migrating-to-givebutter-from-network-for-good

The Network for Good donor-advised fund is now called "For Good". It pays on the 15th of the month with a $10 minimum. Donor name and email appear only when the source platform and the donor allow it.
Source: https://www.forgood.org/faq

### Benevity and other workplace giving portals

None of these portals offers an API to nonprofits. Benevity's developer APIs are for companies and platforms.
Source: https://developer.benevity.org/

**Benevity** sends one combined payment each month. Its donation report has, among others: Disbursement ID, Company Name, Project Name, Transaction ID, Donation Date, Donation Amount, Match Amount, Cause Support Fee, Merchant Fee, Check Fee, Donation Frequency, Donor First Name, Donor Last Name, Donor Email, donor address fields and Donor Comment. Anonymous donors show a code and "Not shared by donor". Email appears only when the donor opted in.
Source: https://docs.movedata.io/integrations/benevity/setting-up-benevity/
Source: https://causeshelp.benevity.org/hc/en-us/articles/115003028186

**YourCause (Blackbaud) NPOconnect** shows each payment with donor name and email (or anonymous), amount, designation, and whether it is a donation or a company match. It exports CSV or XLSX. Payment schedules are set by each company, usually monthly or quarterly.
Source: https://webfiles-sc1.blackbaud.com/files/support/helpfiles/npoconnect/content/npo-giving-view-payment-and-transaction-details.html

**CyberGrants (Bonterra) FrontDoor, Bright Funds and America's Charities** have nonprofit portals. Their report columns and schedules are unverified.
Source: https://www.3blmedia.com/news/innovating-incredible-frontdoor
Source: https://www.charities.org/solutions-charities

**CAF America** does not release donor information.
Source: https://cafamerica.org/wp-content/uploads/2024/09/Friends-Fund-Gift-Form-CAF-America.pdf

**United Way** varies by local chapter. Designated gifts are often paid quarterly. Some chapters charge a designation fee.
Source: https://unitedforimpact.org/resource/donor-choice-program-details

**Deed** routes gifts through PPGF, so they show up in the PPGF report.
Source: https://joindeed.notion.site/Donations-fd637faf433040cb83284f8bf803d743

Recording tip: an employee gift and the company's match should be two gifts. The employee gives the first. The company gives the match, with a soft credit to the employee.

### Square

**API: yes.** The Payments API gives amount, processing fee, buyer email, billing address, note, order ID and customer ID. The donor's name comes from the Customers API. The fund comes from the order's line item, such as a Square Online "Donation" item.
Source: https://developer.squareup.com/reference/square/objects/Payment

**Webhooks:** `payment.created`, `payment.updated`, `refund.*`, `invoice.*`, `subscription.*`, `customer.*` and `order.*`.
Source: https://developer.squareup.com/docs/webhooks/v2webhook-events-tech-ref

**Authentication:** OAuth per seller. Access tokens last 30 days and refresh tokens do not expire. Scopes include `PAYMENTS_READ`, `CUSTOMERS_READ` and `ORDERS_READ`. Any developer app gets production credentials. Listing in Square's App Marketplace is optional.
Source: https://developer.squareup.com/docs/oauth-api/overview
Source: https://developer.squareup.com/docs/app-marketplace

**Fees:** no nonprofit rate is listed. Free plan: 2.6% + 15 cents in person, 3.3% + 30 cents online.
Source: https://squareup.com/us/en/payments/our-fees

**Exports:** Dashboard, Transactions, Export, Transactions CSV, any date range. Column names are not published officially.
Source: https://squareup.com/help/us/en/article/8362

Square matters most for orgs that take cards at events. It is a lower priority for online giving.

### Where small orgs are migrating from

Our import wizard should also read exports from the CRMs small orgs leave. These have APIs, but for a one-time move a CSV is simpler.

- Bloomerang: REST API, and a full export as a ZIP of CSVs. Source: https://help.bloomerang.com/en/articles/12632641-export-bloomerang-data
- Little Green Light: API with a gift search, and a Comprehensive Export ZIP. Source: https://api.littlegreenlight.com/api-docs/static.html
- Neon CRM: API v2 with webhooks. Source: https://developer.neoncrm.com/webhooks/
- Qgiv (now part of Bloomerang): older reporting API. Source: https://www.qgiv.com/api/reporting-transactions.php
- Fundraise Up: REST API and signed webhooks. Source: https://fundraiseup.com/docs/webhooks/
- DonorPerfect: XML API on the Pro tier only. Source: https://www.donorperfect.com/XML-API
- Keela: no public API found, Zapier only (unverified). Source: https://support.keela.co/hc/en-us/articles/43096243960589-Integrate-with-Zapier

## 4. Building our own donation forms

The brief already puts a Stripe donation page in Phase 5. This section compares the ways to build it.

### Option A: Stripe Checkout (hosted page) and Payment Links

Our app shows a page at a URL like `/give/{org}`. The donor picks an amount, one-time or monthly, a fund, and whether to cover the fees. Our server then creates a Stripe Checkout Session and sends the donor to Stripe's page to pay.

- **One-time gifts:** use inline `price_data` with the donor's amount. Stripe's "customer chooses price" feature does not support recurring payments, so we would not use it.
  Source: https://docs.stripe.com/payments/checkout/pay-what-you-want
  Source: https://docs.stripe.com/api/checkout/sessions/create.md?query=line_items
- **Monthly gifts:** use `mode=subscription` with `price_data` and `recurring[interval]=month`. One session cannot offer a one-time or monthly toggle, so the toggle lives on our page.
  Source: https://docs.stripe.com/payments/checkout/how-checkout-works.md?payment-ui=stripe-hosted
- **Fund and cover-the-fees:** put them in session `metadata` and in `payment_intent_data.metadata` or `subscription_data.metadata`. Checkout also allows up to three custom fields, such as a dropdown with up to 200 options. We should keep fund choice on our page so the same logic serves every form type.
  Source: https://docs.stripe.com/payments/checkout/custom-components.md?platform=web&payment-ui=stripe-hosted
- **Donate button:** `submit_type=donate` shows "Donate" in payment and subscription mode.
  Source: https://docs.stripe.com/api/checkout/sessions/create
- **Contact details:** `billing_address_collection=required` and `phone_number_collection` collect address and phone. Subscription mode always creates a Stripe Customer.
  Source: https://docs.stripe.com/api/checkout/sessions/create
- **Apple Pay, Google Pay and Link** work on hosted Checkout and Payment Links with no domain setup.
  Source: https://docs.stripe.com/apple-pay.md?platform=web
- **Embedded Checkout** (`ui_mode=embedded_page`) puts the same Stripe form inside our page. It needs domain registration for wallets.
  Source: https://docs.stripe.com/api/checkout/sessions/create
- **Payment Links** are no-code links with "customers choose what to pay" and subscriptions. They have no per-link logic, so fund choice needs one link per fund or a custom field. They are a fallback, not the product.
  Source: https://docs.stripe.com/payment-links

### Option B: Stripe Elements with Payment Intents

We build the whole form ourselves and drop Stripe's card field (the Payment Element) and wallet buttons (the Express Checkout Element) into it.

- The "deferred intent" flow lets us show amount, frequency, fund and cover-fees first, then create the PaymentIntent or Subscription on our server when the donor submits.
  Source: https://docs.stripe.com/payments/accept-a-payment-deferred.md?platform=web&type=subscription
- For monthly gifts, the server creates a Subscription with `payment_behavior: 'default_incomplete'` and returns the first invoice's client secret.
  Source: https://docs.stripe.com/payments/accept-a-payment-deferred.md?platform=web&type=subscription
- The Express Checkout Element shows Apple Pay, Google Pay and Link, and supports a "Donate" button type. Every domain that shows it must be registered with Stripe.
  Source: https://docs.stripe.com/elements/express-checkout-element
- Stripe now steers new custom forms to Checkout Sessions with `ui_mode: 'elements'`, which keeps features like Adaptive Pricing. That mode does not allow `custom_fields` or `submit_type`.
  Source: https://docs.stripe.com/elements/express-checkout-element
- Canadian pre-authorized debit (PAD) does not work with the deferred intent flow.
  Source: https://docs.stripe.com/payments/acss-debit

This gives full control of the look, but more code, more testing, and a domain registration for each website that shows the form.

### PCI scope

Stripe maps both Checkout and Elements to SAQ A, the shortest self-assessment, because card numbers are typed into Stripe's own frames. Posting card numbers to our own server would be SAQ D. We must never do that.
Source: https://stripe.com/guides/pci-compliance

### Each nonprofit's own Stripe account: Connect

Each nonprofit should own its Stripe account. That fits the brief's continuity promise: if the org leaves us, its donors, subscriptions and money stay with it.

- **Direct charges** on Standard-style connected accounts make the nonprofit the merchant of record. Funds settle to its balance. It pays Stripe fees and handles disputes. Stripe calls this "best suited for platforms providing software as a service".
  Source: https://docs.stripe.com/connect/direct-charges.md?platform=web&ui=stripe-hosted
- **Cost to us:** when the connected account pays its own fees, Stripe says "We don't charge any Connect fees to it or to your platform." A platform application fee is optional.
  Source: https://docs.stripe.com/connect/direct-charges-fee-payer-behavior
  Source: https://stripe.com/connect/pricing
- **Onboarding:** create the account with the Accounts API, then send the admin through an Account Link. OAuth still works for orgs that already have Stripe, but Stripe says it is "not recommended for new Connect platforms."
  Source: https://docs.stripe.com/connect/standard-accounts
  Source: https://docs.stripe.com/connect/oauth-standard-accounts
- **Webhooks:** one endpoint with "Connected accounts" scope receives events for every org. Each event has an `account` field, which we map to `org_id`.
  Source: https://docs.stripe.com/connect/webhooks
- **Pasting API keys** per org is the alternative. Stripe does not recommend it for platforms. We would hold a secret and a webhook secret per org. Use it only if Connect is blocked.

Stripe Billing (already in the stack) handles our own subscription fees. Connect is a separate product on the same platform account.

### Fees

| Method | US price | Source |
| --- | --- | --- |
| Cards, Apple Pay, Google Pay, Link | 2.9% + 30 cents | https://stripe.com/pricing |
| International cards | add 1.5% | https://stripe.com/pricing |
| ACH Direct Debit | 0.8%, capped at $5 | https://stripe.com/pricing |
| Recurring gifts through Stripe Billing | add 0.7% of recurring volume | https://stripe.com/billing/pricing |
| Disputes | $15 each | https://stripe.com/pricing |
| Canada cards | 2.9% + CA$0.30 | https://stripe.com/en-ca/pricing |
| Canada pre-authorized debit | 1% + CA$0.40, capped at CA$5 | https://stripe.com/en-ca/pricing/local-payment-methods |

Apple Pay and Google Pay cost nothing extra.
Source: https://stripe.com/pricing

The 0.7% Billing fee on monthly gifts is easy to miss. It applies when monthly gifts run as Stripe Subscriptions.

### Nonprofit discounts

**Stripe:** Stripe offers a discount to registered nonprofits that send tax documents and take at least 80% of their volume as tax-deductible donations. Tickets, memberships, tuition and auction payments do not count. It is available in the US, Canada, the UK, Australia, New Zealand and listed EU countries. The org applies through a support form with its account ID.
Source: https://support.stripe.com/questions/fee-discount-for-nonprofit-organizations

Stripe does not publish the discounted rate. Third parties say 2.2% + 30 cents (unverified).
Source: https://help.goharness.com/en/articles/3159903-nonprofit-discount-for-donation-processing-on-stripe-2-2-0-30

Whether the discount applies to an account connected to our platform is unverified. Because the connected account pays its own fees at its own rates, it should apply. We should confirm with Stripe before promising it in marketing.

**PayPal:** the confirmed charity rate is 1.99% + $0.49, after PayPal approves the nonprofit.
Source: https://www.paypal.com/us/webapps/mpp/merchant-fees

### Cover the fees

Stripe's fee is a flat amount plus a percentage of the whole charge, including the extra the donor adds. To cover the fee exactly, gross up:

```
gross = (gift + fixed_fee) / (1 - percent_fee)
example: (100.00 + 0.30) / (1 - 0.029) = 103.30
```

Source: https://support.stripe.com/questions/passing-the-stripe-fee-on-to-customers (wording from search snippet; the page now redirects)

Stripe has no "fee covered" field. We store it ourselves, for example `metadata.fee_cover_cents`, and record it on the gift.
Source: https://docs.stripe.com/api/checkout/sessions/create

The org's rate may differ (discount, international card, ACH). Store the rate used on the gift so the amount can be explained later.

### How webhooks create gifts

Stripe's events map onto our gift flow like this:

- `checkout.session.completed` with `payment_status=paid`: create the gift. For ACH or PAD, wait for `checkout.session.async_payment_succeeded`.
  Source: https://docs.stripe.com/checkout/fulfillment.md?payment-ui=stripe-hosted
- `customer.subscription.created`: create the recurring plan. `invoice.paid`: create each monthly gift. `invoice.payment_failed` and `customer.subscription.deleted`: flag or close the plan.
  Source: https://docs.stripe.com/billing/subscriptions/webhooks
- `charge.refunded` and `charge.dispute.created`: mark the gift refunded or disputed. Never delete it.
  Source: https://docs.stripe.com/api/events/types
- `payout.paid`: list the payout's balance transactions (`GET /v1/balance_transactions?payout=po_...`) to build the suggested deposit batch from the brief.
  Source: https://docs.stripe.com/api/payouts/object
- The charge's balance transaction gives the fee and net amount.
  Source: https://docs.stripe.com/api/balance_transactions/object

Rules for the handler:

- Verify the `Stripe-Signature` header on the raw body.
- Reply 2xx fast and hand the work to an Inngest job.
- Stripe retries for up to three days and does not send events in order. Store each event ID and drop repeats.
- Use the Stripe object ID as `external_id` so a repeat cannot create a second gift.

Source: https://docs.stripe.com/webhooks

Stripe waits up to 10 seconds for the `checkout.session.completed` handler before showing the success page. A quick handler lets the thank-you page show the recorded gift.
Source: https://docs.stripe.com/checkout/fulfillment.md?payment-ui=stripe-hosted

Inside the job, the gift goes through the same service in `packages/core` as manual entry. The donor is matched with the same duplicate rules, and the work runs under the org's system claim with `withRls()`.

### Apple Pay and Google Pay

- Hosted Checkout and Payment Links: both work with no setup.
- Embedded Checkout and Elements: register each domain with Stripe. With Connect direct charges, register it on each connected account through the API. Stripe handles Apple's merchant check, so no file is needed on the server.
  Source: https://docs.stripe.com/apple-pay.md?platform=web
  Source: https://docs.stripe.com/payments/payment-methods/pmd-registration.md?dashboard-or-api=dashboard
- Google Pay needs HTTPS and the setting turned on.
  Source: https://docs.stripe.com/google-pay.md?platform=web
- Through PayPal's SDK, Apple Pay needs PayPal partner approval and a domain association file under `/.well-known/`. It only supports one-time payments.
  Source: https://developer.paypal.com/docs/checkout/apm/apple-pay/

### PayPal as a form option

Many donors trust PayPal and some will only give that way. Options:

- **Donate SDK:** a hosted PayPal pop-up. Simple, but recurring is not documented on that page.
  Source: https://developer.paypal.com/sdk/donate/
- **JS SDK with the Orders API** for one-time gifts. `custom_id` (up to 255 characters) carries the fund.
  Source: https://developer.paypal.com/api/orders/v2/orders-create
- **Subscriptions API** for monthly gifts. One plan can bill any amount the donor chose through an inline plan override.
  Source: https://developer.paypal.com/api/subscriptions/v1/subscriptions-create
- **Venmo button** through the same SDK: US only, US dollars, no subscriptions.
  Source: https://developer.paypal.com/docs/checkout/pay-with-venmo/
- **Multi-tenant setup:** a proper platform needs PayPal partner approval and the Partner Referrals API. Without it, each org pastes its own REST app credentials.
  Source: https://developer.paypal.com/docs/multiparty/seller-onboarding/before-payment/
- **PCI:** PayPal's own pages conflict. One says SAQ A-EP considerations for card fields, others say SAQ A. Ask an assessor before offering PayPal card fields. PayPal's own buttons open in PayPal's window.
  Source: https://developer.paypal.com/expanded/card-fields.md

PayPal adds a second set of webhooks, a second recurring model and a second refund path. It is worth adding after Stripe, not alongside it.

### Hosted page or embeddable form

| | Hosted page on our app | Form embedded on the org's site |
| --- | --- | --- |
| Setup for the nonprofit | Paste a link or button | Paste a script, register the domain |
| Apple Pay, Google Pay | Work with no setup | Domain registration per site |
| Works on Wix, Squarespace, WordPress | Yes, as a link | Unreliable inside their iframe widgets |
| Branding | Logo and colors | Full control |
| PCI | SAQ A | SAQ A |
| Build effort | Lower | Higher |

Stripe says not to put Checkout or the Payment Element inside another iframe, because redirect payment methods break. Apple Pay inside an iframe also needs a matching origin or Safari 17 with `allow="payment"`. Many site builders wrap custom code in an iframe, so a link to a hosted page is the safe default (site-builder details unverified).
Source: https://docs.stripe.com/payments/accept-a-payment.md?payment-ui=checkout&ui=embedded-page
Source: https://docs.stripe.com/elements/express-checkout-element

A custom domain on the Stripe Checkout page costs $10 per month. Our own `/give/{org}` page already carries our domain.
Source: https://stripe.com/pricing

### Canada

Stripe Canada charges 2.9% + CA$0.30 for cards. Interac is not offered online. Pre-authorized debit works in Checkout for one-time gifts, but Checkout subscriptions with PAD are "not yet supported". Monthly PAD gifts need Stripe Billing with a SetupIntent instead. Payment Links do not support PAD.
Source: https://stripe.com/en-ca/pricing
Source: https://docs.stripe.com/payments/acss-debit

## 5. What this means for our data model

These are questions for Jenn. CLAUDE.md says to ask before changing the data model, so nothing here is decided.

1. **More gift sources.** `external_source` only allows `manual`, `stripe` and `import`. Gifts from Givebutter, Zeffy, PayPal or Facebook would all look the same. Options: add values to the enum, or add a `source_platform` text column and keep `external_source` as the channel (manual, sync, import).
2. **Payment methods.** `payment_method` has no `paypal`, `venmo` or `online` value. Facebook and GoFundMe gifts would fall into `other`.
3. **Receipted by someone else.** Gifts through PPGF, Benevity and donor-advised funds are receipted by the intermediary. We need a flag so these gifts stay out of our tax receipts and annual statements, while still counting in the donor's giving history.
4. **Gross, fee and net.** The brief's gift has amount and deductible amount, but no fee or net. Stripe, PayPal, Givebutter, GoFundMe and Benevity all give a fee. Reconciling with the bank deposit and QuickBooks needs it.
5. **Fee covered.** Store the fee-cover amount the donor added, separate from the gift.
6. **Anonymous platform donors.** Decide whether each platform gets one "Anonymous" constituent per org, or whether those gifts have no constituent.
7. **Employer match.** Benevity and YourCause put the employee gift and the match on one row. The importer should split them into two gifts with a soft credit.

## 6. Recommendation

Advice for orgs with 1 to 5 staff, in order of value. Effort is for one developer working with Claude Code, in working days. It includes tests, the seed update and a docs note, per CLAUDE.md. It assumes Phase 3 (import wizard) is done before any CSV preset.

| Order | What | Kind | Effort |
| --- | --- | --- | --- |
| 1 | Our own giving page with Stripe Connect and Checkout | Build | 10 to 14 days |
| 2 | Import presets for Facebook, PayPal, PPGF and GoFundMe | CSV import | 4 to 6 days for all four |
| 3 | Shared connector framework plus Givebutter sync | API and webhooks | 6 to 8 days |
| 4 | Zeffy sync | API and webhooks | 3 to 4 days |
| 5 | PayPal direct sync, org pastes its own app keys | API | 4 to 5 days |
| 6 | Import presets for Benevity, YourCause, Venmo, Square, Donorbox, Network for Good | CSV import | 4 to 6 days for all six |
| 7 | Donorbox sync, for orgs that pay for API access | API and webhooks | 3 days |
| 8 | PayPal and Venmo buttons on our giving page | Build | 8 to 10 days |
| 9 | Embeddable form for the org's own website | Build | 5 to 7 days |
| 10 | Square sync | OAuth API | 4 days |

### Why this order

1. **Our own giving page comes first.** It is the only source where we control every field: fund, fee cover, address, opt-in and recurring status. Every gift arrives complete and matched. It is also the thing that lets an org stop paying another platform. It is already Phase 5. Build the hosted `/give/{org}` page on Checkout Sessions, one-time and monthly, with ACH as an option. Payout-based deposit batches belong here too.
2. **CSV presets for Facebook, PayPal, PPGF and GoFundMe come second.** Nearly every small org gets some Facebook birthday fundraiser money and some PayPal gifts. None of these has a usable API for them. A preset that knows the columns, filters reversals, flags PPGF receipting and soft credits the fundraiser host turns a monthly chore into a two-minute upload. Each preset is mostly a saved mapping plus a few rules, so they are cheap once the wizard exists.
3. **Givebutter is the best first API connector.** Its API is free, its data is the most complete, and its webhooks are signed. It is also on the brief's starter mapping list. Building it first also builds the shared parts: encrypted per-org keys in `integrations`, a nightly backfill job, a webhook receiver that maps a key to an org, retry and error display on the Data Health panel, and an "external_id already seen" check.
4. **Zeffy** is very common among the smallest orgs and its API is free. With the framework in place it is quick. Its webhook is unsigned, so the handler should re-fetch each payment by ID. The API is in beta, so expect changes.
5. **PayPal direct sync** catches gifts made through PayPal Donate buttons the org already has on its website. The "paste your own app keys" path avoids a partner application. A nightly Transaction Search job with a three-hour lag is enough. Add webhooks later if orgs ask.
6. **The second batch of CSV presets** covers sources most orgs see a few times a year: workplace giving, Venmo, card readers at events, and migration away from Donorbox or Network for Good.
7. **Donorbox sync** only helps orgs on its paid tier, and many will be moving to our giving page instead. A CSV preset covers the rest.
8. **PayPal and Venmo on our giving page** raise conversion for some donors. But they double the payment code. Wait until orgs ask.
9. **An embeddable form** sounds important but the hosted page covers most cases. Most site builders handle a link or button better than an embedded payment form. Offer a copy-paste button snippet first. Build a real embedded form when an org needs it.
10. **Square** matters for in-person events more than online giving. Do it if pilot orgs use Square at events.

### CSV import, not an API

These should stay as "download a report and upload it", probably for good:

- **Facebook and Instagram.** The API needs Meta app review and an unlisted permission. Every peer CRM uses CSV.
- **Regular GoFundMe.** No public API. The free nonprofit dashboard exports a CSV.
- **GoFundMe Pro.** The API is real but locked to paid contracts. Revisit only if several customers have Pro.
- **PayPal Giving Fund.** No API.
- **Venmo charity profiles.** No API.
- **Benevity, YourCause, CyberGrants, Bright Funds, United Way.** No nonprofit APIs. Monthly or quarterly files.
- **Network for Good / Bonterra Fundraising Essentials.** No public API.

For each, the help page should tell the user where to click in that platform to download the file and how often to do it. A monthly reminder on the Data Health panel ("Facebook gifts last imported 35 days ago") would make these feel less manual.

### Not recommended

- **A Meta partner integration.** There is no public program, and the payoff is small because Meta shares so little donor data.
- **Scraping GoFundMe or Venmo.** It breaks their terms and breaks often.
- **Zapier as our main path.** It adds a paid tool and another place for things to fail. A Zapier app could come later as a catch-all.

## Unverified items to recheck before building

- Whether a new app can get Meta's `page_read_donations` permission.
- Exact column names in the PPGF, Venmo, Square and Network for Good exports. Get a real file from a pilot org.
- Stripe's nonprofit discount rate, and whether it applies to accounts connected to our platform.
- Whether the Givebutter API stays free on every plan.
- Whether Zeffy signs its webhooks, and whether its write endpoints are live.
- The full Donorbox webhook event list.
- PayPal card fields PCI level (SAQ A or SAQ A-EP).
- How Wix, Squarespace and WordPress handle an embedded Stripe form.
- GoFundMe Pro pricing and whether a GoFundMe Pro sandbox exists.
