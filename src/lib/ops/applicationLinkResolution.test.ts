import test from "node:test";
import assert from "node:assert/strict";
import { client } from "@/lib/llm/llm";
import {
  resolveInspectionLink,
  runResolvedInspectionDebug,
  roleSearchText,
  candidatesText,
  saveInspectionRoleUrl,
  loadInspectionSource,
} from "./applicationLinkResolution.server";
import type {
  InspectionRole,
  InspectionResolution,
  InspectionStreamEvent,
} from "./applicationFormInspection";
import type { ApplicationForm } from "@/lib/career/simulation/applicationForm";

const role: InspectionRole = {
  id: "00000000-0000-4000-8000-000000000001",
  company: "Fixture",
  name: "Engineer",
  homepage: "https://fixture.example",
  location: "Seoul",
  originalUrl: "https://mirror.example/job",
};
const empty = (): InspectionResolution => ({
  role,
  searches: [],
  attempts: [],
  savedUrl: role.originalUrl,
});
const form = (
  status: ApplicationForm["status"],
  url: string
): ApplicationForm => ({
  status,
  url,
  checkedAt: new Date().toISOString(),
  fields: [],
  limitations: [],
  submission: {
    status: status === "unavailable" ? "unknown" : "supported",
    reason: "Fixture browser evidence",
  },
});

test("an observed login barrier ends discovery without another search", async () => {
  let searches = 0;
  const result = await runResolvedInspectionDebug(role, new AbortController().signal, () => {}, {
    resolve: async () => { searches++; return { query: "Fixture careers Engineer", candidates: [], selectedUrl: "https://ats.example/job", reason: "Official JD", costUsd: 0, durationMs: 1 }; },
    save: async () => {},
    inspect: async () => ({ ...form("unavailable", "https://ats.example/job"), submission: { status: "unsupported", reason: "Login required" } }),
  });
  assert.equal(searches, 1);
  assert.equal(result.resolution?.attempts.length, 1);
  assert.equal(result.form.submission?.status, "unsupported");
});

for (const status of ["read", "partial", "unavailable"] as const) {
  test(`official URL pipeline searches once and saves before browsing: ${status}`, async () => {
    const sequence: string[] = [],
      events: InspectionStreamEvent[] = [];
    let searches = 0,
      inspections = 0;
    const result = await runResolvedInspectionDebug(
      role,
      new AbortController().signal,
      (e) => events.push(e),
      {
        resolve: async ({ previous, onEvent }) => {
          assert.equal(previous.attempts.length, searches);
          searches++;
          sequence.push("search");
          onEvent({ at: "now", kind: "search_start", message: "search" });
          onEvent({
            at: "now",
            kind: "search_result",
            message: "result",
            data: { costUsd: 0.01 },
          });
          onEvent({
            at: "now",
            kind: "usage",
            message: "pending",
            data: { receipts: [{ id: `pending-${searches}` }] },
          });
          onEvent({
            at: "now",
            kind: "resolver_receipt",
            message: "receipt",
            data: {
              requestId: `pending-${searches}`,
              id: `resolver-${searches}`,
              model: "gpt-6-luna",
              usage: { input_tokens: 100, output_tokens: 10 },
            },
          });
          return {
            query: "Fixture Engineer careers",
            candidates: [],
            selectedUrl: `https://ats.example/job/${searches}`,
            reason: "Observed official role",
            costUsd: 0.01,
            durationMs: 10,
          };
        },
        save: async (savedRole, previous, url) => {
          assert.equal(savedRole.id, role.id);
          assert.equal(
            previous,
            role.originalUrl
          );
          assert.equal(url, `https://ats.example/job/${searches}`);
          sequence.push("save");
        },
        inspect: async (url, _signal, deps) => {
          sequence.push("inspect");
          deps?.onEvent?.({
            at: "now",
            kind: "usage",
            message: "browser",
            data: {
              receipts: [
                {
                  id: `browser-${inspections}`,
                  model: "gpt-6-luna",
                  usage: { input_tokens: 100, output_tokens: 10 },
                },
              ],
              requestsStarted: 2,
            },
          });
          inspections++;
          return form(status, String(url));
        },
      }
    );
    assert.equal(searches, 1);
    assert.equal(inspections, 1);
    assert.deepEqual(sequence, ["search", "save", "inspect"]);
    assert.equal(result.resolution?.savedUrl, "https://ats.example/job/1");
    assert.equal(result.usage.requests, 3);
    assert.equal(result.usage.unpricedRequests, 1); // Each browser has one request without a receipt.
    assert.equal(result.usage.searchCostUsd, 0.01);
    assert.equal(events.at(-1)?.type, "completed");
  });
}

