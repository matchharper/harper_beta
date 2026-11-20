import assert from "node:assert/strict";
import test from "node:test";
import { serializeToolResultForModel } from "@/lib/llm/toolError";
import { serializeOrgAgentToolResult } from "@/lib/org/agent/promptFormat";
import {
  executeSharedWebSearch,
  WEB_SEARCH_TOOL_DEFINITION,
} from "@/lib/agentTools/web";

const logAdmin = {
  from(table: string) {
    assert.equal(table, "logs");
    return { insert: async () => ({ error: null }) };
  },
} as never;

test("web_search stores Exa text but returns only compact search metadata", async () => {
  let searchOptions: unknown = null;
  const insertedRows: Array<Record<string, unknown>> = [];
  const builder = {
    eq() {
      return builder;
    },
    insert(row: Record<string, unknown>) {
      insertedRows.push(row);
      return builder;
    },
    limit() {
      return builder;
    },
    maybeSingle: async () => ({ data: null, error: null }),
    order() {
      return builder;
    },
    select() {
      return builder;
    },
    single: async () => ({
      data: { created_at: "2026-08-11T00:00:00.000Z", id: 42 },
      error: null,
    }),
  };
  const admin = {
    async rpc(name: string, args: Record<string, unknown>) {
      assert.equal(name, "career_capture_public_source_v1");
      insertedRows.push({ url: args.p_url, markdown: args.p_content });
      assert.equal((args.p_provenance as Record<string, unknown>).scope, "public");
      assert.equal(JSON.stringify(args.p_provenance).includes("latest AI infrastructure news"), false);
      return { data: { documentId: 42, observationId: "obs-1", observedAt: "2026-08-11T00:00:00.000Z" }, error: null };
    },
    from(table: string) {
      assert.equal(table, "documents");
      return builder;
    },
  } as never;
  const result = await executeSharedWebSearch(
    { maxResults: 3, query: "latest AI infrastructure news" },
    {
      admin,
      logging: { admin: logAdmin },
      exa: {
        search: async (_query: string, options: unknown) => {
          searchOptions = options;
          return {
            requestId: "request-1",
            results: [
              {
                author: "Reporter",
                highlights: ["A compact relevant passage"],
                id: "result-1",
                publishedDate: "2026-08-11T00:00:00.000Z",
                text: "FULL TEXT THAT MUST NOT REACH THE LLM",
                title: "Example result",
                url: "https://example.com/article#section",
              },
            ],
          };
        },
      } as never,
    }
  );

  assert.deepEqual(searchOptions, {
    contents: {
      highlights: { maxCharacters: 500 },
      text: { maxCharacters: 15_000 },
    },
    numResults: 3,
    type: "auto",
  });
  assert.equal(insertedRows.length, 1);
  assert.equal(insertedRows[0]?.url, "https://example.com/article");
  assert.equal(
    insertedRows[0]?.markdown,
    "FULL TEXT THAT MUST NOT REACH THE LLM"
  );
  assert.deepEqual(result.results, [
    {
      author: "Reporter",
      highlights: ["A compact relevant passage"],
      publishedDate: "2026-08-11T00:00:00.000Z",
      rank: 1,
      title: "Example result",
      url: "https://example.com/article",
    },
  ]);
  assert.equal(JSON.stringify(result).includes("FULL TEXT"), false);
});

test("web_search exposes the provider's request limit and a separate default", () => {
  const maxResults =
    WEB_SEARCH_TOOL_DEFINITION.function.parameters.properties.maxResults;
  assert.equal(maxResults.default, 10);
  assert.equal(maxResults.maximum, 100);
});

