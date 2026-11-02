import assert from "node:assert/strict";
import test, { afterEach, mock } from "node:test";
import { internalEvaluationBackend } from "../matching/internalScoring/backend";
import Ajv from "ajv";
import {
  getOpenAIChatTools,
  getRealtimeTools,
} from "@/lib/talentOnboarding/tools";
import {
  CAREER_INTERNAL_APPLICATION_TOOLS,
  executeApplyToInternalRole,
  formatInternalApplicationToolResult,
} from "./tools";
afterEach(() => mock.restoreAll());

test("empty material read tells the model the exact revision needed for its first write", () => {
  const output = formatInternalApplicationToolResult("assign_to_role", { current: null, acceptedMaterials: [] });
  assert.match(output, /assignment revision 0/);
  assert.match(CAREER_INTERNAL_APPLICATION_TOOLS.assign_to_role.description, /expectedRevision/);
});

test("chat and voice application schemas accept a role without profile selection", () => {
  const chat = getOpenAIChatTools("chat").find(
    (tool) => tool.function.name === "apply_to_internal_role"
  )?.function;
  const voice = getRealtimeTools("voice").find(
    (tool) => tool.name === "apply_to_internal_role"
  );
  for (const tool of [chat, voice]) {
    assert.ok(tool);
    const validate = new Ajv().compile(tool.parameters);
    assert.equal(validate({ roleId: "role" }), true);
    assert.equal(validate({}), false);
    assert.equal(validate({ roleId: "role", profileId: "other-profile" }), false);
    assert.equal(validate({ roleId: "role", profileRevision: 99 }), false);
  }
});

function scenario(status = "queued", hasAssignment = true) {
  const queued: any[] = [];
  mock.method(internalEvaluationBackend, "enqueue", async (args: any) => {
    queued.push({ p_talent: args.userId, p_payload: args.payload });
    return { id: "evaluation-run", status: status === "queued" ? "handed_off" : status };
  });
  mock.method(internalEvaluationBackend, "publish", async () => {});
  const assignment: any = {
    id: "material-1",
    talent_id: "owner",
    role_id: "role",
    action: "set",
    revision: 3,
    profile_id: "profile",
    profile_revision: 1,
    documents: [],
  };
  const profileReads: any[] = [];
  const context: any = {
    userId: "owner",
    conversationId: "conversation",
    resumeRequestId: "original-reply",
    admin: {
      async rpc(name: string, input: any) {
        if (name === "read_talent_profile_v1") {
          assert.equal(input.p_talent_id, "owner");
          profileReads.push(input);
          return {
            data: {
              profileId: input.p_profile_id ?? "default",
              revision: input.p_revision ?? 2,
              snapshot: {
                talentUser: { name: "Candidate" },
                talentExperiences: [],
                talentEducations: [],
                talentExtras: [],
              },
            },
            error: null,
          };
        }
        assert.fail(`Unexpected RPC: ${name}`);
      },
      from(table: string) {
        const rows: Record<string, any> = {
          talent_role_materials: hasAssignment ? [assignment] : [],
          talent_opportunity_recommendation: [
            {
              id: "accepted-rec",
              shared_material_id: "accepted-material",
              feedback: "like",
              saved_stage: "connected",
            },
          ],
          opportunity_discovery_run: {
            id: "evaluation-run",
            status,
            trigger_payload: { roleIds: ["role"] },
            coverage: {
              evaluationIds: ["stage2"],
              recommendations: [
                {
                  recommendationId: "accepted-rec",
                  roleId: "role",
                  created: false,
                  feedback: "like",
                  savedStage: "connected",
                },
              ],
              privateTrace: "PRIVATE_TRACE",
            },
          },
          company_role_candidate_evaluations: [
            {
              id: "stage2",
              role_id: "role",
              stage: 2,
              source_profile_id: "profile",
              source_profile_revision: 1,
              evidence_scope: "candidate_requested",
              assessment: {
                fit: { candidateFit: 14, companyFit: 19, mutualFit: 17 },
              },
              evaluated_at: "2026-10-30T00:00:00Z",
            },
          ],
        };
        assert.ok(table in rows, `Unexpected table ${table}`);
        const query: any = {
          then: (resolve: any, reject: any) =>
            Promise.resolve({ data: rows[table], error: null }).then(
              resolve,
              reject
            ),
          single: async () => ({ data: rows[table], error: null }),
        };
        for (const name of ["select", "eq", "not", "order", "limit", "in"])
          query[name] = () => query;
        return query;
      },
    },
  };
  return { context, queued, profileReads, assignment };
}

