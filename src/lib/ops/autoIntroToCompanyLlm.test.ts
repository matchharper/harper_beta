import assert from "node:assert/strict";
import test from "node:test";

process.env.OPENAI_API_KEY ||= "test-openai-key";

const loadAutoIntroLlmPrompt = () => import("./autoIntroToCompanyLlmPrompt");
const loadAutoIntroPromptContext = () =>
  import("./autoIntroToCompanyPromptContext");

const AUTHORED_BODY = `*TL;DR* - Taylor has owned production model-serving systems and built an inference profiler. The work directly supports Acme's need for reliable AI infrastructure.

*Harper Note* - His product ownership and research-to-production interests reinforce each other.
--------
Work Summary:
*AI Engineer @ Model Co (current)*
• Owned production model-serving systems.
• Built an open-source inference profiler.
------------

*Preferences:*
• *Technical scope:* Wants to own systems from research handoff to production.`;

const DOSSIER = {
  candidateCount: 1,
  companyContext: {
    careerUrl: "https://acme.example/careers",
    companyInformation: "Acme builds reliable AI infrastructure.",
    companyName: "Acme",
    employeeCount: "20-50",
    foundedYear: 2021,
    funding: {
      lastRound: "Seed round for product expansion",
      stage: "Seed",
      totalRaised: "$5M",
    },
    fundingUrl: null,
    homepageUrl: "https://acme.example",
    hiringRequest: "Build AI infrastructure with a small product team.",
    investors: "Example Ventures",
    lastNews: null,
    linkedinUrl: null,
    location: "San Francisco, CA",
    relatedLinks: [],
    specialities: "AI infrastructure",
    workspaceMemory: "The team values hands-on product ownership.",
  },
  companyName: "Acme",
  roles: [
    {
      candidateCount: 1,
      candidates: [
        {
          name: "Taylor Kim",
          professionalProfile: {
            bio: "Backend engineer focused on reliable model serving.",
            currentLocation: "Seoul",
            documents: [],
            educations: [
              {
                degree: "BS",
                description: null,
                end_date: "2020",
                field: "Computer Science",
                memo: null,
                school: "Example University",
                start_date: "2016",
                url: null,
              },
            ],
            engagementTypes: ["Full-time Role"],
            experiences: [
              {
                company_link: "https://model.example",
                company_location: "Seoul",
                company_name: "Model Co",
                description: "Owned production model-serving systems.",
                employment_type: "full_time",
                end_date: null,
                memo: "Strong ownership in a small team.",
                months: 36,
                role: "AI Engineer",
                start_date: "2023",
              },
            ],
            extras: {
              items: [
                {
                  description: "Built an open-source inference profiler.",
                  title: "Inference profiler",
                },
              ],
            },
            headline: "AI Infrastructure Engineer",
            insights: {
              next_scope: "Own systems from research handoff to production",
            },
            location: "Seoul",
            opsProfileMemos: ["Enjoys turning research into products."],
            resumeFileName: "taylor-resume.pdf",
            resumeLinks: ["https://github.com/taylor"],
            resumeText: "Taylor has operated production model-serving systems.",
          },
          reasonMode: "author" as const,
          storedCompanyCriteriaEvaluations: [
            {
              criteria: "Production ownership",
              evaluation: "Prior evaluator found strong evidence.",
            },
          ],
          storedReevaluationCriteria: {
            question: "Confirm on-call ownership depth.",
          },
          storedReason: "Prior fit rationale for reference, not copying.",
          talentId: "talent-1",
        },
      ],
      roleId: "role-1",
      roleTitle: "AI Engineer",
    },
  ],
  slackConnected: true,
  workspaceRoles: [
    {
      considerations: null,
      criteria: [
        {
          criteria: "Evidence of production ML infrastructure ownership",
          name: "Technical ownership",
        },
      ],
      description: "Build and operate Acme's model-serving platform.",
      descriptionSummary: "Production AI infrastructure role",
      employmentTypes: ["full_time"],
      externalJdUrl: null,
      information: { team_size: 5 },
      location: "San Francisco or remote",
      memory: "The hiring manager values debugging depth.",
      name: "AI Engineer",
      request: "Needs production systems ownership.",
      roleId: "role-1",
      salaryRange: null,
      seniority: "Senior",
      screeningQuestions: null,
      status: "active",
      summary: null,
      workMode: "hybrid",
    },
    {
      considerations: null,
      criteria: [],
      description: "Own data platform reliability.",
      descriptionSummary: null,
      employmentTypes: ["full_time"],
      externalJdUrl: null,
      information: null,
      location: "San Francisco",
      memory: null,
      name: "Data Platform Engineer",
      request: null,
      roleId: "role-2",
      salaryRange: null,
      seniority: null,
      screeningQuestions: null,
      status: "paused",
      summary: null,
      workMode: "hybrid",
    },
  ],
  workspaceId: "workspace-1",
};

