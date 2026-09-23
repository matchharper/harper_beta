import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveTalentExperienceCompanies,
  type CompanyIdentityLookup,
  type TalentExperienceCompanyResolutionInput,
} from "@/lib/talentOnboarding/companyResolution";

const alpha = {
  id: 11,
  linkedin_company_id: 101,
  linkedin_url: "https://www.linkedin.com/company/alpha-kr",
  logo: "https://img.example/alpha.png",
  name: "Alpha",
  website_url: "https://alpha.kr",
};

const alphaUs = {
  ...alpha,
  id: 12,
  linkedin_company_id: 102,
  linkedin_url: "https://www.linkedin.com/company/alpha-us",
  name: "Alpha",
  website_url: "https://alpha.com",
};

function experience(
  patch: Partial<TalentExperienceCompanyResolutionInput> = {}
): TalentExperienceCompanyResolutionInput {
  return {
    company_id: null,
    company_link: null,
    company_location: null,
    company_logo: null,
    company_name: "Alpha",
    ...patch,
  };
}

function lookup(
  patch: Partial<CompanyIdentityLookup> = {}
): CompanyIdentityLookup {
  return {
    findByExactName: async () => [],
    findById: async () => [],
    findByLinkedinCompanyId: async () => [],
    findByLinkedinUrl: async () => [],
    findByNameToken: async () => [],
    findByNameTokens: async () => [],
    findByWebsiteDomain: async () => [],
    ...patch,
  };
}

test("keeps a verified company_db id without external search", async () => {
  let exaCalls = 0;
  const result = await resolveTalentExperienceCompanies({
    enableExternalSearch: true,
    enableLlmResolution: false,
    experiences: [experience({ company_id: alpha.id })],
    exa: {
      search: async () => {
        exaCalls += 1;
        return { results: [] } as any;
      },
    } as any,
    lookup: lookup({ findById: async () => [alpha] }),
  });

  assert.equal(result.experiences[0].company_id, alpha.id);
  assert.equal(result.diagnostics[0].matchedBy, "existing_company_db_id");
  assert.equal(exaCalls, 0);
});

test("resolves a LinkedIn actor company id to the internal company_db id", async () => {
  const result = await resolveTalentExperienceCompanies({
    enableExternalSearch: false,
    experiences: [experience({ linkedin_company_id: alpha.linkedin_company_id })],
    lookup: lookup({ findByLinkedinCompanyId: async () => [alpha] }),
  });

  assert.equal(result.experiences[0].company_id, alpha.id);
  assert.equal(result.diagnostics[0].matchedBy, "linkedin_company_id");
});

test("audits a unique exact-name candidate before linking", async () => {
  let judgeCalls = 0;
  const result = await resolveTalentExperienceCompanies({
    enableExternalSearch: true,
    experiences: [experience()],
    exa: {
      search: async () => assert.fail("Exa should not be called"),
    } as any,
    judge: {
      resolve: async (cases) => {
        judgeCalls += 1;
        assert.equal(cases[0].candidates[0].id, alpha.id);
        return {
          costUsd: 0,
          inputTokens: 0,
          latencyMs: 1,
          matches: new Map([["0", alpha.id]]),
          model: "z-ai/glm-5.3-flash",
          outputTokens: 0,
        };
      },
    },
    lookup: lookup({ findByExactName: async () => [alpha] }),
  });

  assert.equal(result.experiences[0].company_id, alpha.id);
  assert.equal(result.diagnostics[0].matchedBy, "glm_candidate_selection");
  assert.equal(judgeCalls, 3);
  assert.equal(result.summary.exaCostUsd, 0);
});

test("uses one Exa search to disambiguate duplicate internal names", async () => {
  const result = await resolveTalentExperienceCompanies({
    enableExternalSearch: true,
    enableLlmResolution: false,
    experiences: [experience({ company_location: "Seoul" })],
    exa: {
      search: async () => ({
        costDollars: { total: 0.007 },
        results: [{ url: alpha.linkedin_url }],
      }),
    } as any,
    lookup: lookup({
      findByExactName: async () => [alpha, alphaUs],
      findByLinkedinUrl: async (url) =>
        url.includes("alpha-kr") ? [alpha] : [],
    }),
  });

  assert.equal(result.experiences[0].company_id, alpha.id);
  assert.equal(result.diagnostics[0].matchedBy, "exa_linkedin_url");
  assert.equal(result.summary.exaSearches, 1);
  assert.equal(result.summary.exaCostUsd, 0.007);
});

test("abstains when Exa URLs map to multiple companies", async () => {
  const result = await resolveTalentExperienceCompanies({
    enableExternalSearch: true,
    enableLlmResolution: false,
    experiences: [experience()],
    exa: {
      search: async () => ({
        costDollars: { total: 0.007 },
        results: [{ url: alpha.linkedin_url }, { url: alphaUs.website_url }],
      }),
    } as any,
    lookup: lookup({
      findByExactName: async () => [alpha, alphaUs],
      findByLinkedinUrl: async () => [alpha],
      findByWebsiteDomain: async () => [alphaUs],
    }),
  });

  assert.equal(result.experiences[0].company_id, null);
  assert.equal(result.diagnostics[0].matchedBy, "unresolved");
});

