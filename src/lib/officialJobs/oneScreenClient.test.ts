import assert from "node:assert/strict";
import { before, test } from "node:test";
import {
  CAREER_LANDING_LOCAL_ID_STORAGE_KEY,
  CAREER_UTM_EXPLICIT_SOURCE_AT_STORAGE_KEY,
  CAREER_UTM_EXPLICIT_SOURCE_STORAGE_KEY,
} from "@/lib/career/utm";
import { OFFICIAL_JOBS_LANDING_LAST_VISIT_AT_KEY } from "./landingLogs";

// The /jobs id key (events.ts OFFICIAL_JOBS_ANONYMOUS_ID_KEY); events.ts creates a Supabase client when loaded.
const JOBS_ID_KEY = "harper_official_jobs_anonymous_id_v1";
const JOBS_ID = "jobs-visitor-1";
const CAREER_ID = "career-landing-1";

type Client = typeof import("./oneScreenClient");
let client: Client;

before(async () => {
  // The module's imports create Supabase clients when loaded; nothing here reaches them over the network.
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "local-check-only";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "local-check-only";
  client = await import("./oneScreenClient");
  // Let the auth client finish starting up (no session) before any test gives it a window.
  const { supabase } = await import("@/lib/supabase");
  await supabase.auth.getSession();
});

function memoryStorage(initial: Record<string, string>, options: { broken?: boolean } = {}) {
  const values = new Map(Object.entries(initial));
  const writes: string[] = [];
  const check = () => {
    if (options.broken) throw new Error("storage blocked");
  };
  return {
    writes,
    values,
    getItem: (key: string) => (check(), values.get(key) ?? null),
    setItem: (key: string, value: string) => {
      check();
      writes.push(key);
      values.set(key, String(value));
    },
    removeItem: (key: string) => {
      check();
      writes.push(key);
      values.delete(key);
    },
  };
}

/** A browser with this storage, for the length of `run`. */
async function inBrowser<T>(storage: ReturnType<typeof memoryStorage>, run: () => T | Promise<T>) {
  const scope = globalThis as { window?: unknown; document?: unknown };
  const saved = { window: scope.window, document: scope.document };
  scope.window = { localStorage: storage, location: { pathname: "/jobs/example-role", search: "" } };
  scope.document = { cookie: "", referrer: "" };
  try {
    return await run();
  } finally {
    scope.window = saved.window;
    scope.document = saved.document;
  }
}

const activeUtm = (capturedAt = Date.now()) => ({
  [CAREER_UTM_EXPLICIT_SOURCE_STORAGE_KEY]: "newsletter",
  [CAREER_UTM_EXPLICIT_SOURCE_AT_STORAGE_KEY]: String(capturedAt),
});

test("peek reads what remember would give, and writes nothing", async () => {
  assert.equal(client.peekOfficialJobsLanding(), null, "no browser");
  const cases: Array<{ name: string; stored: Record<string, string>; expected: string | null }> = [
    { name: "no explicit UTM: the /jobs id", stored: { [JOBS_ID_KEY]: JOBS_ID, [CAREER_LANDING_LOCAL_ID_STORAGE_KEY]: CAREER_ID }, expected: JOBS_ID },
    { name: "explicit UTM: the career landing id", stored: { [JOBS_ID_KEY]: JOBS_ID, [CAREER_LANDING_LOCAL_ID_STORAGE_KEY]: CAREER_ID, ...activeUtm() }, expected: CAREER_ID },
    { name: "explicit UTM without a career landing id: the /jobs id", stored: { [JOBS_ID_KEY]: JOBS_ID, ...activeUtm() }, expected: JOBS_ID },
    {
      name: "an explicit UTM older than the session gap no longer counts",
      stored: { [JOBS_ID_KEY]: JOBS_ID, [CAREER_LANDING_LOCAL_ID_STORAGE_KEY]: CAREER_ID, ...activeUtm(Date.now() - 31 * 60_000) },
      expected: JOBS_ID,
    },
  ];
  for (const { name, stored, expected } of cases) {
    const peeked = memoryStorage(stored);
    assert.equal(await inBrowser(peeked, () => client.peekOfficialJobsLanding()), expected, name);
    assert.deepEqual(peeked.writes, [], `${name}: nothing written`);
    // remember (which does write) gives the same id from the same storage.
    const remembered = memoryStorage(stored);
    assert.equal(await inBrowser(remembered, () => client.rememberOfficialJobsLanding()), expected, `${name}: as remember`);
  }

  // No /jobs id yet: peek does not create one. With an explicit UTM it is still the career landing id.
  const fresh = memoryStorage({ [CAREER_LANDING_LOCAL_ID_STORAGE_KEY]: CAREER_ID, ...activeUtm() });
  assert.equal(await inBrowser(fresh, () => client.peekOfficialJobsLanding()), CAREER_ID);
  assert.equal(fresh.values.has(JOBS_ID_KEY), false);
  const none = memoryStorage({});
  assert.equal(await inBrowser(none, () => client.peekOfficialJobsLanding()), null);
  assert.deepEqual(none.writes, []);

  // Storage blocked: nothing to read, no throw.
  const blocked = memoryStorage({ [JOBS_ID_KEY]: JOBS_ID }, { broken: true });
  assert.equal(await inBrowser(blocked, () => client.peekOfficialJobsLanding()), null);
});

test("a step names the landing id only when it is not the /jobs id", () => {
  assert.equal(client.oneScreenStepLid(CAREER_ID, JOBS_ID), CAREER_ID);
  assert.equal(client.oneScreenStepLid(CAREER_ID, null), CAREER_ID);
  assert.equal(client.oneScreenStepLid(JOBS_ID, JOBS_ID), null);
  assert.equal(client.oneScreenStepLid("", JOBS_ID), null);
  assert.equal(client.oneScreenStepLid(null, JOBS_ID), null);
});

test("every one-screen step carries the career landing id while an explicit UTM made it the one used", async () => {
  const sent: Array<Record<string, unknown>> = [];
  const savedFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    // A visit already counted (a recent last visit), so the step sends nothing but itself.
    const visited = { [JOBS_ID_KEY]: JOBS_ID, [OFFICIAL_JOBS_LANDING_LAST_VISIT_AT_KEY]: String(Date.now()) };
    await inBrowser(memoryStorage({ ...visited, [CAREER_LANDING_LOCAL_ID_STORAGE_KEY]: CAREER_ID, ...activeUtm() }), () =>
      client.logOneScreenStep("example-role", "submit_ok", { kind: "role" })
    );
    await inBrowser(memoryStorage({ ...visited, [CAREER_LANDING_LOCAL_ID_STORAGE_KEY]: CAREER_ID }), () =>
      client.logOneScreenStep("example-role", "similar_submit")
    );
  } finally {
    globalThis.fetch = savedFetch;
  }
  assert.equal(sent.length, 2);
  const [withUtm, withoutUtm] = sent as Array<{ anonymousId: string; eventType: string; metadata: Record<string, unknown> }>;
  assert.equal(withUtm.eventType, "job_onescreen_step");
  assert.equal(withUtm.anonymousId, JOBS_ID);
  assert.equal(withUtm.metadata.lid, CAREER_ID);
  assert.equal(withUtm.metadata.step, "submit_ok");
  assert.equal(withUtm.metadata.kind, "role");
  // Without an explicit UTM the id used is the /jobs id the event already carries.
  assert.equal(withoutUtm.anonymousId, JOBS_ID);
  assert.equal("lid" in withoutUtm.metadata, false);
});
