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

test("web_search exposes ten results as its default and maximum", () => {
  const maxResults =
    WEB_SEARCH_TOOL_DEFINITION.function.parameters.properties.maxResults;
  assert.equal(maxResults.default, 10);
  assert.equal(maxResults.maximum, 10);
});

test("structured_text requests one text answer and delivers its sources to both agents", async () => {
  const answer = "A grounded answer.\n\nWith its original paragraphs.";
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
              results: [],
              output: {
                content: answer,
                grounding: [{
                  field: "answer",
                  confidence: "medium",
                  citations: [{ title: "Original source", url: "https://example.com/source" }],
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
      assert.ok(rendered.includes(answer));
      assert.ok(rendered.includes("https://example.com/source"));
      assert.ok(rendered.includes("confidence: medium"));
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
      order() { return query; }, limit() { return query; },
      async maybeSingle() {
        reads.push(url);
        if (url.endsWith("/failed")) return { data: null, error: { message: "Fixture page unavailable" } };
        return { data: { id: reads.length, url, title: `Page ${url}`, markdown: `Content for ${url}`,
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
  await assert.rejects(executeSharedOpenUrl({ admin, input: { url: [] } }), /non-empty/);
});
