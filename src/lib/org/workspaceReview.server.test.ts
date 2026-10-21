import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { assertReviewOnboardingTool, assertWorkspaceAvailable, withReviewOnboarding } from "./workspaceReview.server";
import { readOrgRoleAccess } from "./teamAccess";

function admin(reviewing: boolean) {
  return createClient("https://fixture.example", "test", {
    global: { fetch: async (input) => {
      const url = String(input);
      return new Response(JSON.stringify(url.includes("company_workspace?")
        ? { is_reviewing: reviewing }
        : { authority: "owner", access_scope: "organization" }), {
        headers: { "Content-Type": "application/json" },
      });
    } },
  }) as any;
}

test("review gate denies even an owner or internal account; ordinary access stays available", async () => {
  for (const email of ["owner@agency.example", "ops@matchharper.com"]) {
    await assert.rejects(readOrgRoleAccess({
      admin: admin(true), user: { id: "u", email } as any, workspaceId: "w",
    }), /org_workspace_under_review/);
  }
  await assertWorkspaceAvailable({ admin: admin(false), workspaceId: "w" });
});

test("setup exception is scoped to one user/workspace and cannot execute hiring tools", async () => {
  await withReviewOnboarding({ workspaceId: "w", userId: "u" }, async () => {
    await assertWorkspaceAvailable({ admin: admin(true), workspaceId: "w", user: { id: "u" } });
    await assert.rejects(assertWorkspaceAvailable({ admin: admin(true), workspaceId: "other", user: { id: "u" } }));
    await assert.rejects(assertWorkspaceAvailable({ admin: admin(true), workspaceId: "w", user: { id: "other" } }));
    assertReviewOnboardingTool("w", "u", "get_more_data", { kinds: ["company_details"] });
    assertReviewOnboardingTool("w", "u", "update_data", { changes: [{ key: "pitch", kind: "rewrite", value: "Our company" }] });
    for (const [name, input] of [
      ["get_talents", {}],
      ["contact_talent", {}],
      ["get_more_data", { kinds: ["company_details", "matching_runs"] }],
      ["update_data", { changes: [{ key: "role_request", roleId: "r" }] }],
      ["update_data", { changes: [{ key: "pitch" }], proposalId: "stored-proposal" }],
    ] as const) assert.throws(() => assertReviewOnboardingTool("w", "u", name, input), /org_workspace_under_review/);
  });
  await assert.rejects(assertWorkspaceAvailable({ admin: admin(true), workspaceId: "w", user: { id: "u" } }));
});
