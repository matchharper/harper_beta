import assert from "node:assert/strict";
import test from "node:test";
import {
  executeSharedWebSearch,
  WEB_SEARCH_TOOL_DEFINITION,
} from "@/lib/agentTools/web";

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
  const maxResults = WEB_SEARCH_TOOL_DEFINITION.function.parameters.properties
    .maxResults;
  assert.equal(maxResults.default, 10);
  assert.equal(maxResults.maximum, 10);
});