test("Career receives exact public capture references without another search or lookup", async () => {
  let searches = 0, captures = 0;
  const result = await executeSharedWebSearch({ query: "A public employer" }, {
    resourceRefs: true,
    logging: { admin: logAdmin },
    admin: {
      async rpc(name: string) {
        assert.equal(name, "career_capture_public_source_v1"); captures++;
        return { data: { documentId: 42, observationId: "exact-observation", observedAt: "2026-11-15T00:00:00Z" }, error: null };
      },
      from() { throw new Error("No later/current-version lookup is needed"); },
    } as never,
    exa: { async search() {
      searches++;
      return { results: [
        { url: "https://example.com/team", title: "Team", text: "Complete public body", highlights: ["Evidence"] },
        { url: "https://example.com/lead", title: "Unread lead", highlights: ["Metadata only"] },
      ] };
    } } as never,
  });
  assert.equal(searches, 1); assert.equal(captures, 1);
  assert.deepEqual(result.results[0].resourceRef, { kind: "web_resource", id: "42", revision: "exact-observation" });
  assert.equal(result.results[1].resourceRef, undefined);
  assert.match(serializeToolResultForModel(result), /kind=web_resource; id=42; revision=exact-observation/);
  assert.doesNotMatch(serializeToolResultForModel(result), /Complete public body/);
  const { webResultRef } = await import("../career/resources/webResult");
  assert.deepEqual(await webResultRef({ admin: {} as never, userId: "another-local-candidate" }, result.results[0]), result.results[0].resourceRef);
});

test("structured_text requests one text answer and delivers its sources to both agents", async () => {
  const answer = "A grounded answer [1].\n\nWith its original paragraphs [2].";
  const description = "설립 시점과 배경을 설명해줘.\n확인되지 않은 내용은 구분해줘.";
  assert.equal(WEB_SEARCH_TOOL_DEFINITION.function.parameters.properties.structured_text.type, "string");
  for (const structuredText of [undefined, "", description]) {
    let searchOptions: any;
    const result = await executeSharedWebSearch(
      { query: "A factual question", structured_text: structuredText },
      {
        admin: {} as never,
        logging: { admin: logAdmin },
        exa: {
          search: async (_query: string, options: unknown) => {
            searchOptions = options;
            return {
              results: [
                { title: "Unrelated", url: "https://example.com/unrelated", highlights: ["Other"] },
                { title: "Original source", url: "https://example.com/source", highlights: ["Evidence"] },
              ],
              output: {
                content: answer,
                grounding: [{
                  field: "answer",
                  confidence: "medium",
                  citations: [
                    { title: "Original source", url: "https://example.com/source" },
                    { title: "Not in results", url: "https://example.org/elsewhere" },
                  ],
                }],
              },
            };
          },
        } as never,
      }
    );
    assert.equal(searchOptions.type, "auto");
    assert.equal(searchOptions.contents.summary, undefined);
    if (!structuredText) {
      assert.equal(searchOptions.outputSchema, undefined);
      assert.equal("structured_text" in result, false);
      continue;
    }
    assert.deepEqual(searchOptions.outputSchema, { type: "text", description });
    assert.equal(typeof result.structured_text, "string");
    for (const rendered of [
      serializeToolResultForModel(result),
      serializeOrgAgentToolResult("web_search", result),
    ]) {
      // [1] cites the second listed result; a source outside the list keeps its URL.
      assert.ok(rendered.includes("A grounded answer [2].\n\nWith its original paragraphs [https://example.org/elsewhere]."));
      assert.ok(rendered.includes("https://example.com/source"));
      assert.doesNotMatch(rendered, /confidence: medium/);
    }
  }
});

test("structured_text preserves search results when Exa returns no synthesis", async () => {
  const result = await executeSharedWebSearch(
    { query: "A factual question", structured_text: "Explain the answer." },
    {
      admin: {} as never,
      logging: { admin: logAdmin },
      exa: {
        search: async () => ({
          results: [{ title: "Source", url: "https://example.com/source", highlights: ["Evidence"] }],
        }),
      } as never,
    }
  );
  assert.equal(result.structured_text, null);
  assert.equal(result.resultCount, 1);
  assert.equal(result.results[0].highlights[0], "Evidence");
  assert.match(serializeOrgAgentToolResult("web_search", result), /No synthesized answer returned/);
});