test("rejects a unique Exa result whose internal company name is unrelated", async () => {
  const exaVendor = {
    ...alpha,
    id: 99,
    linkedin_url: "https://www.linkedin.com/company/exa-ai",
    name: "Exa",
    website_url: "https://exa.ai",
  };
  const result = await resolveTalentExperienceCompanies({
    enableExternalSearch: true,
    enableLlmResolution: false,
    experiences: [experience({ company_name: "Provenant" })],
    exa: {
      search: async () => ({
        costDollars: { total: 0.007 },
        results: [{ url: exaVendor.website_url }],
      }),
    } as any,
    lookup: lookup({
      findByWebsiteDomain: async () => [exaVendor],
    }),
  });

  assert.equal(result.experiences[0].company_id, null);
  assert.equal(result.diagnostics[0].matchedBy, "unresolved");
});

test("rejects a same-name Exa company when another internal row fits the location better", async () => {
  const koreanCompany = {
    ...alpha,
    id: 21,
    location: "Gyeonggi, South Korea",
    name: "Mega Coffee",
  };
  const polishCompany = {
    ...alpha,
    id: 22,
    location: "Poland",
    name: "Mega Coffee",
    website_url: "https://mega-coffee.pl",
  };
  const result = await resolveTalentExperienceCompanies({
    enableExternalSearch: true,
    enableLlmResolution: false,
    experiences: [
      experience({ company_location: "Inje, South Korea", company_name: "Mega Coffee" }),
    ],
    exa: {
      search: async () => ({ results: [{ url: polishCompany.website_url }] }),
    } as any,
    lookup: lookup({
      findByExactName: async () => [koreanCompany, polishCompany],
      findByWebsiteDomain: async () => [polishCompany],
    }),
  });

  assert.equal(result.experiences[0].company_id, null);
});

test("accepts an official URL when names differ only by a corporate suffix", async () => {
  const jpmorgan = {
    ...alpha,
    id: 1068,
    name: "JPMorganChase",
    website_url: "https://www.jpmorganchase.com",
  };
  const result = await resolveTalentExperienceCompanies({
    enableExternalSearch: true,
    enableLlmResolution: false,
    experiences: [
      experience({
        company_location: "Singapore",
        company_name: "JPMorgan Chase & Co.",
      }),
    ],
    exa: {
      search: async () => ({ results: [{ url: jpmorgan.website_url }] }),
    } as any,
    lookup: lookup({ findByWebsiteDomain: async () => [jpmorgan] }),
  });

  assert.equal(result.experiences[0].company_id, jpmorgan.id);
});

test("deduplicates and parallelizes identical external searches", async () => {
  let active = 0;
  let maxActive = 0;
  let calls = 0;
  const result = await resolveTalentExperienceCompanies({
    enableExternalSearch: true,
    enableLlmResolution: false,
    experiences: [
      experience({ company_name: "Alpha" }),
      experience({ company_name: "Alpha" }),
      experience({ company_name: "Beta" }),
    ],
    exa: {
      search: async () => {
        calls += 1;
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
        return { costDollars: { total: 0.007 }, results: [] };
      },
    } as any,
    lookup: lookup(),
  });

  assert.equal(calls, 2);
  assert.equal(maxActive, 2);
  assert.equal(result.summary.exaSearches, 2);
  assert.equal(result.summary.exaCostUsd, 0.014);
});

test("selects from multiple candidates and audits the proposal before linking", async () => {
  let judgeCalls = 0;
  const result = await resolveTalentExperienceCompanies({
    experiences: [
      experience({ company_location: "Seoul", company_name: "Alpha" }),
      experience({ company_location: "Busan", company_name: "Beta" }),
    ],
    judge: {
      resolve: async (cases) => {
        judgeCalls += 1;
        const isVerification = cases[0].proposedCompanyDbId !== undefined;
        if (isVerification) {
          assert.equal(cases.length, 1);
          assert.equal(cases[0].proposedCompanyDbId, alpha.id);
        } else {
          assert.equal(cases.length, 2);
          assert.deepEqual(
            cases[0].candidates.map((candidate) => candidate.id),
            [alpha.id, alphaUs.id]
          );
        }
        return {
          costUsd: 0.00021,
          inputTokens: 2_000,
          latencyMs: 120,
          matches: new Map([
            ["0", alpha.id],
            ["1", null],
          ]),
          model: "z-ai/glm-5.3-flash",
          outputTokens: 80,
        };
      },
    },
    lookup: lookup({
      findByExactName: async (name) =>
        name === "Alpha" ? [alpha, alphaUs] : [],
      findByNameToken: async (token) =>
        token === "beta" ? [{ ...alphaUs, id: 13, name: "Beta" }] : [],
    }),
  });

  assert.equal(judgeCalls, 3);
  assert.equal(result.experiences[0].company_id, alpha.id);
  assert.equal(result.experiences[1].company_id, null);
  assert.equal(result.diagnostics[0].matchedBy, "glm_candidate_selection");
  assert.equal(result.summary.llmCalls, 3);
  assert.equal(result.summary.llmCostUsd, 0.00063);
  assert.equal(result.summary.exaSearches, 0);
});

