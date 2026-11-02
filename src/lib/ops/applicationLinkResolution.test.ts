import test from "node:test";
import assert from "node:assert/strict";
import { client } from "@/lib/llm/llm";
import {
  runInspectionAgent,
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

test("one agent run searches and extracts again after a login barrier; provider receives text evidence", async (t) => {
  const key = process.env.EXA_API_KEY;
  process.env.EXA_API_KEY = "fixture";
  t.after(() => {
    if (key === undefined) delete process.env.EXA_API_KEY;
    else process.env.EXA_API_KEY = key;
  });
  const exactRole = {
    ...role,
    name: "Senior Research Engineer—Generative AI / World Model",
  };
  const requests: Record<string, any>[] = [];
  const steps = [
    ["web_search", { query: `${exactRole.company} ${exactRole.name} careers` }],
    ["extract_to_ready", { url: "https://platform.example/job" }],
    [
      "web_search",
      { query: `${exactRole.company} ${exactRole.name} official ATS` },
    ],
    ["extract_to_ready", { url: "https://ats.example/job" }],
  ] as const;
  t.mock.method(
    client.responses,
    "create",
    async (request: Record<string, any>) => {
      requests.push(structuredClone(request));
      const index = requests.length - 1;
      return {
        status: "completed",
        id: `response-${index}`,
        model: "gpt-6-luna",
        usage: { input_tokens: 100, output_tokens: 10 },
        output:
          index < steps.length
            ? [
                {
                  type: "reasoning",
                  id: `reason-${index}`,
                  summary: [],
                  encrypted_content: `encrypted-${index}`,
                },
                {
                  type: "function_call",
                  call_id: `call-${index}`,
                  name: steps[index][0],
                  arguments: JSON.stringify(steps[index][1]),
                },
              ]
            : [],
        output_text:
          index < steps.length
            ? ""
            : JSON.stringify({
                attemptId: 2,
                reason: "ATS에서 지원 항목 확인",
              }),
      };
    }
  );
  let exaCalls = 0;
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "https://api.exa.ai/search");
    assert.equal(JSON.parse(String(init.body)).numResults, 10);
    assert.ok(init.signal);
    exaCalls++;
    return Response.json({
      results: [
        {
          title: "Official",
          url:
            exaCalls === 1
              ? "https://platform.example/job"
              : "https://ats.example/job",
          highlights: ["Fixture is hiring the exact role"],
        },
      ],
      costDollars: { total: 0.02 },
    });
  });
  const sequence: string[] = [];
  const observed = {
    ...form("read", "https://ats.example/application"),
    checkedAt: "2026-10-29T01:02:03.456Z",
    text: "Upload your resume",
  };
  const result = await runResolvedInspectionDebug(
    exactRole,
    new AbortController().signal,
    () => {},
    {
      inspect: async (url) => {
        sequence.push(String(url));
        return String(url).includes("platform")
          ? {
              ...form("unavailable", String(url)),
              limitations: ["Login required"],
              submission: { status: "unsupported" },
            }
          : observed;
      },
      save: async (savedRole, previous, url) => {
        assert.equal(savedRole.id, role.id);
        assert.equal(previous, role.originalUrl);
        sequence.push(`save:${url}`);
      },
    }
  );
  assert.deepEqual(sequence, [
    "https://platform.example/job",
    "https://ats.example/job",
    "save:https://ats.example/application",
  ]);
  assert.equal(result.form, observed);
  assert.equal(result.resolution?.attempts.length, 2);
  assert.equal(
    result.resolution?.searches[1].selectedUrl,
    "https://ats.example/job"
  );
  assert.equal(exaCalls, 2);
  assert.equal(requests.length, 5);
  assert.equal(result.usage.requests, 5);
  assert.equal(result.usage.searchCostUsd, 0.04);
  assert.equal(result.usage.unpricedRequests, 0);
  assert.match(
    requests[0].input[0].content,
    new RegExp(`Role: ${exactRole.name}`)
  );
  assert.deepEqual(
    requests[0].tools.map((tool: any) => tool.name),
    ["web_search", "extract_to_ready"]
  );
  assert.match(
    requests[0].instructions,
    /web_search at most 2 times TOTAL and extract_to_ready at most 2 times TOTAL/
  );
  assert.match(
    requests[0].instructions,
    /Ashby, Greenhouse, Greeting, Ninehire/
  );
  assert.equal(requests[0].parallel_tool_calls, false);
  assert.equal(requests[0].text.format.strict, true);
  assert.deepEqual(requests[0].include, ["reasoning.encrypted_content"]);
  const finalInput = requests[4].input;
  assert.ok(
    finalInput.some((item: any) => item.encrypted_content === "encrypted-0")
  );
  const outputs = finalInput
    .filter((item: any) => item.type === "function_call_output")
    .map((item: any) => item.output);
  assert.match(
    outputs[0],
    /Candidate 1: Official\nURL: https:\/\/platform.example\/job/
  );
  assert.match(outputs[1], /Assisted submission access: unsupported/);
  assert.match(outputs[1], /Login required/);
  assert.match(outputs[3], /attemptId: 2/);
  assert.match(outputs[3], /checkedAt: 2026-10-29 10:02/);
  assert.match(outputs[3], /web_search 2\/2; extract_to_ready 2\/2/);
  assert.doesNotMatch(
    outputs.join("\n"),
    /"highlights"|"submission"|2026-10-29T/
  );
});

