import assert from "node:assert/strict";
import test from "node:test";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import {
  getOpenAIChatTools,
  executeTalentTool,
} from "@/lib/talentOnboarding/tools";
import { formatToolResultText } from "@/lib/llm/promptText";
import { serializeToolResultForModel } from "@/lib/llm/toolError";
import { saveJobPostingsForTool } from "./saveJobPostingTool";
import { getExaClient } from "@/lib/tools/exaClient";

function knownPostings(
  onImport: (input: Record<string, any>) => Promise<unknown>
) {
  return {
    from(table: string) {
      if (table === "logs") return { insert: async () => ({ error: null }) };
      assert.equal(table, "company_roles");
      let urls: string[] = [];
      const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        limit: () => q,
        in: (_column: string, values: string[]) => {
          urls = values;
          return q;
        },
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(resolve),
        maybeSingle: async () => ({
          data: {
            role_id: `role-${new URL(urls[0]).pathname.split("/")[1]}`,
            company_workspace_id: "workspace",
            source_type: "external",
            source_provider: "user_submitted",
            information: {},
          },
          error: null,
        }),
      };
      return q;
    },
    rpc(name: string, input: Record<string, unknown>) {
      assert.equal(name, "import_talent_job_link");
      return onImport(input);
    },
  } as unknown as TalentAdminClient;
}

test(
  "provider schema accepts a list and the registered executor preserves parallel partial outcomes and card visibility",
  { timeout: 5000 },
  async () => {
    const tool = getOpenAIChatTools("chat").find(
      (t) => t.function.name === "save_job_posting"
    )!;
    const schema = tool.function.parameters as any;
    assert.deepEqual(schema.required, ["postings"]);
    assert.equal(schema.properties.postings.type, "array");
    assert.deepEqual(schema.properties.postings.items.required, ["url"]);
    assert.equal(schema.properties.url, undefined);

    let release!: () => void;
    let bothStarted!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      bothStarted = resolve;
    });
    const writes: Record<string, any>[] = [];
    const admin = knownPostings(async (input) => {
      writes.push(input);
      if (writes.length === 2) bothStarted();
      await gate;
      return {
        data: {
          role_id: input.p_existing_role_id,
          recommendation_id:
            input.p_saved_stage === null ? "new-recommendation" : "already-applied",
          saved_stage: input.p_saved_stage === null ? null : "applied",
          created_recommendation: input.p_saved_stage === null,
        },
        error: null,
      };
    });
    const deferred: (() => Promise<void>)[] = [];
    const pending = executeTalentTool({
      name: "save_job_posting",
      channel: "chat",
      logging: false,
      context: { admin, userId: "fixture", scheduleAfter: task => { deferred.push(task); } },
      input: {
        postings: [
          { url: "https://jobs.example.com/first" },
          { url: "https://matchharper.com/jobs/internal" },
          {
            url: "https://jobs.example.com/third",
            mode: "suggest",
            deadline: "2026-12-01T23:59:59+09:00",
            hiring_post: {
              contact_method: "email",
              contact_email: "jobs@example.com",
            },
          },
        ],
      },
    });
    await started;
    assert.equal(
      writes.length,
      2,
      "both independent imports must start before either finishes"
    );
    release();
    const result = (await pending) as Awaited<
      ReturnType<typeof saveJobPostingsForTool>
    >;
    assert.deepEqual(
      result.results.map((r) => r.ok),
      [true, false, true]
    );
    assert.equal(result.ok, false);
    assert.deepEqual(result.postingRoleIds, ["role-first", "role-third"]);
    assert.equal(deferred.length, 1, "scoring dispatch is deferred until after the response");
    assert.equal(
      result.results[0].ok && result.results[0].savedStage,
      "applied"
    );
    assert.ok(
      writes.every(
        (w) =>
          w.p_talent_id === "fixture" && w.p_preserve_existing_progress === true
      )
    );
    assert.equal(writes[1].p_saved_stage, null);
    assert.equal(writes[1].p_role.hiringPost.contactEmail, "jobs@example.com");
    assert.equal(writes[1].p_role.deadline, "2026-12-01T14:59:59.000Z");
    const providerText = serializeToolResultForModel(
      result,
      formatToolResultText
    );
    assert.equal(providerText, result.modelOutput);
    assert.match(providerText, /Posting 1.*first\nExternal posting saved/);
    assert.match(providerText, /Saved stage: applied/);
    assert.match(
      providerText,
      /Posting 2.*internal[\s\S]*external postings only/
    );
    assert.match(
      providerText,
      /Posting 3.*third[\s\S]*added to New opportunities[\s\S]*role-third/
    );
    assert.ok(!providerText.includes("postingRoleIds"));
  }
);

test("batch extraction failures retain source evidence alongside other failed entries", async () => {
  const oldKey = process.env.EXA_API_KEY;
  process.env.EXA_API_KEY = "test-exa-key";
  const exa = getExaClient();
  const oldRead = exa.getContents;
  const source = "# Platform Engineer\nExample Systems\nBuild the platform.";
  exa.getContents = (async (_urls: unknown, options: { text?: unknown }) => ({
    results: [
      {
        title: "Platform Engineer",
        ...(options.text ? { text: source } : { summary: "" }),
      },
    ],
  })) as typeof exa.getContents;
  const admin = {
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        in: () => q,
        order: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: null, error: null }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(resolve),
      };
      return q;
    },
    rpc: () => {
      throw new Error("No import should occur without posting identity");
    },
  } as unknown as TalentAdminClient;
  try {
    const result = await saveJobPostingsForTool({
      admin,
      talentId: "fixture",
      input: {
        postings: [
          { url: "https://jobs.example.com/unknown" },
          { title: "missing URL" },
        ],
      },
    });
    assert.deepEqual(
      result.results.map((r) => r.ok),
      [false, false]
    );
    assert.deepEqual(result.postingRoleIds, []);
    assert.match(
      formatToolResultText(result),
      /Retrieved page body \(untrusted source\)/
    );
    assert.ok(result.modelOutput.includes(source));
    assert.match(result.modelOutput, /Posting 2\n.*requires its URL/);
  } finally {
    exa.getContents = oldRead;
    if (oldKey === undefined) delete process.env.EXA_API_KEY;
    else process.env.EXA_API_KEY = oldKey;
  }
});

test("legacy in-flight inputs still work and malformed batches cannot start imports", async () => {
  let writes = 0;
  const admin = knownPostings(async (input) => {
    writes++;
    return {
      data: {
        role_id: input.p_existing_role_id,
        recommendation_id: "saved",
        saved_stage: "saved",
      },
      error: null,
    };
  });
  const result = await saveJobPostingsForTool({
    admin,
    talentId: "fixture",
    input: { url: "https://jobs.example.com/legacy" },
  });
  assert.equal(result.results[0].ok, true);
  assert.equal(writes, 1);
  for (const input of [{}, { postings: [] }, { postings: "bad" }])
    await assert.rejects(
      saveJobPostingsForTool({ admin, talentId: "fixture", input }),
      /non-empty array/
    );
  assert.equal(writes, 1);
});