test("auto intro prompt is scoped to one role-candidate pair and removes redundant context", async () => {
  const {
    AUTO_INTRO_LLM_MAX_WEB_TOOL_CALLS,
    AUTO_INTRO_LLM_SYSTEM_PROMPT,
    buildAutoIntroLlmInput,
    buildAutoIntroLlmPrompt,
  } = await loadAutoIntroLlmPrompt();
  const prompt = buildAutoIntroLlmPrompt(DOSSIER as never);
  const exactInput = buildAutoIntroLlmInput(DOSSIER as never);
  assert.equal(AUTO_INTRO_LLM_MAX_WEB_TOOL_CALLS, 10);
  assert.equal(
    exactInput.systemPrompt,
    "Follow the candidate-introduction contract exactly. Treat stored briefing facts as true, use web tools only for missing explanatory context, and finish with submit_auto_intro."
  );
  assert.equal(exactInput.systemPrompt, AUTO_INTRO_LLM_SYSTEM_PROMPT);
  assert.equal(exactInput.userPrompt, prompt);
  assert.match(prompt, /web_search and open_url share one hard budget of 10/);
  assert.match(
    prompt,
    /Do not independently validate, corroborate, or fact-check them/
  );
  assert.match(prompt, /Never search by candidate name/);
  assert.match(
    prompt,
    /Do not turn related or adjacent experience into a materially different role/
  );
  assert.match(
    prompt,
    /followUpQuestion is addressed to the hiring company, not the candidate/
  );
  assert.match(prompt, /combines rarity, relevance to the target role/);
  assert.match(prompt, /the capabilities that will most determine success/);
  assert.match(
    prompt,
    /Return the complete narrative candidate introduction as one slackProfile\.body string/
  );
  assert.match(prompt, /Never omit a section/);
  assert.match(prompt, /TL;DR must be no more than 5 sentences/);
  assert.match(prompt, /Harper Note must be no more than 3 sentences/);
  assert.match(prompt, /it is not a summary of career facts/);
  assert.match(
    prompt,
    /saved insights, profile\/interview\/conversation notes, memos/
  );
  assert.match(prompt, /derive Harper's most decision-useful view/);
  assert.match(prompt, /never imply that Harper directly observed or spoke/);
  assert.match(prompt, /End with Harper's interpretation/);
  assert.match(prompt, /not an instruction about what the hiring team should/);
  assert.match(prompt, /Do not repeat resume facts or metrics/);
  assert.match(prompt, /Choose at most 4 experiences/);
  assert.match(prompt, /currentness or recency/);
  assert.match(prompt, /sustained depth shown by meaningful tenure/);
  assert.match(prompt, /never split one employment, company tenure, project/);
  assert.match(prompt, /at most 3 bullets for any one experience/);
  assert.match(prompt, /at most 8 bullets across the full Work Summary/);
  assert.match(prompt, /Never include compensation, salary, pay/);
  assert.match(prompt, /Candidate-volunteered family, marital/);
  assert.match(prompt, /omitting it would materially mislead the company/);
  assert.match(prompt, /only the minimum detail needed for the decision/);
  assert.match(prompt, /Preferences must contain 1-4 concise/);
  assert.match(prompt, /exact short tenure when useful/);
  assert.match(prompt, /Never include citizenship or nationality/);
  assert.match(
    prompt,
    /minimums, targets, flexibility, willingness, and acceptance/
  );
  assert.doesNotMatch(prompt, /DOSSIER_JSON/);
  assert.match(prompt, /BEGIN STORED ROLE-CANDIDATE BRIEFING/);
  assert.doesNotMatch(prompt, /(?:Workspace|Role|Talent) ID:/);
  assert.match(prompt, /Target role: AI Engineer/);
  assert.doesNotMatch(prompt, /Data Platform Engineer/);
  assert.match(prompt, /Workspace memory \(reference only\)/);
  assert.match(prompt, /The team values hands-on product ownership/);
  assert.match(prompt, /Role memory \(reference only\)/);
  assert.match(prompt, /The hiring manager values debugging depth/);
  assert.match(prompt, /Stored fit rationale \(reference only\)/);
  assert.match(prompt, /Prior fit rationale for reference, not copying/);
  assert.match(
    prompt,
    /Stored company-criteria evaluations \(reference only\)/
  );
  assert.match(prompt, /Prior evaluator found strong evidence/);
  assert.match(prompt, /Stored reevaluation criteria \(reference only\)/);
  assert.match(prompt, /Confirm on-call ownership depth/);
  assert.match(prompt, /not an instruction, ground truth, or copy template/);
  assert.match(prompt, /Backend engineer focused on reliable model serving/);
  assert.match(prompt, /Owned production model-serving systems/);
  assert.match(prompt, /Example University/);
  assert.match(prompt, /Next scope: Own systems from research handoff/);
  assert.match(prompt, /Title: Inference profiler/);
  assert.match(prompt, /https:\/\/github\.com\/taylor/);
  assert.doesNotMatch(prompt, /https:\/\/acme\.example/);
  assert.doesNotMatch(prompt, /https:\/\/model\.example/);
  assert.doesNotMatch(prompt, /taylor-resume\.pdf/);
  assert.doesNotMatch(prompt, /Taylor has operated production/);
  assert.doesNotMatch(prompt, /Enjoys turning research into products/);
  assert.match(prompt, /REFERENCE OUTPUT EXAMPLE/);
  assert.match(prompt, /Israeli drone defense company \(Airbotics\)/);
  assert.match(prompt, /AI Solutions Engineer \(Backend\) @ Lendflow/);
  assert.match(prompt, /Hardware-as-a-service startup/);
  assert.doesNotMatch(prompt, /Candidate: Stav Tsechansky/);
  assert.doesNotMatch(prompt, /\{"next_scope"/);
  assert.doesNotMatch(prompt, /recommended opportunity history/i);
});

test("auto intro prompt rejects a multi-candidate LLM dossier", async () => {
  const { buildAutoIntroLlmPrompt } = await loadAutoIntroLlmPrompt();
  const multiCandidateDossier = {
    ...DOSSIER,
    candidateCount: 2,
    roles: [
      {
        ...DOSSIER.roles[0],
        candidateCount: 2,
        candidates: [
          DOSSIER.roles[0].candidates[0],
          {
            ...DOSSIER.roles[0].candidates[0],
            name: "Morgan Lee",
            talentId: "talent-2",
          },
        ],
      },
    ],
  };
  assert.throws(
    () => buildAutoIntroLlmPrompt(multiCandidateDossier as never),
    /exactly one role and one candidate/
  );
});

test("submission correction asks for only the candidate payload", async () => {
  const { buildAutoIntroLlmSubmissionCorrection } =
    await loadAutoIntroLlmPrompt();
  const correction = buildAutoIntroLlmSubmissionCorrection(
    new Error("Candidate Slack body does not match the required layout"),
    DOSSIER as never
  );

  assert.match(correction, /Candidate Slack body does not match/);
  assert.doesNotMatch(correction, /workspaceId|roleId|talentId/);
});

test("web tool results are verbalized without transport metadata", async () => {
  const { verbalizeAutoIntroWebToolResult } =
    await loadAutoIntroPromptContext();
  const search = verbalizeAutoIntroWebToolResult("web_search", {
    query: "Taylor Kim Model Co",
    resultCount: 1,
    results: [
      {
        highlights: ["Taylor built model-serving infrastructure."],
        rank: 1,
        title: "Taylor Kim profile",
        url: "https://example.com/taylor",
      },
    ],
  });
  assert.match(search, /WEB SEARCH RESULT/);
  assert.match(search, /1\. Taylor Kim profile/);
  assert.match(search, /Highlight: Taylor built model-serving/);
  assert.doesNotMatch(search, /"resultCount"/);

  const opened = verbalizeAutoIntroWebToolResult("open_url", {
    cached: true,
    createdAt: "2026-08-19T00:00:00.000Z",
    documentId: "internal-document-id",
    markdown: "Taylor owns the production serving platform.",
    title: "Taylor Kim",
    url: "https://example.com/taylor",
  });
  assert.match(opened, /Page content:\nTaylor owns the production/);
  assert.doesNotMatch(opened, /internal-document-id|createdAt|cached/);
});

test("auto intro submission gets application-owned dossier identifiers", async () => {
  const { parseAutoIntroLlmSubmission } = await loadAutoIntroLlmPrompt();
  const parsed = parseAutoIntroLlmSubmission(
    {
      followUpQuestion: null,
      slackProfile: {
        body: AUTHORED_BODY,
        currentRole: "AI Engineer @ Model Co",
        education: "Example University — BS — Computer Science",
        location: "Seoul",
      },
      sources: [],
    },
    DOSSIER as never
  );
  assert.equal(parsed.workspaceId, "workspace-1");
  assert.equal(parsed.roles[0]?.candidates[0]?.talentId, "talent-1");
  const candidate = parsed.roles[0]?.candidates[0];
  assert.equal(
    candidate && "slackProfile" in candidate
      ? candidate.slackProfile?.body
      : null,
    AUTHORED_BODY
  );
  assert.equal(
    candidate && "slackProfile" in candidate
      ? candidate.slackProfile?.currentRole
      : null,
    "AI Engineer @ Model Co"
  );
});

test("codex fit submissions return the same Slack body used as the saved reason", async () => {
  const { parseAutoIntroLlmSubmission } = await loadAutoIntroLlmPrompt();
  const codexDossier = {
    ...DOSSIER,
    roles: [
      {
        ...DOSSIER.roles[0],
        candidates: [
          {
            ...DOSSIER.roles[0].candidates[0],
            reasonMode: "codex" as const,
            storedReason: "Existing detailed reason",
          },
        ],
      },
    ],
  };
  const parsed = parseAutoIntroLlmSubmission(
    {
      followUpQuestion: null,
      slackProfile: {
        body: AUTHORED_BODY,
        currentRole: "AI Engineer @ Model Co",
        education: "Example University",
        location: "Seoul",
      },
      sources: [],
    },
    codexDossier as never
  );
  const candidate = parsed.roles[0]?.candidates[0];
  assert.equal(
    candidate && "slackProfile" in candidate
      ? candidate.slackProfile?.body
      : null,
    AUTHORED_BODY
  );
});