test("no candidate searches once without DB writes or browser startup", async () => {
  let calls = 0;
  const result = await runResolvedInspectionDebug(
    role,
    new AbortController().signal,
    () => {},
    {
      resolve: async () => {
        calls++;
        return {
          query: "Fixture Engineer careers",
          candidates: [],
          selectedUrl: null,
          reason: "No matching official result",
          durationMs: 1,
          costUsd: null,
        };
      },
      save: async () => {
        assert.fail("must not write");
      },
      inspect: async () => {
        assert.fail("must not browse");
      },
    }
  );
  assert.equal(calls, 1);
  assert.equal(result.form.status, "unavailable");
  assert.equal(result.resolution?.savedUrl, role.originalUrl);
});

test("DB conflict and disconnect stop before a browser or another Exa call", async () => {
  const abort = new AbortController();
  let calls = 0;
  const resolve: typeof resolveInspectionLink = async () => {
    calls++;
    return {
      query: "query",
      candidates: [],
      selectedUrl: "https://ats.example/job",
      reason: "match",
      durationMs: 1,
      costUsd: null,
    };
  };
  await assert.rejects(
    runResolvedInspectionDebug(role, abort.signal, () => {}, {
      resolve,
      save: async () => {
        throw Error("conflict");
      },
      inspect: async () => assert.fail(),
    }),
    /conflict/
  );
  assert.equal(calls, 1);
  abort.abort();
  await assert.rejects(
    runResolvedInspectionDebug(role, abort.signal, () => {}, { resolve }),
    /abort/i
  );
  assert.equal(calls, 1);
});

test("actual provider request receives text projections and selects only a returned URL", async (t) => {
  const key = process.env.EXA_API_KEY;
  process.env.EXA_API_KEY = "fixture";
  const exactRole = { ...role, company: "Fixture Robotics", name: "Senior Research Engineer—Generative AI / World Model" };
  const exactQuery = `${exactRole.company} ${exactRole.name} careers`;
  let exaCalls = 0;
  const inputs: Record<string, unknown>[] = [];
  let count = 0;
  t.mock.method(
    client.responses,
    "create",
    async (request: Record<string, unknown>) => {
      inputs.push(request);
      count++;
      return {
        status: "completed",
        id: `response-${count}`,
        model: "gpt-6-luna",
        usage: { input_tokens: 100, output_tokens: 10 },
        output_text: JSON.stringify(
          count === 1
            ? { query: exactQuery }
            : { candidateId: 2, reason: "공식 채용 공고" }
        ),
      };
    }
  );
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "https://api.exa.ai/search");
    exaCalls++;
    assert.equal(JSON.parse(String(init.body)).numResults, 10);
    assert.equal(JSON.parse(String(init.body)).query, exactQuery);
    assert.ok(init.signal);
    return Response.json({
      results: [
        { title: "Mirror", url: "https://mirror.example/job" },
        {
          title: "Official",
          url: "https://ats.example/job",
          highlights: ["Fixture is hiring an Engineer"],
        },
      ],
      costDollars: { total: 0.02 },
    });
  });
  try {
    const result = await resolveInspectionLink({
      role: { ...exactRole, evidence: `Hiring company: ${exactRole.company}. Job: ${exactRole.name}.` },
      previous: empty(),
      signal: new AbortController().signal,
      onEvent: () => {},
    });
    assert.equal(result.selectedUrl, "https://ats.example/job");
    assert.equal(result.costUsd, 0.02);
    assert.equal(exaCalls, 1);
    assert.ok(String(inputs[0].input).includes(`Role: ${exactRole.name}`));
    assert.ok(String(inputs[0].instructions).includes("exact company name and the full role title"));
    assert.match(String(inputs[0].input), /Company: Fixture/);
    assert.match(
      String(inputs[0].input),
      /Source page evidence:\nHiring company: Fixture/
    );
    assert.match(
      String(inputs[1].input),
      /Candidate 2: Official\nURL: https:\/\/ats.example\/job\nEvidence: Fixture/
    );
    assert.doesNotMatch(String(inputs[1].input), /"highlights"|"originalUrl"/);
    assert.equal(
      (inputs[0].text as { format: { strict: boolean } }).format.strict,
      true
    );
  } finally {
    if (key === undefined) delete process.env.EXA_API_KEY;
    else process.env.EXA_API_KEY = key;
  }
});

