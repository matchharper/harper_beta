import assert from "node:assert/strict";
import test from "node:test";
import { resourcePgliteTransport } from "../../../../scripts/evaluation/resourcePgliteTransport";
import { createCareerResourceFixture, careerFixtureUserA as userA, careerFixtureUserB as userB } from "./databaseFixture";
import { formatCompanyTargets, readCompanyDetails, readCompanyProjections } from "./companyData";
import { readResource } from "./read";
import type { WebSearchResponse } from "@/lib/tools/webSearch";

test("shared employer detail, resolver authority and cold overview refresh", { timeout: 60_000 }, async t => {
  // The registered tool catalog imports the application model client. All
  // searches in this database test use the injected local provider below.
  process.env.OPENAI_API_KEY ??= "fixture-only";
  const { CAREER_RESOURCE_TOOLS } = await import("./tools");
  const db = await createCareerResourceFixture();
  const admin = resourcePgliteTransport(db);
  const a = { admin, userId: userA }, b = { admin, userId: userB };
  const official = { name: "Fixture Systems", officialWebsite: "https://fixture.example" };
  // The first saved overview creates the company's workspace; later reads use its ref.
  let employer = { kind: "company_workspace" as const, id: "" };
  const article = "https://fixture.example/announcements/launch";
  const read = async (input: Record<string, unknown>) => {
    const result = await CAREER_RESOURCE_TOOLS.read_resources.execute!(input, b);
    return (result as { modelOutput: string }).modelOutput;
  };
  try {
    const captured = (await db.query<{ value: { documentId: number; observationId: string } }>(
      "select career_capture_public_source_v1($1,$2,'Launch','Official launch','hash', $3::jsonb) value",
      ["public:" + article, article, { scope: "public", provider: "exa_search", contract: "fixture" }]
    )).rows[0].value;
    const response: WebSearchResponse = {
      query: "public query", coverage: "fixture", structuredContent: "First paragraph.\n\nLonger company detail.",
      structuredSourceUrls: [article + "#launch"], results: [{ title: "Launch", url: article, highlights: [],
        resourceRef: { kind: "web_resource", id: String(captured.documentId), revision: captured.observationId } }],
    };
    let searches = 0;
    const search = async () => { searches++; await new Promise(resolve => setTimeout(resolve, 40)); return response; };
    await t.test("concurrent cold reads run one grounded search and create one summary; a fresh read reuses it", async () => {
      const [first, second] = await Promise.all([a, b].map(context =>
        readCompanyProjections(context, [official], { mode: "detail", refresh: true, search })));
      assert.equal(searches, 1);
      const one = [...first.values()][0], two = [...second.values()][0];
      assert.equal(one.summary?.content, response.structuredContent);
      assert.equal(two.summary?.dataRef.id, one.summary?.dataRef.id);
      assert.equal(one.companyRef.kind, "company_workspace");
      employer = { kind: "company_workspace", id: one.companyRef.id };
      assert.equal(one.summary?.sources?.[0]?.url, article);
      assert.equal((await db.query("select id from company_datas")).rows.length, 1);
      assert.equal((await db.query("select company_workspace_id from company_workspace")).rows.length, 1);
      await readCompanyProjections(b, [employer], { mode: "detail", refresh: true, search });
      assert.equal(searches, 1);
    });
    await t.test("a company ref read returns its workspace with the shared overview", async () => {
      const result = await CAREER_RESOURCE_TOOLS.read_resources.execute!(
        { refs: [employer], refreshSummary: false }, b
      ) as { items: Array<Awaited<ReturnType<typeof readResource>>>; modelOutput: string };
      const [item] = result.items;
      assert.deepEqual(item.publicCompany?.companyRef, { kind: "company_workspace", id: employer.id });
      assert.match(result.modelOutput, /First paragraph/);
      assert.equal((await readResource(b, item.ref)).status, "available");
    });
    const evidence = [{ kind: "observation", id: captured.observationId }];
    const label = (await db.query<{ value: { dataRef: { kind: "company_datum"; id: string; revision: string } } }>(
      "select career_write_company_datum_v1($1,'markets','Customer sectors and launch details.',$2,null,$3) value",
      [employer, JSON.stringify(evidence), crypto.randomUUID()])).rows[0].value;
    await t.test("researching a selected saved topic uses its full public entry and records the exact material used", async () => {
      const { processResourceOperation } = await import("./operations");
      const { careerExecutionEnvironment } = await import("../executionEnvironment");
      const operationId = crypto.randomUUID();
      const current = (await readResource(b, employer)).ref;
      await db.query("insert into talent_external_operations(id,user_id,idempotency_key,kind,request) values($1,$2,'topic-read','resource_research',$3)", [
        operationId, userB, { selection: { refs: [current] }, labels: ["markets"], questions: [],
          companyEvidenceQuery: "", execution_environment: careerExecutionEnvironment() },
      ]);
      await processResourceOperation(b, operationId, 1, Date.now() + 120_000);
      const child = (await db.query<{ status: string; request: { sourceRefs: Array<{ id: string }> }; result: {
        modelOutput: string; searches: unknown[]; pageReads: unknown[];
      } }>("select status,request,result from talent_external_operations where kind='resource_item'")).rows[0];
      assert.equal(child?.status, "completed");
      assert.match(child.result.modelOutput, /Customer sectors and launch details/);
      assert.ok(child.request.sourceRefs.some(ref => ref.id === label.dataRef.id));
      assert.ok(child.request.sourceRefs.some(ref => ref.id === captured.observationId));
      assert.deepEqual([child.result.searches, child.result.pageReads], [[], []]);
    });
    await t.test("B reads a name and selected label with exact sources, even when the summary needs refreshing", async () => {
      await db.query("update company_datas set checked_at=now()-interval '90 days' where label='summary'");
      const model = await read({ target: { name: official.name }, labels: ["markets"] });
      assert.match(model, /Customer sectors and launch details/);
      assert.match(model, /First paragraph/);
      assert.match(model, /Longer company detail/);
      assert.ok(model.includes(article));
      assert.ok(model.includes(captured.observationId));
      assert.ok(model.includes(label.dataRef.id));
      const datum = await readResource(b, label.dataRef);
      assert.equal(datum.body, "Customer sectors and launch details.");
      const outdated = await readResource(b, { ...label.dataRef, revision: "99" });
      assert.equal(outdated.status, "version_unavailable");
      assert.equal(outdated.latestRef?.id, label.dataRef.id);
      assert.equal(searches, 1);
    });
    await t.test("a stale overview answers at once; a failed background check keeps it, a later one replaces it", async () => {
      const pending: Promise<unknown>[] = [];
      const defer = (task: () => Promise<unknown>) => { pending.push(task()); };
      const failed = await readCompanyProjections(b, [employer], { mode: "detail", refresh: true, defer, search: async () => { throw Error("offline"); } });
      const stale = [...failed.values()][0];
      assert.equal(stale.state, "stale");
      assert.equal(stale.summary?.content, response.structuredContent);
      assert.match(stale.refreshNote ?? "", /background/);
      await Promise.all(pending.splice(0));
      assert.equal((await db.query("select * from career_company_summary_leases")).rows.length, 0);
      let resolveSearch!: () => void;
      const searchDone = new Promise<void>(resolve => { resolveSearch = resolve; });
      const answered = await readCompanyProjections(a, [employer], {
        mode: "detail", refresh: true, defer, search: async () => {
          await searchDone;
          return { ...response, structuredContent: "Updated overview [1][2].\n\nUpdated full detail.", structuredSourceUrls: [article, "https://uncaptured.example/other"] };
        },
      });
      // The reply does not wait for the provider call.
      assert.equal([...answered.values()][0].summary?.dataRef.revision, "1");
      resolveSearch();
      await Promise.all(pending.splice(0));
      const updated = await readCompanyProjections(a, [employer], { mode: "detail" });
      // A citation outside the captured results does not discard the grounded overview.
      assert.equal([...updated.values()][0].summary?.dataRef.revision, "2");
      assert.equal([...updated.values()][0].state, "current");
      // Each numbered citation becomes a link to its source.
      assert.match([...updated.values()][0].summary?.content ?? "", new RegExp(`Updated overview \\[1\\]\\(${article.replaceAll(".", "\\.")}\\)\\[2\\]\\(https://uncaptured\\.example/other\\)`));
    });
    await t.test("same employer appears once across many Roles, while anonymous, GTM mismatch, foreign and personal opportunities expose nothing", async () => {
      const publicWorkspace = employer.id, host = crypto.randomUUID(), external = crypto.randomUUID(), named = crypto.randomUUID(),
        anonymous = crypto.randomUUID(), gtm = crypto.randomUUID(), badGtm = crypto.randomUUID(), posting = crypto.randomUUID(),
        anonymousPosting = crypto.randomUUID(), opportunity = crypto.randomUUID(), personal = crypto.randomUUID();
      await db.query("insert into company_workspace(company_workspace_id,company_name,is_internal) values ($1,'Operating tenant',true)", [host]);
      await db.query("insert into company_internal_roles(role_id,is_anonymous) values($1,false),($2,true)", [named, anonymous]);
      await db.exec(`create or replace function read_career_internal_role_v1(uuid,uuid) returns jsonb language sql as $$
          select jsonb_build_object('companyName',case when i.is_anonymous then 'Company' else w.company_name end,
            'factsSource',jsonb_build_object('kind',case when i.is_anonymous then 'public_postings' else 'role' end))
          from company_internal_roles i join company_roles r using(role_id) join company_workspace w using(company_workspace_id)
          where i.role_id=$2 $$`);
      await db.query("insert into company_roles(role_id,company_workspace_id,source_type,information) values($1,$2,'external','{}'),($3,$2,'internal','{}'),($4,$2,'internal','{}'),($5,$6,'external',$7),($8,$6,'external',$9)",
        [external, publicWorkspace, named, anonymous, gtm, host,
          { purpose: "gtm_outreach", gtm: { companyName: official.name, sourceWorkspaceId: publicWorkspace } },
          badGtm, { purpose: "gtm_outreach", gtm: { companyName: "Different employer", sourceWorkspaceId: publicWorkspace } }]);
      await db.query("insert into official_jobs(id,is_published,role_id,company_name,company_website_url) values($1,true,null,$2,$3),($4,true,$5,$2,$3)",
        [posting, official.name, official.officialWebsite, anonymousPosting, anonymous]);
      await db.query("insert into talent_messages(id,user_id,content) overriding system value values(123,$1,'private discussion')", [userA]);
      await db.query("insert into career_opportunities(id,talent_id,primary_ref,title,evidence_refs) values($1,$2,$3,'Opening','[]'),($4,$2,$5,'Personal',$6)",
        [opportunity, userA, { kind: "role", id: external }, personal, { kind: "message", id: "123" }, JSON.stringify([employer])]);
      const publicRefs = [{ kind: "company_workspace" as const, id: publicWorkspace }, { kind: "posting" as const, id: posting },
        ...[external, named, gtm].map(id => ({ kind: "role" as const, id })), { kind: "opportunity" as const, id: opportunity }];
      const all = await readCompanyProjections(a, publicRefs, { mode: "list", refresh: true, search });
      assert.equal(all.size, publicRefs.length);
      const model = formatCompanyTargets(all);
      assert.equal(model.match(/Updated overview/g)?.length, 1);
      assert.doesNotMatch(model, /Updated full detail/);
      assert.match(model, /Saved company labels: markets \(1 entry, last checked [^)]+\), summary \(1 entry/);
      assert.match(model, /Read saved label bodies with read_companies/);
      for (const target of [{ kind: "role" as const, id: anonymous }, { kind: "role" as const, id: badGtm },
        { kind: "posting" as const, id: anonymousPosting }, { kind: "opportunity" as const, id: personal }]) {
        assert.equal((await readCompanyProjections(a, [target], { mode: "detail", refresh: true, search })).size, 0);
      }
      assert.equal((await readCompanyProjections(b, [{ kind: "opportunity", id: opportunity }], { mode: "detail", refresh: true, search })).size, 0);
      assert.equal(searches, 1);
    });
    await t.test("homonyms return each public choice without fetching or writing; a missing name cannot create a company", async () => {
      await db.query("update company_datas set content=content||' OpsBrand is our product.' where label='summary'");
      const brand = await read({ target: { name: "OpsBrand" } });
      assert.match(brand, /No exact company name matched/);
      assert.ok(brand.includes(official.name) && brand.includes("Saved company labels: markets (1 entry"));
      assert.doesNotMatch(brand, /Updated full detail/);
      const topic = await read({ target: { name: "OpsBrand" }, companyEvidenceQuery: "customer sectors financing roadmap" });
      assert.match(topic, /Customer sectors and launch details/);
      assert.ok(topic.includes(label.dataRef.id) && topic.includes(article) && topic.includes(captured.observationId));
      const source = await read({ target: { name: "OpsBrand" }, companyEvidenceQuery: "launch" });
      assert.match(source, /Official launch/);
      await db.query("insert into company_workspace(company_name,homepage_url,external_roles_enabled,is_internal) values($1,'https://other.example',true,false)", [official.name]);
      const options = await read({ target: { name: official.name } });
      assert.match(options, /Several public companies/);
      assert.ok(options.includes("https://other.example") && options.includes(official.officialWebsite));
      const chosen = await read({ target: official });
      assert.ok(chosen.includes(employer.id) && !/Several public companies/.test(chosen));
      const missing = await read({ target: { name: "Unregistered" } });
      assert.match(missing, /No matching public company/);
      assert.equal((await db.query("select company_workspace_id from company_workspace")).rows.length, 3);
      assert.equal(searches, 1);
    });
    await t.test("existing directory reads survive a staged deployment; other errors surface", async () => {
      await db.exec("alter function career_read_public_company_targets_v1(uuid,jsonb) rename to hidden_company_targets");
      const old = await read({ refs: [employer] });
      assert.ok(old.includes(official.name));
      assert.match(await read({ target: official }), /Shared company materials are unavailable/);
      await db.exec(`create function career_read_public_company_targets_v1(p_user uuid,p_refs jsonb) returns jsonb language plpgsql as $$
        begin raise exception 'test permission error' using errcode='42501'; end $$`);
      await assert.rejects(readCompanyDetails(b, [official], { mode: "detail" }), /test permission error/);
    });
  } finally {
    await db.close();
  }
});