test("agent can inspect directly and select an earlier observation after a worse result", async () => {
  const first = form("read", "https://ats.example/first");
  const result = await runResolvedInspectionDebug(
    role,
    new AbortController().signal,
    () => {},
    {
      agent: async ({ extract }) => {
        const chosen = await extract("https://ats.example/first");
        await extract("https://ats.example/second");
        return { attemptId: chosen.attemptId, reason: "첫 관찰 선택" };
      },
      inspect: async (url) =>
        url === first.url ? first : form("unavailable", String(url)),
      search: async () => assert.fail("search is optional"),
      save: async (_role, _previous, url) => assert.equal(url, first.url),
    }
  );
  assert.equal(result.form, first);
  assert.equal(result.resolution?.searches.length, 0);
});

test("failed extraction is returned as text and counted so the agent can choose another URL", async (t) => {
  const requests: Record<string, any>[] = [];
  t.mock.method(
    client.responses,
    "create",
    async (request: Record<string, any>) => {
      requests.push(structuredClone(request));
      const index = requests.length;
      return {
        status: "completed",
        id: `r${index}`,
        model: "gpt-6-luna",
        output:
          index < 3
            ? [
                {
                  type: "function_call",
                  name: "extract_to_ready",
                  call_id: `c${index}`,
                  arguments: JSON.stringify({
                    url: `https://ats.example/${index}`,
                  }),
                },
              ]
            : [],
        output_text:
          index === 3
            ? JSON.stringify({ attemptId: 1, reason: "대체 링크" })
            : "",
      };
    }
  );
  const result = await runResolvedInspectionDebug(
    role,
    new AbortController().signal,
    () => {},
    {
      inspect: async (url) => {
        if (String(url).endsWith("/1"))
          throw Error("Browser service unavailable");
        return form("read", String(url));
      },
      save: async () => {},
    }
  );
  assert.equal(result.form.url, "https://ats.example/2");
  const errorOutput = requests[1].input.find(
    (item: any) => item.type === "function_call_output"
  ).output;
  assert.match(
    errorOutput,
    /Tool failed; no result was obtained. Browser service unavailable/
  );
  assert.match(errorOutput, /extract_to_ready 1\/2/);
});

test("no observation or invented attempt ID cannot mutate the role URL", async () => {
  const deps = {
    inspect: async () => assert.fail("must not browse"),
    save: async () => assert.fail("must not write"),
  };
  const result = await runResolvedInspectionDebug(
    role,
    new AbortController().signal,
    () => {},
    {
      ...deps,
      agent: async () => ({ attemptId: null, reason: "공식 공고 없음" }),
    }
  );
  assert.equal(result.form.status, "unavailable");
  assert.deepEqual(result.form.limitations, ["공식 공고 없음"]);
  await assert.rejects(
    runResolvedInspectionDebug(role, new AbortController().signal, () => {}, {
      ...deps,
      agent: async () => ({ attemptId: 99, reason: "invalid" }),
    }),
    /attemptId/
  );
});

test("URL conflict propagates and cancellation prevents subsequent work and saving", async () => {
  const abort = new AbortController();
  const agent: typeof runInspectionAgent = async ({ extract }) => ({
    attemptId: (await extract("https://ats.example/job")).attemptId,
    reason: "match",
  });
  await assert.rejects(
    runResolvedInspectionDebug(role, abort.signal, () => {}, {
      agent,
      inspect: async (url) => form("read", String(url)),
      save: async () => {
        throw Error("conflict");
      },
    }),
    /conflict/
  );
  await assert.rejects(
    runResolvedInspectionDebug(role, abort.signal, () => {}, {
      agent,
      inspect: async (url) => {
        abort.abort();
        return form("read", String(url));
      },
      save: async () => assert.fail("must not save after cancellation"),
    }),
    /abort/i
  );
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
          agent: async ({ role: source, previous, extract }) => {
            assert.equal(source.id, matches === 1 ? role.id : null);
            if (matches !== 1) {
              assert.match(
                roleSearchText(source, previous),
                /Source page evidence:\nHiring company: Fixture/
              );
            }
            return {
              attemptId: (await extract("https://ats.example/job")).attemptId,
              reason: "Official job",
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

test("a blocked route does not replace the original public job URL", async () => {
  const result = await runResolvedInspectionDebug(
    role,
    new AbortController().signal,
    () => {},
    {
      agent: async ({ extract }) => ({
        attemptId: (await extract("https://company.example/careers")).attemptId,
        reason: "login barrier",
      }),
      inspect: async () => ({
        ...form("unavailable", "https://company.example/login"),
        submission: { status: "unsupported" },
      }),
      save: async () =>
        assert.fail("must not save a listing or login as the job URL"),
    }
  );
  assert.equal(result.resolution?.savedUrl, role.originalUrl);
});
