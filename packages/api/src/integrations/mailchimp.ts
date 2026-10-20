import { createHash } from "node:crypto";

export type Audience = { id: string; name: string; memberCount: number };
export type MemberStatus = "subscribed" | "unsubscribed" | "cleaned" | "pending" | "transactional";

export interface MailchimpGateway {
  readonly mode: "live" | "simulated";
  /** Throws a plain message when the key does not work. */
  ping(): Promise<{ accountName: string }>;
  audiences(): Promise<Audience[]>;
  /** Adds or updates a contact. `statusIfNew` applies only to new contacts; existing statuses are never changed. */
  upsert(listId: string, m: { email: string; firstName: string; lastName: string; statusIfNew: MemberStatus }): Promise<void>;
  /** Marks an existing contact unsubscribed. Does nothing if they are not in the audience. */
  unsubscribe(listId: string, email: string): Promise<void>;
  setTags(listId: string, email: string, tags: { name: string; active: boolean }[]): Promise<void>;
}

export const subscriberHash = (email: string) => createHash("md5").update(email.trim().toLowerCase()).digest("hex");

/** The data center is the part of the key after the dash, e.g. us21. */
export function dataCenter(apiKey: string): string | null {
  const m = /-([a-z]{2}\d{1,3})$/.exec(apiKey.trim());
  return m ? m[1]! : null;
}

export class LiveMailchimpGateway implements MailchimpGateway {
  readonly mode = "live" as const;
  private base: string;
  private auth: string;
  constructor(apiKey: string) {
    const dc = dataCenter(apiKey);
    if (!dc) throw new Error("That does not look like a Mailchimp API key. It ends with something like -us21.");
    this.base = `https://${dc}.api.mailchimp.com/3.0`;
    this.auth = `Basic ${Buffer.from(`maple:${apiKey.trim()}`).toString("base64")}`;
  }
  private async call(method: string, path: string, body?: unknown, okStatuses: number[] = []) {
    const res = await fetch(`${this.base}${path}`, { method, headers: { authorization: this.auth, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    if (res.ok || okStatuses.includes(res.status)) return res.status === 204 ? null : res.json().catch(() => null);
    const detail = (await res.json().catch(() => null)) as { detail?: string; title?: string } | null;
    if (res.status === 401) throw new Error("Mailchimp did not accept that API key.");
    throw new Error(`Mailchimp said: ${detail?.detail ?? detail?.title ?? res.status}`);
  }
  async ping() {
    const r = (await this.call("GET", "/")) as { account_name?: string };
    return { accountName: r?.account_name ?? "Mailchimp account" };
  }
  async audiences() {
    const r = (await this.call("GET", "/lists?count=100&fields=lists.id,lists.name,lists.stats.member_count")) as { lists: { id: string; name: string; stats: { member_count: number } }[] };
    return r.lists.map((l) => ({ id: l.id, name: l.name, memberCount: l.stats.member_count }));
  }
  async upsert(listId: string, m: { email: string; firstName: string; lastName: string; statusIfNew: MemberStatus }) {
    await this.call("PUT", `/lists/${listId}/members/${subscriberHash(m.email)}`, { email_address: m.email, status_if_new: m.statusIfNew, merge_fields: { FNAME: m.firstName, LNAME: m.lastName } });
  }
  async unsubscribe(listId: string, email: string) {
    await this.call("PATCH", `/lists/${listId}/members/${subscriberHash(email)}`, { status: "unsubscribed" }, [404]);
  }
  async setTags(listId: string, email: string, tags: { name: string; active: boolean }[]) {
    if (!tags.length) return;
    await this.call("POST", `/lists/${listId}/members/${subscriberHash(email)}/tags`, { tags: tags.map((t) => ({ name: t.name, status: t.active ? "active" : "inactive" })) });
  }
}

/** In-memory audiences, so sync can be built and tested without an account. Keys starting "sim-" work. */
type SimMember = { email: string; firstName: string; lastName: string; status: MemberStatus; tags: Set<string> };
const gm = globalThis as unknown as { __mapleMailchimpSim?: Map<string, Map<string, Map<string, SimMember>>> };
const accounts = (gm.__mapleMailchimpSim ??= new Map());

export class SimulatedMailchimpGateway implements MailchimpGateway {
  readonly mode = "simulated" as const;
  private lists: Map<string, Map<string, SimMember>>;
  constructor(private apiKey: string) {
    if (!apiKey.startsWith("sim-")) throw new Error("In simulation mode, use a key that starts with sim-, for example sim-key-us1.");
    this.lists = accounts.get(apiKey) ?? new Map([["sim-list-newsletter", new Map()], ["sim-list-donors", new Map()]]);
    accounts.set(apiKey, this.lists);
  }
  async ping() {
    return { accountName: "Simulated Mailchimp" };
  }
  async audiences() {
    const names: Record<string, string> = { "sim-list-newsletter": "Newsletter", "sim-list-donors": "Donors" };
    return [...this.lists.entries()].map(([id, m]) => ({ id, name: names[id] ?? id, memberCount: [...m.values()].filter((x) => x.status === "subscribed").length }));
  }
  private list(listId: string) {
    const l = this.lists.get(listId);
    if (!l) throw new Error("Mailchimp said: The requested resource could not be found.");
    return l;
  }
  async upsert(listId: string, m: { email: string; firstName: string; lastName: string; statusIfNew: MemberStatus }) {
    const l = this.list(listId);
    const h = subscriberHash(m.email);
    const cur = l.get(h);
    l.set(h, { email: m.email, firstName: m.firstName, lastName: m.lastName, status: cur?.status ?? m.statusIfNew, tags: cur?.tags ?? new Set() });
  }
  async unsubscribe(listId: string, email: string) {
    const cur = this.list(listId).get(subscriberHash(email));
    if (cur) cur.status = "unsubscribed";
  }
  async setTags(listId: string, email: string, tags: { name: string; active: boolean }[]) {
    const cur = this.list(listId).get(subscriberHash(email));
    if (!cur) throw new Error("Mailchimp said: The requested resource could not be found.");
    for (const t of tags) (t.active ? cur.tags.add(t.name) : cur.tags.delete(t.name));
  }
  /** For tests and the simulated settings page. */
  member(listId: string, email: string) {
    return this.list(listId).get(subscriberHash(email)) ?? null;
  }
  /** For tests: what a person might do in Mailchimp itself. */
  setStatus(listId: string, email: string, status: MemberStatus) {
    const cur = this.list(listId).get(subscriberHash(email));
    if (cur) cur.status = status;
  }
}
