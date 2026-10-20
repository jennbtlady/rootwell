/**
 * The fields a spreadsheet column can map to. `group` decides which import kinds offer it.
 * Synonyms are lower-cased, with spaces, dots, dashes and underscores removed, and drive
 * auto-suggest for files from any source.
 */
export type ImportKind = "constituents" | "constituents_gifts";

export type ImportField =
  | "legacy_id" | "type" | "full_name" | "prefix" | "first_name" | "last_name" | "suffix" | "preferred_name" | "org_name"
  | "email" | "phone" | "line1" | "line2" | "city" | "state" | "postal_code" | "country"
  | "tags" | "source" | "notes" | "do_not_contact" | "do_not_email" | "do_not_mail" | "do_not_call"
  | "amount" | "gift_date" | "fund" | "campaign" | "appeal" | "payment_method" | "check_number" | "reference" | "gift_notes";

export const FIELD_INFO: Record<ImportField, { label: string; group: "person" | "gift"; help?: string; synonyms: string[] }> = {
  legacy_id: { label: "ID from the old system", group: "person", help: "Keeps the same person together across rows and future imports.", synonyms: ["id", "constituentid", "accountid", "accountnumber", "donorid", "lglid", "contactid", "customerid", "supporterid", "recordid", "legacyid"] },
  type: { label: "Type (person, household, organization)", group: "person", synonyms: ["type", "constituenttype", "accounttype", "recordtype", "donortype"] },
  full_name: { label: "Full name (one column)", group: "person", help: "Split into first and last. \"Rivera, Dana\" and \"Dana Rivera\" both work.", synonyms: ["name", "fullname", "donorname", "customername", "customerdescription", "cardname", "supportername", "contactname", "billingname"] },
  prefix: { label: "Prefix", group: "person", synonyms: ["prefix", "title", "salutationprefix", "honorific"] },
  first_name: { label: "First name", group: "person", synonyms: ["firstname", "first", "givenname", "fname", "donorfirstname"] },
  last_name: { label: "Last name", group: "person", synonyms: ["lastname", "last", "surname", "familyname", "lname", "donorlastname"] },
  suffix: { label: "Suffix", group: "person", synonyms: ["suffix"] },
  preferred_name: { label: "Goes by", group: "person", synonyms: ["nickname", "preferredname", "goesby", "informalname"] },
  org_name: { label: "Organization or household name", group: "person", synonyms: ["organization", "organizationname", "company", "companyname", "business", "businessname", "employer", "householdname", "orgname"] },
  email: { label: "Email", group: "person", synonyms: ["email", "emailaddress", "primaryemail", "primaryemailaddress", "customeremail", "donoremail", "email1", "emailaddress1"] },
  phone: { label: "Phone", group: "person", synonyms: ["phone", "phonenumber", "primaryphone", "primaryphonenumber", "mobile", "mobilephone", "cell", "cellphone", "homephone", "telephone", "phone1"] },
  line1: { label: "Street address", group: "person", synonyms: ["address", "address1", "addressline1", "street", "streetaddress", "street1", "primarystreet", "mailingstreet", "billingaddressline1", "cardaddressline1", "line1"] },
  line2: { label: "Address line 2", group: "person", synonyms: ["address2", "addressline2", "street2", "apt", "suite", "billingaddressline2", "cardaddressline2", "line2"] },
  city: { label: "City", group: "person", synonyms: ["city", "town", "primarycity", "mailingcity", "billingaddresscity", "cardaddresscity"] },
  state: { label: "State", group: "person", synonyms: ["state", "province", "region", "stateprovince", "primarystate", "mailingstate", "billingaddressstate", "cardaddressstate"] },
  postal_code: { label: "ZIP", group: "person", synonyms: ["zip", "zipcode", "postalcode", "postcode", "primaryzipcode", "primaryzip", "mailingzip", "billingaddresspostalcode", "cardaddresszip", "billingzip"] },
  country: { label: "Country", group: "person", synonyms: ["country", "countrycode", "primarycountry", "billingaddresscountry", "cardaddresscountry"] },
  tags: { label: "Tags (comma separated)", group: "person", synonyms: ["tags", "groups", "categories", "keywords", "interests", "lists"] },
  source: { label: "Source", group: "person", synonyms: ["source", "howheard", "leadsource", "referralsource"] },
  notes: { label: "Notes about the person", group: "person", synonyms: ["notes", "note", "comments", "constituentnotes", "contactnotes"] },
  do_not_contact: { label: "Do not contact (yes or no)", group: "person", synonyms: ["donotcontact", "nocontact", "donotsolicit"] },
  do_not_email: { label: "No email (yes or no)", group: "person", synonyms: ["donotemail", "noemail", "emailoptout", "unsubscribed", "optout"] },
  do_not_mail: { label: "No mail (yes or no)", group: "person", synonyms: ["donotmail", "nomail", "mailoptout"] },
  do_not_call: { label: "No calls (yes or no)", group: "person", synonyms: ["donotcall", "nocall", "phoneoptout"] },
  amount: { label: "Gift amount", group: "gift", synonyms: ["amount", "giftamount", "donationamount", "total", "totalamount", "received", "receivedamount", "paymentamount", "amountpaid"] },
  gift_date: { label: "Gift date", group: "gift", synonyms: ["date", "giftdate", "donationdate", "receiveddate", "paymentdate", "transactiondate", "createddate", "createddateutc", "created", "datereceived"] },
  fund: { label: "Fund", group: "gift", synonyms: ["fund", "fundname", "designation", "giftdesignation", "restriction"] },
  campaign: { label: "Campaign", group: "gift", synonyms: ["campaign", "campaignname", "campaigntitle", "form", "formname", "event"] },
  appeal: { label: "Appeal", group: "gift", synonyms: ["appeal", "appealname", "solicitation", "mailing"] },
  payment_method: { label: "Payment method", group: "gift", synonyms: ["paymentmethod", "method", "paymenttype", "tender", "type_of_payment", "paymentchannel", "cardbrand"] },
  check_number: { label: "Check number", group: "gift", synonyms: ["checknumber", "checkno", "check", "checknum"] },
  reference: { label: "Reference", group: "gift", synonyms: ["reference", "transactionid", "receiptnumber", "paymentid", "chargeid", "giftid", "donationid"] },
  gift_notes: { label: "Notes about the gift", group: "gift", synonyms: ["giftnotes", "donationnotes", "dedication", "tribute", "memo", "giftnote"] },
};

