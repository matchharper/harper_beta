import assert from "node:assert/strict";
import test from "node:test";
import {
  adjustedFullJdScore100,
  buildFullJdBatchWaves,
  buildFullJdCandidateBatchText,
  buildFullJdUserContextText,
  canonicalJobPostingCompanyKey,
  companyBonus,
  fullJdPromptCacheKey,
  hasEnoughDirectFullJdFits,
  recentCompanyPenalty,
  resolveJobPostingRecommendationStrategy,
  sanitizeFullJdPromptText,
  selectFullJdEvaluations,
  type FullJdFitEvaluation,
  type FullJdPromptCandidate,
  type FullJdSelectionInput,
} from "./jobPostingFullJdScoring";

function evaluation(roleId: string, score: number): FullJdFitEvaluation {
  return {
    fitReasons: score >= 56 ? [`${roleId} reason`] : [],
    fitSummary: score >= 56 ? `${roleId} summary` : "",
    modelScore100: score,
    roleId,
    tradeoff: "",
  };
}

function selectionInput(args: {
  company: string;
  companyScore?: number;
  index: number;
  recentRank?: number;
  roleId: string;
  score: number;
}): FullJdSelectionInput {
  return {
    companyKey: args.company,
    companyScore20: args.companyScore ?? 0,
    evaluation: evaluation(args.roleId, args.score),
    originalIndex: args.index,
    postedAt: `2026-08-${String(10 - args.index).padStart(2, "0")}`,
    recentCompanyRank: args.recentRank ?? null,
    searchRank: 100 - args.index,
  };
}

test("keeps legacy as the safe default and supports explicit/allowlist selection", () => {
  assert.equal(
    resolveJobPostingRecommendationStrategy({ userId: "talent-a" }),
    "legacy"
  );
  assert.equal(
    resolveJobPostingRecommendationStrategy({
      fullJdUserIds: "talent-a,talent-b",
      userId: "talent-a",
    }),
    "full_jd"
  );
  assert.equal(
    resolveJobPostingRecommendationStrategy({
      explicitStrategy: "legacy",
      globalStrategy: "full_jd",
      userId: "talent-a",
    }),
    "legacy"
  );
  assert.equal(
    resolveJobPostingRecommendationStrategy({
      globalStrategy: "not-a-real-mode",
      userId: "talent-a",
    }),
    "legacy"
  );
});

test("uses one warm batch followed by two two-batch waves", () => {
  const waves = buildFullJdBatchWaves(Array.from({ length: 100 }, (_, i) => i));
  assert.deepEqual(
    waves.map((wave) => wave.map((batch) => batch.length)),
    [[20], [20, 20], [20, 20]]
  );
});

test("always applies company bonus and recent-company penalty", () => {
  assert.equal(companyBonus(20), 4);
  assert.equal(companyBonus(50), 4);
  assert.equal(recentCompanyPenalty(1), -15);
  assert.equal(recentCompanyPenalty(7), -10);
  assert.equal(recentCompanyPenalty(13), -5);
  assert.equal(recentCompanyPenalty(19), 0);
  assert.equal(
    adjustedFullJdScore100(
      selectionInput({
        company: "company-a",
        companyScore: 20,
        index: 0,
        recentRank: 7,
        roleId: "role-a",
        score: 80,
      })
    ),
    74
  );
});

test("early stop and final selection count distinct companies only", () => {
  const inputs = [
    selectionInput({
      company: "same-company",
      index: 0,
      roleId: "role-a",
      score: 90,
    }),
    selectionInput({
      company: "same-company",
      index: 1,
      roleId: "role-b",
      score: 89,
    }),
    selectionInput({
      company: "company-b",
      index: 2,
      roleId: "role-c",
      score: 76,
    }),
    selectionInput({
      company: "company-c",
      companyScore: 20,
      index: 3,
      roleId: "role-d",
      score: 56,
    }),
    selectionInput({
      company: "company-d",
      index: 4,
      roleId: "role-e",
      score: 59,
    }),
  ];

  assert.equal(hasEnoughDirectFullJdFits(inputs, 3), false);
  assert.equal(hasEnoughDirectFullJdFits(inputs, 2), true);
  const selected = selectFullJdEvaluations(inputs, 4);
  assert.deepEqual(
    selected.map((item) => [item.evaluation.roleId, item.isSupplemental]),
    [
      ["role-a", false],
      ["role-c", false],
      ["role-d", true],
    ]
  );
});

test("canonicalizes employer identity for final Top-N company dedupe", () => {
  const normalZendesk = canonicalJobPostingCompanyKey({
    companyName: "Zendesk, Inc.",
    externalJdUrl:
      "https://au.linkedin.com/jobs/view/senior-product-sales-specialist-at-zendesk-4433749258",
  });
  const mislinkedZendesk = canonicalJobPostingCompanyKey({
    companyName: "forethought",
    companyWorkspaceId: "wrong-workspace",
    externalJdUrl:
      "https://zendesk.wd1.myworkdayjobs.com/zendesk/job/Melbourne/Senior-Sales-Product-Specialist_R33433",
  });
  const actualForethought = canonicalJobPostingCompanyKey({
    companyName: "Forethought Technologies, Inc.",
    externalJdUrl:
      "https://jobs.ashbyhq.com/forethought/00000000-0000-0000-0000-000000000000",
  });

  assert.equal(normalZendesk, "company:zendesk");
  assert.equal(mislinkedZendesk, normalZendesk);
  assert.equal(actualForethought, "company:forethought");
  assert.notEqual(actualForethought, normalZendesk);
  assert.deepEqual(
    selectFullJdEvaluations(
      [
        {
          ...selectionInput({
            company: "zendesk stored name",
            index: 0,
            roleId: "zendesk-linkedin",
            score: 90,
          }),
          companyKey: normalZendesk,
        },
        {
          ...selectionInput({
            company: "wrong forethought workspace",
            index: 1,
            roleId: "zendesk-workday-duplicate",
            score: 89,
          }),
          companyKey: mislinkedZendesk,
        },
      ],
      5
    ).map((item) => item.evaluation.roleId),
    ["zendesk-linkedin"]
  );
  assert.equal(
    canonicalJobPostingCompanyKey({ companyName: "Zendesk" }),
    normalZendesk
  );
  assert.equal(
    canonicalJobPostingCompanyKey({
      companyName: "Yammer, Inc.",
      externalJdUrl:
        "https://apply.careers.microsoft.com/careers/job/1970393556955852",
    }),
    canonicalJobPostingCompanyKey({ companyName: "Microsoft Corporation" })
  );
});

