/**
 * Phase 6 load test: 50 organizations of 10,000 donors each (the brief's target), then
 * timings for the everyday screens through the real API with RLS on, as a signed-in owner.
 *
 *   DATABASE_URL=... pnpm --filter @maple/api load-test
 *   Options (env): ORGS=50 PEOPLE=10000 GIFTS=3 KEEP=1 (keep the data afterwards)
 *
 * Seeding uses raw SQL with triggers off (session_replication_role = replica) so 500,000
 * donors load in minutes; the columns triggers would fill are filled here instead. All
 * load-test data is named "Load test org N" and removed at the end unless KEEP=1.
 * Point DATABASE_URL at a hosted staging project to run it there. Never at production.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { createDb } from "@maple/db";
import { app, setDb, setVerifier } from "../src";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
if (/prod/i.test(url)) throw new Error("Refusing to run against a database that looks like production");
const ORGS = Number(process.env.ORGS ?? 50);
const PEOPLE = Number(process.env.PEOPLE ?? 10_000);
const GIFTS = Number(process.env.GIFTS ?? 3);
const KEEP = process.env.KEEP === "1" || process.env.REUSE === "1";
/** REUSE=1 measures the load data a KEEP=1 run left behind, without seeding again. */
const REUSE = process.env.REUSE === "1";

const FIRST = ["Ana", "Ben", "Carla", "Dev", "Elena", "Femi", "Grace", "Hiro", "Imani", "Jon", "Kira", "Luis", "Maya", "Nate", "Olu", "Priya", "Quinn", "Rosa", "Sam", "Tara", "Uma", "Victor", "Wen", "Xavier", "Yara", "Zoe", "Amir", "Bea", "Cole", "Dina"];
const LAST = ["Smith", "Garcia", "Okafor", "Nguyen", "Patel", "Kim", "Rivera", "Cohen", "Haddad", "Novak", "Silva", "Mensah", "Tanaka", "Murphy", "Rossi", "Kowalski", "Jensen", "Moreau", "Ahmed", "Lopez", "Baker", "Chen", "Diaz", "Evans", "Fischer", "Gupta", "Hughes", "Ito", "Jones", "Khan"];
const arr = (xs: string[]) => `array[${xs.map((x) => `'${x}'`).join(",")}]`;

const sql = postgres(url, { max: 1, onnotice: () => {} });
let userId = randomUUID();
const orgIds: string[] = [];
const t0 = Date.now();
const secs = () => ((Date.now() - t0) / 1000).toFixed(0);