export const IMPORT_FIELDS = Object.keys(FIELD_INFO) as ImportField[];

export function fieldsFor(kind: ImportKind): ImportField[] {
  return IMPORT_FIELDS.filter((f) => kind === "constituents_gifts" || FIELD_INFO[f].group === "person");
}

export function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[\s._\-/()#]+/g, "");
}

/**
 * Starter mappings for common exports: header -> field. Header names come from each
 * tool's default export as best known; auto-suggest fills any gaps, and the admin
 * confirms every mapping before anything is saved.
 */
export const STARTER_MAPPINGS: { id: string; name: string; kind: ImportKind; headers: Record<string, ImportField> }[] = [
  {
    id: "generic",
    name: "Generic spreadsheet",
    kind: "constituents_gifts",
    headers: { "First Name": "first_name", "Last Name": "last_name", Email: "email", Phone: "phone", Address: "line1", City: "city", State: "state", Zip: "postal_code", Amount: "amount", Date: "gift_date", Fund: "fund", Campaign: "campaign" },
  },
  {
    id: "lgl",
    name: "Little Green Light",
    kind: "constituents_gifts",
    headers: {
      "LGL Constituent ID": "legacy_id", "First Name": "first_name", "Last Name": "last_name", "Org Name": "org_name", "Email 1": "email", "Phone 1": "phone",
      "Street 1": "line1", "Street 2": "line2", City: "city", State: "state", "Postal Code": "postal_code", Country: "country",
      "Gift Amount": "amount", "Gift Date": "gift_date", "Fund": "fund", "Campaign": "campaign", "Appeal": "appeal", "Payment Type": "payment_method", "Check/Reference No.": "check_number", "Gift Note": "gift_notes",
    },
  },
  {
    id: "bloomerang",
    name: "Bloomerang",
    kind: "constituents_gifts",
    headers: {
      "Account Number": "legacy_id", "First Name": "first_name", "Last Name": "last_name", "Primary Email Address": "email", "Primary Phone Number": "phone",
      "Primary Street": "line1", "Primary City": "city", "Primary State": "state", "Primary ZIP Code": "postal_code", "Primary Country": "country",
      Amount: "amount", Date: "gift_date", Fund: "fund", Campaign: "campaign", Appeal: "appeal", Method: "payment_method", "Check Number": "check_number", Note: "gift_notes",
    },
  },
  {
    id: "zeffy",
    name: "Zeffy",
    kind: "constituents_gifts",
    headers: {
      "First Name": "first_name", "Last Name": "last_name", Email: "email", "Phone Number": "phone", Address: "line1", City: "city", "Region": "state", "Postal Code": "postal_code", Country: "country",
      "Company Name": "org_name", Amount: "amount", "Payment Date": "gift_date", "Form Name": "campaign", "Payment Method": "payment_method", "Receipt Number": "reference",
    },
  },
  {
    id: "givebutter",
    name: "Givebutter",
    kind: "constituents_gifts",
    headers: {
      "Contact ID": "legacy_id", "First Name": "first_name", "Last Name": "last_name", Email: "email", Phone: "phone", "Address 1": "line1", "Address 2": "line2", City: "city", State: "state", "Zip Code": "postal_code", Country: "country",
      Company: "org_name", Amount: "amount", "Transaction Date": "gift_date", "Campaign Title": "campaign", Fund: "fund", Method: "payment_method", "Transaction ID": "reference", Dedication: "gift_notes",
    },
  },
  {
    id: "stripe",
    name: "Stripe payments export",
    kind: "constituents_gifts",
    headers: {
      "Customer ID": "legacy_id", "Customer Description": "full_name", "Customer Email": "email", "Card Address Line1": "line1", "Card Address Line2": "line2", "Card Address City": "city",
      "Card Address State": "state", "Card Address Zip": "postal_code", "Card Address Country": "country", Amount: "amount", "Created date (UTC)": "gift_date", id: "reference",
    },
  },
];