test("save uses exact role, external source and previous URL conditions; missing row is a conflict", async (t) => {
  const previous = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture";
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const request =
        input instanceof Request ? input : new Request(input, init);
      const url = new URL(request.url);
      assert.equal(request.method, "PATCH");
      assert.equal(url.searchParams.get("role_id"), `eq.${role.id}`);
      assert.equal(url.searchParams.get("source_type"), "eq.external");
      assert.equal(
        url.searchParams.get("external_jd_url"),
        `eq.${role.originalUrl}`
      );
      assert.deepEqual(await request.json(), {
        external_jd_url: "https://ats.example/job",
      });
      return Response.json(
        {
          code: "PGRST116",
          details: "The result contains 0 rows",
          message: "Cannot coerce to a single JSON object",
        },
        { status: 406 }
      );
    }
  );
  try {
    await assert.rejects(
      saveInspectionRoleUrl(
        role,
        role.originalUrl,
        "https://ats.example/job",
        new AbortController().signal
      ),
      /다른 작업/
    );
  } finally {
    if (previous.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previous.url;
    if (previous.key === undefined)
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.key;
  }
});

test("search context preserves observed outcomes without raw internal objects or timestamps", () => {
  const previous = empty();
  previous.attempts.push({
    url: "https://ats.example/old",
    form: form("unavailable", "https://ats.example/404"),
    durationMs: 10,
  });
  const text = roleSearchText(role, previous);
  assert.match(text, /Already tried URL: https:\/\/ats.example\/old/);
  assert.match(text, /Read status: unavailable/);
  assert.doesNotMatch(text, /checkedAt|durationMs/);
  assert.equal(candidatesText([]), "No search results returned.");
});

for (const matches of [0, 1, 2]) {
  test(`pasted URL resolves its exact external DB association (${matches} matches)`, async (t) => {
    const key = process.env.EXA_API_KEY;
    process.env.EXA_API_KEY = "fixture";
    const calls: string[] = [];
    const events: InspectionStreamEvent[] = [];
    t.mock.method(
      globalThis,
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request =
          input instanceof Request ? input : new Request(input, init);
        const url = new URL(request.url);
        calls.push(url.pathname);
        if (url.pathname === "/rest/v1/company_roles") {
          assert.equal(request.method, "GET");
          assert.equal(url.searchParams.get("source_type"), "eq.external");
          assert.equal(
            url.searchParams.get("external_jd_url"),
            `in.(${role.originalUrl})`
          );
          return Response.json(
            Array.from({ length: matches }, (_, i) => ({
              role_id: i ? "00000000-0000-4000-8000-000000000002" : role.id,
              name: role.name,
              external_jd_url: role.originalUrl,
              location_text: role.location,
              company_workspace: {
                company_name: role.company,
                homepage_url: role.homepage,
              },
            }))
          );
        }
        assert.equal(request.url, "https://api.exa.ai/contents");
        const body = await request.json();
        assert.deepEqual(body.urls, [role.originalUrl]);
        assert.equal(typeof body.summary.query, "string");
        return Response.json({
          results: [
            {
              title: "Fixture Engineer",
              summary:
                "Hiring company: Fixture. Job: Engineer. Location: Seoul.",
            },
          ],
          costDollars: { total: 0.002 },
        });
      }
    );
    try {
      const result = await runResolvedInspectionDebug(
        role.originalUrl!,
        new AbortController().signal,
        (e) => events.push(e),
        {
          loadSource: loadInspectionSource,
          resolve: async ({ role: source, previous }) => {
            assert.equal(source.id, matches === 1 ? role.id : null);
            if (matches !== 1) {
              assert.match(
                roleSearchText(source, previous),
                /Source page evidence:\nHiring company: Fixture/
              );
            }
            return {
              query: "Fixture Engineer careers",
              candidates: [],
              selectedUrl: "https://ats.example/job",
              reason: "Official job",
              durationMs: 1,
              costUsd: null,
            };
          },
          save: async (savedRole, expected) => {
            assert.equal(
              matches,
              1,
              "An ambiguous or unlinked URL must not mutate a role"
            );
            assert.equal(savedRole.id, role.id);
            assert.equal(expected, role.originalUrl);
            calls.push("save");
          },
          inspect: async (url) => form("read", String(url)),
        }
      );
      assert.deepEqual(
        calls,
        matches === 1
          ? ["/rest/v1/company_roles", "save"]
          : ["/rest/v1/company_roles", "/contents"]
      );
      assert.equal(
        result.resolution?.savedUrl,
        matches === 1 ? "https://ats.example/job" : null
      );
      assert.equal(result.usage.contentRequests, matches === 1 ? 0 : 1);
      assert.equal(result.usage.contentCostUsd, matches === 1 ? null : 0.002);
      assert.equal(events[0].type, "started");
      if (matches !== 1) {
        assert.ok(
          events.some(
            (e) => e.type === "usage" && e.usage.unpricedContentRequests === 1
          )
        );
        assert.ok(
          events.some(
            (e) => e.type === "usage" && e.usage.contentCostUsd === 0.002
          )
        );
      }
    } finally {
      if (key === undefined) delete process.env.EXA_API_KEY;
      else process.env.EXA_API_KEY = key;
    }
  });
}