async function seed() {
  await sql`insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
            values (${userId}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${`load-${userId.slice(0, 8)}@test.invalid`}, '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())`;
  for (let n = 1; n <= ORGS; n++) {
    await sql.begin(async (tx) => {
      await tx.unsafe("set local session_replication_role = replica");
      const [{ id: org }] = (await tx`insert into organizations (name, subscription_status, trial_ends_at) values (${`Load test org ${n}`}, 'active', null) returning id`) as unknown as [{ id: string }];
      orgIds.push(org);
      await tx`insert into org_memberships (org_id, user_id, role, status, accepted_at) values (${org}, ${userId}, 'owner', 'active', now())`;
      await tx`insert into funds (org_id, name) select ${org}, unnest(array['General operating', 'Building', 'Programs'])`;
      await tx.unsafe(`
        insert into constituents (org_id, type, first_name, last_name, display_name, sort_name, source, created_at)
        select '${org}', 'person', f, l, f || ' ' || l, l || ', ' || f, 'import', now() - ((i % 1500) || ' days')::interval
          from (select i, (${arr(FIRST)})[1 + (i * 7) % ${FIRST.length}] as f,
                          (${arr(LAST)})[1 + (i * 13) % ${LAST.length}] || case when i % 3 = 0 then '-' || (i % 977) else '' end as l
                  from generate_series(1, ${PEOPLE}) i) s`);
      await tx.unsafe(`
        insert into constituent_emails (org_id, constituent_id, email, type, is_primary)
        select org_id, id, lower(replace(first_name || '.' || last_name, ' ', '')) || '.' || left(id::text, 6) || '@example.org', 'home', true
          from constituents where org_id = '${org}'`);
      await tx.unsafe(`
        insert into constituent_addresses (org_id, constituent_id, line1, city, state, postal_code, country, type, is_primary)
        select org_id, id, (abs(hashtext(id::text)) % 900 + 10) || ' Main St', 'Springfield', 'IL', lpad((62700 + abs(hashtext(id::text)) % 99)::text, 5, '0'), 'US', 'home', true
          from constituents where org_id = '${org}'`);
      await tx.unsafe(`
        insert into gifts (org_id, constituent_id, amount, gift_date, fund_id, payment_method, gift_type, posted_at, acknowledged_at)
        select c.org_id, c.id, (10 + abs(hashtext(c.id::text || g)) % 490)::numeric, current_date - (abs(hashtext(c.id::text || g || 'd')) % 1100),
               (select id from funds where org_id = c.org_id order by name limit 1 offset (abs(hashtext(c.id::text || g)) % 3)),
               'check', 'one_time', now(), case when g > 1 then now() end
          from constituents c cross join generate_series(1, ${GIFTS}) g
         where c.org_id = '${org}'`);
    });
    if (n % 5 === 0 || n === ORGS) console.log(`  seeded ${n} of ${ORGS} organizations (${secs()}s)`);
  }
  await sql.unsafe("analyze");
}

type Timing = { name: string; ms: number[] };
const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))]!;

async function measure() {
  setDb(createDb(url));
  setVerifier(async (token) => ({ sub: token.split(":")[1], aal: "aal2" }));
  const headers = { authorization: `Bearer token:${userId}:aal2`, "content-type": "application/json" };
  const call = async (method: string, path: string, body?: unknown) => {
    const s = performance.now();
    const res = await app.request(`/api/v1${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const buf = await res.arrayBuffer();
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${new TextDecoder().decode(buf).slice(0, 200)}`);
    return { ms: performance.now() - s, json: () => JSON.parse(new TextDecoder().decode(buf)) };
  };
  const timings: Timing[] = [];
  const time = async (name: string, runs: number, fn: (i: number) => Promise<{ ms: number }>) => {
    const t: Timing = { name, ms: [] };
    for (let i = 0; i < runs; i++) t.ms.push((await fn(i)).ms);
    timings.push(t);
  };
  const sample = orgIds.slice(0, Math.min(10, orgIds.length));
  const o = (i: number) => sample[i % sample.length]!;
  const year = new Date().getFullYear();

  // Isolation at scale: an owner of every load org still sees exactly one org's donors per org.
  const counts = await Promise.all(sample.map(async (id) => (await call("GET", `/orgs/${id}/constituents?limit=1`)).json().total as number));
  if (counts.some((c) => c < PEOPLE || c > PEOPLE + 100)) throw new Error(`isolation: expected ${PEOPLE} donors per org, saw ${counts.join(",")}`);

  const someone = ((await call("GET", `/orgs/${o(0)}/constituents?limit=1`)).json().items[0] as { id: string }).id;
  await time("Donor search (\"smith\")", 30, (i) => call("GET", `/orgs/${o(i)}/constituents?q=${["smith", "garcia", "nguyen"][i % 3]}`));
  await time("Donor list, first page", 30, (i) => call("GET", `/orgs/${o(i)}/constituents`));
  await time("Donor record", 30, () => call("GET", `/orgs/${o(0)}/constituents/${someone}`));
  await time("Add a donor", 20, (i) => call("POST", `/orgs/${o(i)}/constituents`, { firstName: "Load", lastName: `Tester${i}`, emails: [{ email: `load${i}-${randomUUID().slice(0, 6)}@example.org` }] }));
  await time("Unthanked gifts list", 20, (i) => call("GET", `/orgs/${o(i)}/gifts?filter=unacknowledged`));
  await time("Data health", 20, (i) => call("GET", `/orgs/${o(i)}/health`));
  await time("Dashboard refresh", 10, (i) => call("POST", `/orgs/${o(i)}/dashboard/refresh`));
  await time("Dashboard view", 20, (i) => call("GET", `/orgs/${o(i)}/dashboard`));
  await time("LYBUNT report", 10, (i) => call("GET", `/orgs/${o(i)}/reports/lybunt`));
  await time(`Gifts by fund report (${year})`, 10, (i) => call("GET", `/orgs/${o(i)}/reports/gifts_by_fund?from=${year}-01-01&to=${year}-12-31`));
  await time("Download everything (zip)", 3, (i) => call("GET", `/orgs/${o(i)}/export/everything`));
  await time("Duplicate scan, whole org", 2, (i) => call("POST", `/orgs/${o(i)}/duplicates/scan`));

  // 50 people searching at once, one per organization.
  const s = performance.now();
  const together = await Promise.all(orgIds.map((id, i) => call("GET", `/orgs/${id}/constituents?q=${["smith", "patel", "kim"][i % 3]}`)));
  timings.push({ name: `${orgIds.length} searches at the same moment`, ms: together.map((r) => r.ms) });
  const wall = performance.now() - s;

  console.log(`\n| What | Runs | Median | 95th percentile | Slowest |\n|---|---|---|---|---|`);
  for (const t of timings) console.log(`| ${t.name} | ${t.ms.length} | ${pct(t.ms, 50).toFixed(0)} ms | ${pct(t.ms, 95).toFixed(0)} ms | ${Math.max(...t.ms).toFixed(0)} ms |`);
  console.log(`\nAll ${orgIds.length} simultaneous searches finished in ${wall.toFixed(0)} ms.`);
}

