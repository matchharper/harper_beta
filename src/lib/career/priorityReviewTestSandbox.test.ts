import assert from "node:assert/strict";
import test from "node:test";
import { createPriorityReviewTestSandbox } from "./priorityReviewTestSandbox";
import {
  canUsePriorityReviewTests,
  PRIORITY_REVIEW_TEST_CASES,
} from "./priorityReviewTestContract";

// Registry imports initialize SDK clients; no real credentials or DB are needed.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:9";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "sandbox-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "sandbox-service-key";
process.env.OPENAI_API_KEY ??= "sandbox-openai-key";

const roleId = "bd038642-0036-47a7-9446-2a32d91f12d9";
// In-memory snapshot shape only; no fixture Role is inserted into any DB.
const role = {
  role_id: roleId,
  name: "Backend Engineer",
  source_type: "internal",
  status: "active",
  information: {},
  is_expired: false,
  expires_at: null,
  company_workspace: { published_name: "Example", company_name: "Example" },
};
const userId = "b102478d-1269-426a-af9c-ab01647a9ae7";

test("priority-review response test is restricted to the authorized account", () => {
  assert.equal(canUsePriorityReviewTests("KHJ605123@gmail.com"), true);
  assert.equal(canUsePriorityReviewTests("someone@matchharper.com"), false);
  assert.equal(canUsePriorityReviewTests(null), false);
});

for (const caseId of PRIORITY_REVIEW_TEST_CASES) {
  test(`${caseId}: production registration is idempotent and resetting starts fresh`, async () => {
    const { executeTalentTool, TALENT_TOOL_NAMES } =
      await import("@/lib/talentOnboarding/tools");
    for (let round = 0; round < 2; round++) {
      const { admin, tables } = createPriorityReviewTestSandbox({
        caseId,
        role,
        userId,
      });
      const context = { admin, userId, responseLocale: "ko" };
      const register = () =>
        executeTalentTool({
          channel: "chat",
          name: TALENT_TOOL_NAMES.INTERNAL_ROLE_PRIORITY_REVIEW,
          input: { action: "register", roleId },
          context,
          logging: false,
        });
      const first = (await register()) as any;
      assert.equal(first.status, "created");
      assert.equal(first.hasFitAssessment, caseId !== "missing");
      assert.equal(first.recommendationAvailable, caseId === "high");
      const second = (await register()) as any;
      assert.equal(second.status, "already_exists");
      assert.equal(tables.talent_progress.length, 1);
      const presentation = (await executeTalentTool({
        channel: "chat",
        name: TALENT_TOOL_NAMES.UPDATE_RECOMMENDED_OPPORTUNITY_FEEDBACK,
        input: {
          feedback: "review",
          roleId,
          fitReasons: ["Relevant backend development experience"],
        },
        context,
        logging: false,
      })) as any;
      assert.equal(presentation.ok, caseId === "high");
      assert.equal(
        tables.talent_opportunity_recommendation.length,
        caseId === "high" ? 1 : 0
      );
      assert.equal(tables.company_roles[0].role_id, roleId);
    }
  });
}

test("sandbox rejects unknown tables and RPCs without a network fallback", async () => {
  const { admin } = createPriorityReviewTestSandbox({
    caseId: "high",
    role,
    userId,
  });
  assert.throws(() => admin.from("unimplemented_table"));
  assert.throws(() =>
    admin.from("company_roles").insert({ role_id: "anything" })
  );
  await assert.rejects(admin.rpc("send_company_message", {}));
  await assert.rejects(
    admin.rpc("present_talent_internal_role_recommendation_for_review_v1", {
      p_talent_id: userId,
      p_target_role_id: roleId,
      p_context: { fitReasons: [] },
    })
  );
});