test("mock extraction requires execution context rather than model arguments", async () => {
  for (const searchPurpose of [undefined, "mock_interview"] as const) {
    let capturedQuery = "";
    let capturedOptions: unknown;
    await executeSharedWebSearch(
      { query: "role interview experience", searchPurpose: "mock_interview" },
      {
        admin: {} as never,
        logging: { admin: logAdmin },
        searchPurpose,
        exa: {
          search: async (query: string, options: unknown) => {
            capturedQuery = query;
            capturedOptions = options;
            return { results: [] };
          },
        } as never,
      }
    );
    assert.equal(capturedQuery, "role interview experience");
    const options = capturedOptions as {
      contents: { highlights: { query?: string; maxCharacters: number } };
      numResults: number;
      type: string;
    };
    assert.equal(options.numResults, 10);
    assert.equal(options.type, "auto");
    if (searchPurpose) {
      assert.equal(options.contents.highlights.maxCharacters, 2500);
      assert.match(
        options.contents.highlights.query ?? "",
        /problem statements, constraints/
      );
      assert.match(
        options.contents.highlights.query ?? "",
        /when relevant to the role/
      );
    } else {
      assert.deepEqual(options.contents.highlights, { maxCharacters: 500 });
    }
  }
});

test("open_url batches independent pages, preserves order and exposes partial failures", async () => {
  const { executeSharedOpenUrl, OPEN_URL_TOOL_DEFINITION } = await import("./web");
  const reads: string[] = [];
  const admin = { from: () => {
    let url = "";
    const query = {
      select() { return query; }, in(_key: string, urls: string[]) { url = urls[0]; return query; },
      order() { return query; }, limit() { return query; }, eq() { return query; },
      async maybeSingle() {
        reads.push(url);
        if (url.endsWith("/failed")) return { data: null, error: { message: "Fixture page unavailable" } };
        return { data: { id: reads.length, url, source_scope: "public", current_observation_id: `obs-${reads.length}`, title: `Page ${url}`, markdown: `Content for ${url}`,
          excerpt: "Excerpt", created_at: "2026-11-06T00:00:00Z" }, error: null };
      },
    };
    return query;
  } } as never;
  assert.ok(OPEN_URL_TOOL_DEFINITION.function.parameters.properties.url.anyOf.some(s => s.type === "array"));
  const result = await executeSharedOpenUrl({ admin, input: { url: ["https://example.test/a", "https://example.test/failed", "https://example.test/b"] } });
  assert.ok("pages" in result);
  assert.equal(result.status, "partial");
  assert.deepEqual(result.pages.map(p => p.ok), [true, false, true]);
  assert.deepEqual(reads, ["https://example.test/a", "https://example.test/failed", "https://example.test/b"]);
  for (const rendered of [serializeToolResultForModel(result), serializeOrgAgentToolResult("open_url", result)]) {
    assert.match(rendered, /Content for https:\/\/example.test\/a/);
    assert.match(rendered, /Read failed/);
    assert.match(rendered, /Content for https:\/\/example.test\/b/);
    assert.doesNotMatch(rendered, /2026-11-06T|\[object Object\]/);
  }
  const single = await executeSharedOpenUrl({ admin, input: { url: "https://example.test/a" } });
  assert.ok("markdown" in single);
  assert.equal(single.markdown, "Content for https://example.test/a");
  const careerSingle = await executeSharedOpenUrl({ admin, resourceRefs: true, input: { url: "https://example.test/a" } });
  assert.match(serializeToolResultForModel(careerSingle), /kind=web_resource; id=5; revision=obs-5/);
  const careerBatch = await executeSharedOpenUrl({ admin, resourceRefs: true, input: { url: ["https://example.test/a", "https://example.test/failed"] } });
  assert.match(serializeToolResultForModel(careerBatch), /kind=web_resource; id=6; revision=obs-6/);
  assert.match(serializeToolResultForModel(careerBatch), /Read failed/);
  await assert.rejects(executeSharedOpenUrl({ admin, input: { url: [] } }), /non-empty/);
});