async function cleanup() {
  if (!orgIds.length) return;
  await sql.begin(async (tx) => {
    await tx.unsafe("set local session_replication_role = replica");
    const tables = (await tx`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'org_id' and table_name <> 'organizations'`) as unknown as { table_name: string }[];
    for (const { table_name } of tables) await tx`delete from ${tx(table_name)} where org_id = any(${orgIds})`;
    await tx`delete from organizations where id = any(${orgIds})`;
  });
  await sql`delete from auth.users where id = ${userId}`;
}

try {
  if (REUSE) {
    const rows = (await sql`select o.id, m.user_id from organizations o join org_memberships m on m.org_id = o.id and m.role = 'owner'
                             where o.name like 'Load test org %' order by o.created_at`) as unknown as { id: string; user_id: string }[];
    if (!rows.length) throw new Error("REUSE=1 but no load test data. Run once with KEEP=1 first.");
    orgIds.push(...rows.map((r) => r.id));
    userId = rows[0]!.user_id;
    console.log(`Reusing ${orgIds.length} load test organizations.`);
  } else {
    console.log(`Seeding ${ORGS} organizations x ${PEOPLE.toLocaleString()} donors x ${GIFTS} gifts...`);
    await seed();
  }
  const [{ n }] = (await sql`select count(*)::int as n from constituents where org_id = any(${orgIds})`) as unknown as [{ n: number }];
  const [{ g }] = (await sql`select count(*)::int as g from gifts where org_id = any(${orgIds})`) as unknown as [{ g: number }];
  console.log(`Seeded ${n.toLocaleString()} donors and ${g.toLocaleString()} gifts in ${secs()}s. Measuring...`);
  await measure();
} finally {
  if (KEEP) console.log("\nKEEP=1: load test data left in place.");
  else {
    console.log("\nRemoving load test data...");
    await cleanup();
  }
  await sql.end();
  process.exit(0);
}
