import assert from "node:assert/strict";
import test from "node:test";
import type { TalentExperienceCompanyResolutionInput } from "@/lib/talentOnboarding/companyResolution";
import { resolveResumeExperienceCompaniesSafely } from "@/lib/talentOnboarding/profileIngestionCompanyResolution";

function experience(): TalentExperienceCompanyResolutionInput {
  return {
    company_name: "Example",
    company_location: null,
    company_id: null,
    company_link: null,
    company_logo: null,
  };
}

test("skips company resolution for LinkedIn-only ingestion", async () => {
  const experiences = [experience()];
  let calls = 0;

  const result = await resolveResumeExperienceCompaniesSafely({
    admin: null,
    experiences,
    hasResumeText: false,
    resolveCompanies: async () => {
      calls += 1;
      throw new Error("company resolver must not run");
    },
  });

  assert.equal(calls, 0);
  assert.strictEqual(result, experiences);
});

test("runs company resolution when resume text is present", async () => {
  const experiences = [experience()];
  let calls = 0;

  const result = await resolveResumeExperienceCompaniesSafely({
    admin: { source: "test" },
    experiences,
    hasResumeText: true,
    resolveCompanies: async (args) => {
      calls += 1;
      assert.equal(args.admin.source, "test");
      assert.strictEqual(args.experiences, experiences);
      return {
        diagnostics: [],
        experiences: args.experiences.map((item) => ({
          ...item,
          company_id: 42,
        })),
        summary: {
          exaCostUsd: 0,
          exaSearches: 0,
          llmCalls: 0,
          llmCostUsd: 0,
          llmInputTokens: 0,
          llmModel: "test",
          llmOutputTokens: 0,
          matched: 1,
          total: 1,
          unresolved: 0,
          wallTimeMs: 1,
        },
      };
    },
  });

  assert.equal(calls, 1);
  assert.equal(result[0].company_id, 42);
});
