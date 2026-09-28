import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { fetchCareerExternalFeedbackSuggestions } from "./taskSuggestions.server";

test("summary uses one bounded user-scoped external query with the existing new-history filters", async () => {
  const requests: URL[] = [];
  const admin = createClient<Database>(
    "https://fixture.supabase.co",
    "fixture-key",
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (input) => {
          requests.push(new URL(String(input)));
          return new Response(
            JSON.stringify([
              {
                id: "recommendation-4",
                role_id: "role-4",
                created_at: "2026-09-28T09:00:00Z",
                company_role: {
                  company_workspace: {
                    company_name: "Fixture company",
                    logo_url: "https://example.com/workspace.png",
                    company_db: { logo: "https://example.com/company.png" },
                  },
                },
              },
              {
                id: "recommendation-3",
                role_id: "role-3",
                created_at: "2026-09-28T08:00:00Z",
                company_role: {
                  company_workspace: {
                    company_name: "No logo company",
                    logo_url: null,
                    company_db: null,
                  },
                },
              },
            ]),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        },
      },
    }
  );
  const items = await fetchCareerExternalFeedbackSuggestions({
    admin,
    userId: "fixture-user",
  });
  assert.equal(requests.length, 1);
  const request = requests[0];
  assert.equal(
    request.pathname,
    "/rest/v1/talent_effective_opportunity_recommendations_v1"
  );
  assert.equal(request.searchParams.get("talent_id"), "eq.fixture-user");
  assert.equal(
    request.searchParams.get("company_role.source_type"),
    "eq.external"
  );
  assert.equal(request.searchParams.get("feedback"), "is.null");
  assert.equal(
    request.searchParams.get("or"),
    "(saved_stage.is.null,saved_stage.neq.hidden)"
  );
  assert.equal(request.searchParams.get("kind"), "neq.user_link_import");
  assert.equal(request.searchParams.get("order"), "created_at.desc,id.asc");
  assert.equal(request.searchParams.get("limit"), "4");
  assert.equal(
    request.searchParams.get("select")?.includes("company_roles!inner"),
    true
  );
  assert.equal(
    request.searchParams.get("select")?.includes("description"),
    false
  );
  assert.deepEqual(items, [
    {
      id: "recommendation-4",
      roleId: "role-4",
      recommendedAt: "2026-09-28T09:00:00Z",
      companyName: "Fixture company",
      companyLogoUrl: "https://example.com/workspace.png",
    },
    {
      id: "recommendation-3",
      roleId: "role-3",
      recommendedAt: "2026-09-28T08:00:00Z",
      companyName: "No logo company",
      companyLogoUrl: null,
    },
  ]);
});

test("a failed source query stays an error instead of claiming there are no pending roles", async () => {
  const admin = createClient<Database>(
    "https://fixture.supabase.co",
    "fixture-key",
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async () =>
          new Response(JSON.stringify({ message: "fixture unavailable" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          }),
      },
    }
  );
  await assert.rejects(
    fetchCareerExternalFeedbackSuggestions({
      admin,
      userId: "fixture-user",
    }),
    /fixture unavailable/
  );
});