test("supplies multiple duplicate rows so the judge can select the canonical identity", async () => {
  const sparseLocalDuplicate = {
    ...alpha,
    id: 13,
    linkedin_company_id: null,
    linkedin_url: null,
    location: "Seoul, South Korea",
    website_url: null,
  };
  const canonical = {
    ...alpha,
    location: "San Francisco, United States",
    workspace_names: ["Alpha"],
  };

  const result = await resolveTalentExperienceCompanies({
    experiences: [
      experience({ company_location: "Seoul", company_name: "Alpha Korea" }),
    ],
    judge: {
      resolve: async (cases) => {
        assert.deepEqual(
          cases[0].candidates.map((candidate) => candidate.id),
          [canonical.id, sparseLocalDuplicate.id]
        );
        return {
          costUsd: 0,
          inputTokens: 0,
          latencyMs: 1,
          matches: new Map([["0", canonical.id]]),
          model: "z-ai/glm-5.3-flash",
          outputTokens: 0,
        };
      },
    },
    lookup: lookup({
      findByNameToken: async () => [sparseLocalDuplicate, canonical],
    }),
  });

  assert.equal(result.experiences[0].company_id, canonical.id);
  assert.deepEqual(result.diagnostics[0].llmCandidateIds, [
    canonical.id,
    sparseLocalDuplicate.id,
  ]);
});

test("uses ordered multi-token retrieval when a canonical row is outside broad token limits", async () => {
  const canonical = {
    ...alpha,
    id: 14,
    name: "Posco International Corp",
  };
  const sparseDuplicate = {
    ...alpha,
    id: 15,
    linkedin_company_id: null,
    linkedin_url: null,
    name: "Posco International",
    website_url: null,
  };

  const result = await resolveTalentExperienceCompanies({
    experiences: [experience({ company_name: "Posco International" })],
    judge: {
      resolve: async (cases) => {
        assert.ok(
          cases[0].candidates.some((candidate) => candidate.id === canonical.id)
        );
        return {
          costUsd: 0,
          inputTokens: 0,
          latencyMs: 1,
          matches: new Map([["0", canonical.id]]),
          model: "z-ai/glm-5.3-flash",
          outputTokens: 0,
        };
      },
    },
    lookup: lookup({
      findByExactName: async () => [sparseDuplicate, canonical],
      findByNameToken: async () => [sparseDuplicate],
      findByNameTokens: async () => [canonical],
    }),
  });

  assert.equal(result.experiences[0].company_id, canonical.id);
});

test("rejects a judge ID that was not supplied for the experience", async () => {
  const result = await resolveTalentExperienceCompanies({
    experiences: [experience()],
    judge: {
      resolve: async () => ({
        costUsd: 0,
        inputTokens: 0,
        latencyMs: 1,
        matches: new Map([["0", 999_999]]),
        model: "z-ai/glm-5.3-flash",
        outputTokens: 0,
      }),
    },
    lookup: lookup({ findByExactName: async () => [alpha, alphaUs] }),
  });

  assert.equal(result.experiences[0].company_id, null);
  assert.equal(result.diagnostics[0].matchedBy, "unresolved");
});

test("abstains when the audit rejects the selected candidate", async () => {
  let call = 0;
  const result = await resolveTalentExperienceCompanies({
    experiences: [experience()],
    judge: {
      resolve: async () => ({
        costUsd: 0,
        inputTokens: 0,
        latencyMs: 1,
        matches: new Map([["0", call++ === 0 ? alpha.id : null]]),
        model: "z-ai/glm-5.3-flash",
        outputTokens: 0,
      }),
    },
    lookup: lookup({ findByExactName: async () => [alpha, alphaUs] }),
  });

  assert.equal(result.experiences[0].company_id, null);
  assert.equal(result.summary.llmCalls, 3);
});

test("does not send substring-only retrieval noise to the judge", async () => {
  let judgeCalls = 0;
  const result = await resolveTalentExperienceCompanies({
    experiences: [experience({ company_name: "Protokol" })],
    judge: {
      resolve: async () => {
        judgeCalls += 1;
        throw new Error("judge should not be called");
      },
    },
    lookup: lookup({
      findByNameToken: async () => [
        {
          ...alpha,
          id: 22,
          name: "Senatskanzlei Protokoll Ausland",
        },
      ],
    }),
  });

  assert.equal(judgeCalls, 0);
  assert.equal(result.experiences[0].company_id, null);
  assert.equal(result.summary.llmCalls, 0);
});
