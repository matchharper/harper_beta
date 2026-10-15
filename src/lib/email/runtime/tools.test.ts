import assert from "node:assert/strict";
import { before, test } from "node:test";
import type { EmailJobContext } from "./types";
import Module from "node:module";
let executeEmailTool: typeof import("./tools").executeEmailTool;
let adaptEmailToolResult: typeof import("./tools").adaptEmailToolResult;
let commonInstruction: string;
before(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "email-unit-test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "email-unit-test";
  process.env.OPENAI_API_KEY = "email-unit-test";
  process.env.OPENROUTER_API_KEY = "email-unit-test";
  const nodeModule = Module as typeof Module & {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
  };
  const load = nodeModule._load;
  nodeModule._load = function (request, parent, isMain) {
    return request === "server-only"
      ? {}
      : load.call(this, request, parent, isMain);
  };
  try {
    executeEmailTool = (await import("./tools")).executeEmailTool;
    adaptEmailToolResult = (await import("./tools")).adaptEmailToolResult;
    commonInstruction = (await import("@/lib/talentOnboarding/tools"))
      .TALENT_TOOL_COMMON_ASSISTANT_INSTRUCTION;
  } finally {
    nodeModule._load = load;
  }
});

test("email replaces only common writing guidance and preserves tool facts and domain rules", () => {
  const result = {
    assistantInstruction: `${commonInstruction} Only share after explicit consent.`,
    roles: [{ roleId: "exact", name: "이가온" }],
    ok: true,
  };
  const before = JSON.stringify(result);
  const projected = adaptEmailToolResult(result) as typeof result;
  assert.equal(JSON.stringify(result), before);
  assert.deepEqual(projected.roles, result.roles);
  assert.equal(projected.ok, true);
  assert.ok(!projected.assistantInstruction.includes(commonInstruction));
  assert.match(
    projected.assistantInstruction,
    /Only share after explicit consent\./
  );
  assert.deepEqual(adaptEmailToolResult({ ok: false, error: "exact" }), {
    ok: false,
    error: "exact",
  });
});

function context() {
  const job: any = {
    id: "00000000-0000-4000-8000-000000000001",
    status: "processing",
    locked_by: "owner",
    worker_target: "vercel_queue",
    metadata: {},
  };
  const admin: any = {
    from() {
      let patch: any;
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        update(value: any) {
          patch = value;
          return this;
        },
        async maybeSingle() {
          if (patch) Object.assign(job, patch);
          return { data: job, error: null };
        },
      };
    },
  };
  return { ctx: { admin, job, owner: "owner" } as EmailJobContext, job };
}
test("a retried source email reuses a completed business command instead of executing it twice", async () => {
  const { ctx } = context();
  let calls = 0;
  const executeDefault = async () => ({ ok: true, sequence: ++calls });
  const a = await executeEmailTool(ctx, {
    name: "update_talent_profile",
    input: { talentUser: { name: "Example", current_location: "Seoul" } },
    executeDefault,
  });
  const b = await executeEmailTool(ctx, {
    name: "update_talent_profile",
    input: { talentUser: { current_location: "Seoul", name: "Example" } },
    executeDefault,
  });
  assert.equal(calls, 1);
  assert.deepEqual(a, b);
  await executeEmailTool(ctx, {
    name: "update_talent_profile",
    input: { talentUser: { name: "Changed" } },
    executeDefault,
  });
  assert.equal(calls, 2);
});
test("read tools remain fresh and lost execution ownership prevents all effects", async () => {
  const { ctx, job } = context();
  let calls = 0;
  const executeDefault = async () => ({ ok: true, sequence: ++calls });
  await executeEmailTool(ctx, {
    name: "read_recommended_opportunities",
    input: {},
    executeDefault,
  });
  await executeEmailTool(ctx, {
    name: "read_recommended_opportunities",
    input: {},
    executeDefault,
  });
  assert.equal(calls, 2);
  job.locked_by = "another";
  await assert.rejects(
    () =>
      executeEmailTool(ctx, {
        name: "update_talent_profile",
        input: {},
        executeDefault,
      }),
    /no longer owns/
  );
  assert.equal(calls, 2);
});

function acceptanceContext() {
  const rec: any = {
    id: "recommendation",
    talent_id: "talent",
    role_id: "role",
    updated_at: "2026-10-12T00:00:00Z",
    feedback: null,
    opportunity_type: "internal",
    email_acceptance_confirmation: {},
  };
  const role: any = {
    role_id: "role",
    source_type: "internal",
    status: "active",
    information: {},
  };
  const setting: any = { is_onboarding_done: true };
  const admin: any = {
    from(table: string) {
      let patch: any;
      const filters: any = {};
      const read = () =>
        table === "company_roles"
          ? role
          : table === "talent_setting"
            ? setting
            : rec;
      return {
        select() {
          return this;
        },
        eq(key: string, value: unknown) {
          filters[key] = value;
          return this;
        },
        update(value: any) {
          patch = value;
          return this;
        },
        async limit() {
          return { data: [rec], error: null };
        },
        async maybeSingle() {
          if (patch) {
            if (filters.updated_at !== rec.updated_at)
              return { data: null, error: null };
            Object.assign(rec, patch);
          }
          return { data: read(), error: null };
        },
      };
    },
  };
  const ctx = {
    admin,
    talentId: "talent",
    conversationId: "conversation",
    body: "Proceed",
    sourceMessage: { id: 1 },
  } as EmailJobContext;
  return { ctx, rec, role, setting };
}