/**
 * Suggests a field for each header. A starter mapping whose headers match the file wins;
 * otherwise synonyms decide. A field is used at most once.
 */
export function suggestMapping(headers: string[], kind: ImportKind): { mapping: Partial<Record<ImportField, string>>; starter: string | null } {
  const allowed = new Set(fieldsFor(kind));
  const mapping: Partial<Record<ImportField, string>> = {};
  const used = new Set<string>();

  const byNorm = new Map(headers.map((h) => [normalizeHeader(h), h]));
  let best: { id: string; hits: number } | null = null;
  for (const s of STARTER_MAPPINGS) {
    const hits = Object.keys(s.headers).filter((h) => byNorm.has(normalizeHeader(h))).length;
    if (hits >= 4 && (!best || hits > best.hits)) best = { id: s.id, hits };
  }
  if (best) {
    const s = STARTER_MAPPINGS.find((x) => x.id === best!.id)!;
    for (const [h, f] of Object.entries(s.headers)) {
      const actual = byNorm.get(normalizeHeader(h));
      if (actual && allowed.has(f) && !mapping[f] && !used.has(actual)) {
        mapping[f] = actual;
        used.add(actual);
      }
    }
  }
  for (const h of headers) {
    if (used.has(h)) continue;
    const n = normalizeHeader(h);
    const f = IMPORT_FIELDS.find((x) => allowed.has(x) && !mapping[x] && FIELD_INFO[x].synonyms.includes(n));
    if (f) {
      mapping[f] = h;
      used.add(h);
    }
  }
  return { mapping, starter: best?.id ?? null };
}
