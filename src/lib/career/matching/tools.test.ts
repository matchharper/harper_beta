import assert from "node:assert/strict";
import test from "node:test";

test("search_opportunities says postings arrived as text instead of reading the string's own properties", async () => {
  // The tool module constructs LLM and database clients on import; nothing calls them.
  process.env.OPENAI_API_KEY ??= "synthetic-no-network";
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "synthetic-no-network";
  const { CAREER_MATCHING_TOOLS } = await import("./tools");
  const admin = { from: () => { throw new Error("no read expected"); } };
  // Observed from a scheduled run: the whole search, top-level fields included, sent as one string.
  const postings = JSON.stringify({ roleTitles: ["Strategic Sourcing Manager"], countries: { US: { weight: 1 } }, limit: 15 });
  for (const input of [{ action: "search", postings }, { action: "search", companies: "AI infrastructure startups" }])
    await assert.rejects(
      CAREER_MATCHING_TOOLS.search_opportunities.execute!(input, { admin, userId: "00000000-0000-0000-0000-000000000001", toolCallId: "call-1" } as never),
      /^Error: (postings|companies) must be an object, not text\. Top-level arguments stay outside it\.$/
    );
});
