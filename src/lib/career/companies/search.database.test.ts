import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { CAREER_COMPANY_TOOLS } from "./tools";
import { formatToolResultText } from "@/lib/llm/promptText";

test("company search uses literal OR terms, deduplicates workspaces and pages without homepage/published-name matches", async (t) => {
  const db = new PGlite({ extensions: { pg_trgm } });
  t.after(() => db.close());
  await db.exec(`CREATE EXTENSION pg_trgm;
    CREATE TABLE company_workspace(company_workspace_id uuid PRIMARY KEY,
      company_db_id bigint,company_name text,homepage_url text,linkedin_url text,published_name text);
    INSERT INTO company_workspace VALUES
      ('00000000-0000-4000-8000-000000000001',1,'KRAFTON Inc.',NULL,'https://www.linkedin.com/company/krafton/',NULL),
      ('00000000-0000-4000-8000-000000000002',2,'토스 (Toss)',NULL,'https://linkedin.com/company/toss/',NULL),
      ('00000000-0000-4000-8000-000000000003',3,'Homepage only','https://krafton.example',NULL,NULL),
      ('00000000-0000-4000-8000-000000000004',4,'Published only',NULL,NULL,'크래프톤');`);
  await db.exec(
    await readFile(
      new URL(
        "../../../../supabase/migrations/20261106051550_company_workspace_search_indexes.sql",
        import.meta.url
      ),
      "utf8"
    )
  );
  await db.exec(await readFile(new URL(
    "../../../../supabase/migrations/20261106061504_company_workspace_estimated_search_score.sql",
    import.meta.url
  ), "utf8"));
  await db.exec("ALTER TABLE company_workspace ADD COLUMN test_score integer DEFAULT 0");
  let requests = 0;
  // Exercise the real Supabase client serialization. This fixture executes its
  // quoted imatch predicates with Postgres's own regex and NULL semantics.
  const admin = createClient("https://fixture.invalid", "fixture-only", {
    auth: { persistSession: false },
    global: {
      fetch: async (input, init) => {
        requests++;
        const url = new URL(String(input));
        assert.equal(url.pathname, "/rest/v1/company_workspace");
        assert.equal(init?.method, "GET");
        assert.doesNotMatch(
          new Headers(init?.headers).get("prefer") ?? "",
          /count=/
        );
        const filter = url.searchParams.get("or")!;
        assert.doesNotMatch(filter, /homepage_url|published_name/);
        const matches = [
          ...filter.matchAll(
            /(company_name|linkedin_url)\.imatch\.("(?:\\.|[^"\\])*")/g
          ),
        ];
        assert.ok(matches.length);
        const where = matches
          .map((m, index) => `${m[1]} ~* $${index + 1}`)
          .join(" OR ");
        const values = matches.map((m) => JSON.parse(m[2]));
        assert.equal(url.searchParams.get("order"),
          "test_score.desc.nullslast,company_name.asc,company_workspace_id.asc");
        const result = await db.query(
          `SELECT company_workspace_id,company_db_id,company_name,homepage_url,linkedin_url
          FROM company_workspace WHERE ${where}
          ORDER BY test_score DESC NULLS LAST, company_name, company_workspace_id
          OFFSET $${values.length + 1} LIMIT $${values.length + 2}`,
          [
            ...values,
            Number(url.searchParams.get("offset")),
            Number(url.searchParams.get("limit")),
          ]
        );
        return new Response(JSON.stringify(result.rows), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  });
  const search = async (input: Record<string, unknown>) =>
    (await CAREER_COMPANY_TOOLS.search_companies.execute!(input, {
      admin,
      userId: "fixture",
    })) as any;
  const result = await search({
    queries: ["크래프톤", "Krafton", "토스", "Toss", "Krafton"],
  });
  assert.equal(requests, 1);
  assert.deepEqual(
    result.companies.map((c: any) => c.name),
    ["KRAFTON Inc.", "토스 (Toss)"]
  );
  assert.deepEqual(result.companies[1].matchedQueries, ["토스", "Toss"]);
  assert.equal(result.nextOffset, null);
  const text = formatToolResultText(result);
  assert.match(text, /KRAFTON Inc.; company_workspace_id/);
  assert.match(text, /Matched queries: 토스, Toss/);
  assert.doesNotMatch(text, /Homepage only|Published only|company_db_id/);

  const linked = await search({
    queries: ["https://www.linkedin.com/company/krafton/"],
  });
  assert.equal(linked.companies.length, 1);
  assert.equal(linked.companies[0].name, "KRAFTON Inc.");
  const legacy = await search({ query: "Krafton" });
  assert.deepEqual(
    legacy.companies,
    (await search({ queries: ["Krafton"] })).companies
  );

  const literal = 'A.*_% "Labs", (KR)\\';
  await db.query(
    "INSERT INTO company_workspace(company_workspace_id,company_name) VALUES('00000000-0000-4000-8000-000000000005',$1)",
    [literal]
  );
  assert.equal(
    (await search({ queries: [literal] })).companies[0].name,
    literal
  );
  assert.equal((await search({ queries: ["*"] })).companies.length, 1);
  assert.equal(
    (await search({ queries: ["Not in directory"] })).companies.length,
    0
  );

  await db.exec(`INSERT INTO company_workspace(company_workspace_id,company_name)
    SELECT md5(i::text)::uuid,'Paged company ' || i FROM generate_series(1,41) i;`);
  const pages = [];
  for (let offset: number | null = 0; offset !== null; ) {
    const page = await search({ queries: ["Paged", "company"], offset });
    pages.push(page);
    offset = page.nextOffset;
  }
  assert.deepEqual(
    pages.map((p) => p.companies.length),
    [20, 20, 3]
  );
  const ids = pages.flatMap((p) =>
    p.companies.map((c: any) => c.companyWorkspaceId)
  );
  assert.equal(new Set(ids).size, ids.length);

  // test_score governs order even when the estimated prominence differs.
  await db.exec(`UPDATE company_workspace SET estimated_search_score = 18
    WHERE company_name = 'Paged company 9';
    UPDATE company_workspace SET estimated_search_score = 12 WHERE company_name = 'Paged company 3';
    UPDATE company_workspace SET test_score = 20 WHERE company_name = 'Paged company 7';
    UPDATE company_workspace SET test_score = 10 WHERE company_name = 'Paged company 3';`);
  const ranked = await search({ queries: ["Paged"] });
  assert.deepEqual(ranked.companies.slice(0, 3).map((c: any) => c.name),
    ["Paged company 7", "Paged company 3", "Paged company 1"]);
  assert.doesNotMatch(ranked.modelOutput, /estimated_search_score|test_score/);
});
