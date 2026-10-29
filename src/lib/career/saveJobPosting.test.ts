import assert from "node:assert/strict";
import test from "node:test";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { saveJobPosting } from "./saveJobPosting";
import { importCareerJobLink } from "./jobLinkImportServer";
import { getExaClient } from "@/lib/tools/exaClient";

test("saving a known external posting reuses the history importer and returns a compact card reference", async () => {
  const calls: Record<string, unknown>[] = [];
  const role = {
    role_id: "5de53c9d-48ab-460c-82aa-5b2f9ba81e40",
    company_workspace_id: "workspace",
    source_type: "external",
    source_provider: "user_submitted",
    source_job_id: "url:test",
    name: "Engineer",
    information: {},
  };
  const admin = {
    from: (table: string) => {
      assert.equal(table, "company_roles");
      const q = {
        select: () => q,
        eq: () => q,
        in: () => q,
        order: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: role, error: null }),
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: [role], error: null }).then(resolve),
      };
      return q;
    },
    rpc: async (name: string, input: Record<string, unknown>) => {
      assert.equal(name, "import_talent_job_link");
      calls.push(input);
      return {
        data: {
          role_id: role.role_id,
          recommendation_id: "recommendation",
          created_recommendation: calls.length === 1,
          role_source_provider: "user_submitted",
          saved_stage: calls.length === 1 ? "saved" : "applied",
        },
        error: null,
      };
    },
  } as unknown as TalentAdminClient;
  const first = await saveJobPosting({
    admin,
    talentId: "me",
    url: "https://example.com/jobs/engineer",
  });
  const second = await saveJobPosting({
    admin,
    talentId: "me",
    url: "https://example.com/jobs/engineer",
  });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) throw new Error("Expected saved postings");
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(calls[0].p_talent_id, "me");
  assert.equal(calls[0].p_saved_stage, "saved");
  assert.equal(calls[0].p_preserve_existing_progress, true);
  assert.equal(calls[1].p_preserve_existing_progress, true);
  assert.equal(second.savedStage, "applied");
  assert.equal(calls[0].p_existing_role_id, role.role_id);
  assert.equal(first.postingLink, `[posting](${role.role_id})`);
  assert.ok(JSON.stringify(first).length < 400);
  await importCareerJobLink({
    admin, talentId: "me", url: "https://example.com/jobs/engineer", savedStage: "closed",
  });
  assert.equal(calls[2].p_saved_stage, "closed");
  assert.ok(!("p_preserve_existing_progress" in calls[2]));
});

test("internal and test-only postings cannot invoke the import mutation", async () => {
  let calls = 0;
  const absent = {
    from: () => {
      throw new Error("must not query");
    },
  } as unknown as TalentAdminClient;
  await assert.rejects(
    saveJobPosting({
      admin: absent,
      talentId: "me",
      url: "https://matchharper.com/career/jobs/123",
    }),
    /external postings only/
  );
  for (const role of [
    { source_type: "internal", information: {} },
    { source_type: "external", information: { testOnly: true } },
  ]) {
    const admin = {
      from: () => ({
        select: () => ({ in: async () => ({ data: [role], error: null }) }),
      }),
      rpc: () => {
        calls++;
      },
    } as unknown as TalentAdminClient;
    await assert.rejects(
      saveJobPosting({ admin, talentId: "me", url: "https://example.com/job" }),
      /cannot be imported/
    );
  }
  assert.equal(calls, 0);
});

test("provider-identity matches also reject test-only roles before import", async () => {
  const admin = {
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        in: () => q,
        order: () => q,
        limit: () => q,
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(resolve),
        maybeSingle: async () => ({
          data: { role_id: "fixture", information: { testOnly: true } },
          error: null,
        }),
      };
      return q;
    },
    rpc: () => {
      throw new Error("must not import");
    },
  } as unknown as TalentAdminClient;
  await assert.rejects(
    saveJobPosting({
      admin,
      talentId: "me",
      url: "https://www.wanted.co.kr/wd/12345",
    }),
    /Test-only roles/
  );
});

test("incomplete extraction performs no write and the continued save imports title, company and full source body once", async () => {
  const previousKey = process.env.EXA_API_KEY;
  process.env.EXA_API_KEY = "test-exa-key";
  const exa = getExaClient();
  const previousRead = exa.getContents;
  const pageText = "# Platform Engineer\n\nExample Systems\n\nBuild and operate the platform.";
  exa.getContents = (async (_urls: unknown, options: { text?: unknown }) => ({
    requestId: "retrieval-1", statuses: [{ status: "success", source: "cached" }],
    results: [{ title: "Platform Engineer", ...(options.text ? { text: pageText } : { summary: "" }) }],
  })) as typeof exa.getContents;
  const writes: Record<string, any>[] = [];
  const admin = {
    from: () => {
      const q = {
        select: () => q, eq: () => q, in: () => q, ilike: () => q,
        order: () => q, limit: () => q,
        maybeSingle: async () => ({ data: null, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
      };
      return q;
    },
    rpc: async (name: string, input: Record<string, unknown>) => {
      assert.equal(name, "import_talent_job_link");
      writes.push(input);
      return { data: { role_id: "external-role", recommendation_id: "saved-recommendation", created_recommendation: true, saved_stage: "saved" }, error: null };
    },
  } as unknown as TalentAdminClient;
  try {
    const first = await saveJobPosting({ admin, talentId: "fixture", url: "https://jobs.example.com/platform" });
    assert.equal(first.ok, false);
    assert.equal(writes.length, 0);
    if (first.ok) throw new Error("Expected source evidence before saving");
    assert.equal(first.pageText, pageText);
    const second = await saveJobPosting({ admin, talentId: "fixture", url: first.url, title: "Platform Engineer", companyName: "Example Systems" });
    assert.equal(second.ok, true);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].p_role.description, pageText);
    assert.equal(writes[0].p_role.title, "Platform Engineer");
    assert.equal(writes[0].p_role.companyName, "Example Systems");
    assert.equal(writes[0].p_preserve_existing_progress, true);
  } finally {
    exa.getContents = previousRead;
    if (previousKey === undefined) delete process.env.EXA_API_KEY;
    else process.env.EXA_API_KEY = previousKey;
  }
});