test("internal email acceptance requires a different later message in the same conversation", async () => {
  const { confirmEmailAcceptance } = await import("./tools");
  const { ctx, rec } = acceptanceContext();
  const payloads: any[] = [];
  const accept = async (payload: any) => {
    payloads.push(payload);
    return { ok: true };
  };
  const input = {
    opportunityId: rec.id,
    feedback: "like",
    feedbackReason: "Note to company",
  };
  const a: any = await confirmEmailAcceptance(
    ctx,
    input,
    async () => null,
    accept
  );
  assert.equal(a.confirmationRequired, true);
  assert.equal(payloads.length, 0);
  const b: any = await confirmEmailAcceptance(
    ctx,
    input,
    async () => null,
    accept
  );
  assert.equal(b.confirmationRequired, true);
  assert.equal(payloads.length, 0);
  const c: any = await confirmEmailAcceptance(
    { ...ctx, conversationId: "another", sourceMessage: { id: 2 } as any },
    input,
    async () => null,
    accept
  );
  assert.equal(c.confirmationRequired, true);
  assert.equal(payloads.length, 0);
  await confirmEmailAcceptance(
    { ...ctx, conversationId: "another", sourceMessage: { id: 3 } as any },
    input,
    async () => null,
    accept
  );
  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].recommendationId, rec.id);
  assert.equal(payloads[0].expectedUpdatedAt, rec.updated_at);
  assert.equal(payloads[0].feedbackReason, "Note to company");
  assert.equal(payloads[0].emailAcceptanceConfirmation.status, "confirmed");
  assert.equal(
    payloads[0].emailAcceptanceConfirmation.confirmedUserMessageId,
    3
  );
});

test("company Intro accepts directly, while onboarding, unavailable and isolated roles cannot accept", async () => {
  const { confirmEmailAcceptance } = await import("./tools");
  const { ctx, rec, role, setting } = acceptanceContext();
  let calls = 0;
  const accept = async () => ({ ok: true, number: ++calls });
  const input = { opportunityId: rec.id, feedback: "like" };
  rec.opportunity_type = "intro_request";
  await confirmEmailAcceptance(ctx, input, async () => null, accept);
  assert.equal(calls, 1);
  setting.is_onboarding_done = false;
  const incomplete: any = await confirmEmailAcceptance(
    ctx,
    input,
    async () => null,
    accept
  );
  assert.equal(incomplete.connectionAcceptanceRecorded, false);
  assert.equal(calls, 1);
  setting.is_onboarding_done = true;
  rec.opportunity_type = "internal";
  role.status = "ended";
  const ended: any = await confirmEmailAcceptance(
    ctx,
    input,
    async () => null,
    accept
  );
  assert.equal(ended.error, "internal_opportunity_unavailable");
  assert.equal(calls, 1);
  role.status = "active";
  role.information = { testOnly: true, testTalentIds: ["different"] };
  const isolated: any = await confirmEmailAcceptance(
    ctx,
    input,
    async () => null,
    accept
  );
  assert.equal(isolated.error, "internal_opportunity_unavailable");
  assert.equal(calls, 1);
});

test("attachment selection never uploads an unselected file with the same name", async () => {
  const { resolveEmailAttachmentUploads } = await import("./tools");
  const attachments = [
    {
      id: "first",
      filename: "resume.pdf",
      contentType: "application/pdf",
      downloadUrl: "https://example.com/first",
      size: 100,
    },
    {
      id: "second",
      filename: "resume.pdf",
      contentType: "application/pdf",
      downloadUrl: "https://example.com/second",
      size: 200,
    },
  ];
  const payload = resolveEmailAttachmentUploads(attachments, [
    { attachmentIndex: 2, kind: "resume" },
  ]);
  assert.equal(payload?.attachments.length, 1);
  assert.equal(payload?.attachments[0].id, "second");
  assert.deepEqual(payload?.documentUploads, [
    { fileName: "resume.pdf", kind: "resume" },
  ]);
  assert.equal(
    resolveEmailAttachmentUploads(attachments, [
      { attachmentIndex: 2, kind: "portfolio" },
    ]),
    null
  );
  assert.equal(
    resolveEmailAttachmentUploads(attachments, [
      { attachmentIndex: 3, kind: "resume" },
    ]),
    null
  );
  assert.equal(resolveEmailAttachmentUploads(attachments, [null]), null);
});

test("email acceptance guidance is an adapter copy and cannot mutate the shared web tool contract", async () => {
  const { emailToolSelection } = await import("./tools");
  const { getOpenAIChatTools } = await import("@/lib/talentOnboarding/tools");
  const before = JSON.stringify(getOpenAIChatTools("chat"));
  const selection = emailToolSelection(
    { tools: [], toolNames: [], stopAfterToolNames: [] } as any,
    false
  );
  const tool = selection.tools.find(
    (t) => t.function.name === "update_recommended_opportunity_feedback"
  )!;
  assert.match(tool.function.description, /records the pending confirmation/);
  assert.equal(JSON.stringify(getOpenAIChatTools("chat")), before);
});

test("generated resume links are ordinary email URLs without changing shared results", () => {
  const source = { ok: true, documentId: "00000000-0000-4000-8000-000000000001", documentLink: "[Resume](documentId:00000000-0000-4000-8000-000000000001)" };
  const projected = adaptEmailToolResult(source) as typeof source;
  assert.match(projected.documentLink, /^https?:\/\//);
  assert.match(projected.documentLink, /\/career\/documents\?documentId=/);
  assert.match(source.documentLink, /documentId:/);
});
