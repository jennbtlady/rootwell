/**
 * Keeps donor and personal details out of Sentry (CLAUDE.md rule 8). Every event passes
 * through scrubEvent before it leaves the app, on the server and in the browser.
 *
 * Kept: what broke and where (exception type, stack frames, the route with ids, release).
 * Dropped: request bodies, cookies, sign-in headers, query strings, console breadcrumbs,
 * extra context, and the user's email, name and IP address.
 * Blanked inside any remaining text: email addresses, phone numbers, card-like numbers,
 * and street addresses.
 */
type Json = Record<string, unknown>;

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(?<![\w-])(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
const LONG_DIGITS = /(?<![\w-])\d(?:[ -]?\d){12,18}\b/g;
const STREET = /\b\d{1,6}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Ln|Lane|Dr|Drive|Ct|Court|Way|Pl|Place)\b\.?/g;

export function scrubText(s: string): string {
  return s.replace(EMAIL, "[email]").replace(LONG_DIGITS, "[number]").replace(PHONE, "[phone]").replace(STREET, "[address]");
}

function stripQuery(url: unknown): unknown {
  if (typeof url !== "string") return url;
  const i = url.search(/[?#]/);
  return scrubText(i === -1 ? url : url.slice(0, i));
}

const SAFE_HEADERS = new Set(["user-agent", "content-type", "accept", "host"]);

export function scrubEvent<E extends object>(event: E): E {
  const e = { ...event } as unknown as Json;
  delete e.extra;
  delete e.server_name;
  if (e.user && typeof e.user === "object") {
    const u = e.user as Json;
    e.user = u.id ? { id: u.id } : undefined;
  }
  if (e.request && typeof e.request === "object") {
    const r = { ...(e.request as Json) };
    delete r.data;
    delete r.cookies;
    delete r.query_string;
    r.url = stripQuery(r.url);
    if (r.headers && typeof r.headers === "object") {
      r.headers = Object.fromEntries(Object.entries(r.headers as Json).filter(([k]) => SAFE_HEADERS.has(k.toLowerCase())));
    }
    e.request = r;
  }
  if (typeof e.message === "string") e.message = scrubText(e.message);
  if (e.exception && typeof e.exception === "object") {
    const ex = e.exception as { values?: Json[] };
    e.exception = {
      ...ex,
      values: ex.values?.map((v) => ({ ...v, value: typeof v.value === "string" ? scrubText(v.value) : v.value })),
    };
  }
  if (Array.isArray(e.breadcrumbs)) {
    e.breadcrumbs = (e.breadcrumbs as Json[])
      .filter((b) => b.category !== "console" && b.category !== "ui.input")
      .map((b) => {
        const d = b.data && typeof b.data === "object" ? { ...(b.data as Json) } : undefined;
        if (d) {
          d.url = stripQuery(d.url);
          d.to = stripQuery(d.to);
          d.from = stripQuery(d.from);
          delete d.body;
        }
        return { ...b, message: typeof b.message === "string" ? scrubText(b.message) : b.message, data: d };
      });
  }
  if (e.contexts && typeof e.contexts === "object") {
    // Keep runtime and browser facts; drop anything we or a library attached.
    const keep = ["os", "browser", "runtime", "device", "trace", "app"];
    e.contexts = Object.fromEntries(Object.entries(e.contexts as Json).filter(([k]) => keep.includes(k)));
  }
  return e as unknown as E;
}