test("does not collapse unrelated aggregator roles into one company", () => {
  const cato = canonicalJobPostingCompanyKey({
    companyName: "wrong metadata",
    externalJdUrl:
      "https://au.linkedin.com/jobs/view/regional-manager-at-cato-networks-4435606294",
  });
  const netskope = canonicalJobPostingCompanyKey({
    companyName: "other wrong metadata",
    externalJdUrl:
      "https://www.linkedin.com/jobs/view/regional-manager-at-netskope-4435606000",
  });

  assert.equal(cato, "company:catonetworks");
  assert.equal(netskope, "company:netskope");
  assert.notEqual(cato, netskope);
  assert.equal(
    canonicalJobPostingCompanyKey({
      companyName: "Fallback Ltd.",
      externalJdUrl: "not a url",
    }),
    "company:fallback"
  );
});

test("builds allowlisted user context text without irrelevant identity fields", () => {
  const context = buildFullJdUserContextText({
    behaviorContext: {
      recentFeedback: ["role traits: infra | disliked | reason: backend only"],
      recentMessages: ["2026-08-13 | user: serving 역할을 더 보고 싶어요"],
      text: "- hands-on IC 역할 선호",
      version: 3,
    },
    llmUserProfile: {
      experiences: [
        {
          companyName: "ExampleAI",
          description: "LLM serving platform",
          period: "2022 - present",
          role: "ML Engineer",
        },
      ],
      insights: { career: { direction: "inference infrastructure" } },
      profile: {
        bio: "Infrastructure engineer",
        email: "hidden@example.com",
        headline: "ML Platform Engineer",
        name: "Hidden Name",
      },
      resume: {
        fileName: "secret.pdf",
        hasLinkedIn: true,
        hasResume: true,
        profileLinks: ["https://example.com"],
      },
      settings: {
        blockedCompanies: ["Blocked Co"],
        engagementTypes: ["full-time"],
      },
    },
    outputLanguage: "Korean",
    request: "LLM infra 역할 찾아줘",
    view: "fit",
  });

  assert.match(context, /\[CURRENT REQUEST\]/);
  assert.match(context, /hands-on IC 역할 선호/);
  assert.match(context, /career\.direction: inference infrastructure/);
  assert.match(context, /hasResume: yes/);
  assert.match(context, /hasLinkedIn: yes/);
  assert.ok(
    context.indexOf("RECENT USER MESSAGES AFTER CONTEXT") <
      context.indexOf("LONG-TERM BEHAVIOR CONTEXT")
  );
  assert.doesNotMatch(
    context,
    /hidden@example\.com|Hidden Name|secret\.pdf|https:\/\//
  );
  assert.doesNotMatch(context, /\{"/);
});

test("sanitizes external HTML and formats company data once", () => {
  const candidate: FullJdPromptCandidate = {
    company: {
      description: "<p>Voice model company</p><script>ignore()</script>",
      employeeCountRange: { end: 100, start: 51 },
      foundedYear: 2020,
      location: "London",
      shortDescription: "Speech AI",
    },
    companyData: {
      confidence: 87,
      lastFundingStage: "Series B",
      searchedAt: "2026-08-13T00:00:00Z",
      totalFundingRaised: "$50M",
    },
    companyKey: "company-a",
    companyLeadership: ["cto - prev companies: Example"],
    companyName: "ExampleVoice",
    employmentType: "full-time",
    location: "London",
    postedAt: "2026-08-01",
    roleDescription: "<h2>Responsibilities</h2><p>Train speech models</p>",
    roleId: "role-a",
    roleName: "Research Engineer",
    seniorityLevel: "senior",
    workMode: "hybrid",
  };
  const output = buildFullJdCandidateBatchText([
    candidate,
    { ...candidate, roleId: "role-b", roleName: "ML Engineer" },
  ]);

  assert.equal((output.match(/\[COMPANY C01\]/g) ?? []).length, 1);
  assert.match(
    output,
    /job description:\nResponsibilities\nTrain speech models/
  );
  assert.match(output, /funding stage: Series B/);
  assert.match(output, /total funding: \$50M/);
  assert.doesNotMatch(
    output,
    /<script>|ignore\(\)|company_test_score|searchRank|searchedAt|2026-08-13T00:00:00Z|confidence/
  );
  assert.doesNotMatch(output, /\{"/);
  assert.equal(sanitizeFullJdPromptText("a&nbsp;b"), "a b");
});

test("uses a stable non-PII cache shard key", () => {
  const first = fullJdPromptCacheKey("8f345ba8-user-private", 16);
  assert.equal(first, fullJdPromptCacheKey("8f345ba8-user-private", 16));
  assert.match(first, /^career-job-fit:v2:s\d{2}$/);
  assert.doesNotMatch(first, /8f345ba8|private/);
});