test("application evaluates the prepared profile version and queues a review without introduction", async () => {
  const { context, queued } = scenario();
  const result = await executeApplyToInternalRole(
    { roleId: "role" },
    context
  );
  assert.equal(result.evaluatedProfile.revision, 1);
  assert.equal(result.assignedMaterial?.profileRevision, 1);
  assert.equal(queued[0].p_payload.profileRevision, 1);
  assert.equal(result.companyShared, false);
  assert.equal(queued[0].p_payload.parentReplyId, "original-reply");
  assert.equal(queued[0].p_payload.publishRecommendation, true);
  assert.deepEqual(result.careerContinuation, {
    kind: "internal_evaluation",
    id: "evaluation-run",
  });
});

test("caller profile arguments cannot override the assigned evaluation profile or owner", async () => {
  for (const input of [
    { roleId: "role" },
    { roleId: "role", profileId: "other-profile", profileRevision: 99 },
  ]) {
    const { context, queued } = scenario();
    const result = await executeApplyToInternalRole(
      { ...input, userId: "other", publishRecommendation: false },
      context
    );
    assert.deepEqual(result.evaluatedProfile, {
      profileId: "profile",
      revision: 1,
    });
    assert.equal(queued[0].p_talent, "owner");
    assert.equal(queued[0].p_payload.publishRecommendation, true);
  }
});

test("missing or cleared preparation evaluates the current default profile", async () => {
  for (const hasAssignment of [false, true]) {
    const { context, assignment, queued } = scenario("queued", hasAssignment);
    assignment.action = "clear";
    const result = await executeApplyToInternalRole({ roleId: "role" }, context);
    assert.deepEqual(result.evaluatedProfile, {
      profileId: "default",
      revision: 2,
    });
    assert.equal(result.assignedMaterial, null);
    assert.equal(queued[0].p_payload.profileId, "default");
    assert.equal(queued[0].p_payload.profileRevision, 2);
  }
});

test("completed low-fit reapplication reports private evaluation and prior acceptance without accepting again", async () => {
  const { context, queued } = scenario("completed");
  const result = await executeApplyToInternalRole({ roleId: "role" }, context);
  assert.equal(queued.length, 1);
  const rendered = formatInternalApplicationToolResult(
    "apply_to_internal_role",
    result
  );
  assert.match(rendered, /candidateFit: 14/);
  assert.match(rendered, /Private assessment \(reasoning-only\)/);
  assert.match(rendered, /reused; feedback like; saved stage connected/);
  assert.match(rendered, /Evaluation profile profile, revision 1/);
  assert.doesNotMatch(rendered, /PRIVATE_TRACE|2026-10-30T|"coverage"/);
});

test("reading prepared materials needs authentication but no write identity, and preserves accepted pin facts", async () => {
  const { context } = scenario();
  delete context.resumeRequestId;
  const tool = CAREER_INTERNAL_APPLICATION_TOOLS.assign_to_role;
  const result: any = await tool.execute!(
    { action: "read", roleId: "role" },
    context
  );
  assert.equal(result.current.id, "material-1");
  assert.equal(
    result.acceptedMaterials[0].shared_material_id,
    "accepted-material"
  );
  assert.match(
    formatInternalApplicationToolResult("assign_to_role", result),
    /accepted-material; recommendation accepted-rec/
  );
  await assert.rejects(
    () =>
      tool.execute!(
        { action: "clear", roleId: "role", expectedRevision: 3 },
        context
      ),
    /operation identifier/
  );
  await assert.rejects(
    () => tool.execute!({ action: "read", roleId: "role" }, undefined),
    /authenticated user/
  );
});
