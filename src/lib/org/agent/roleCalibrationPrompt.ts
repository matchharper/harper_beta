export type RoleCalibrationReference = {
  content: string;
  label: string;
  sourceKind: "attachment" | "internal_talent" | "url";
  truncated: boolean;
  url: string | null;
};

export type RoleCalibrationPromptInput = {
  companyContext: string;
  companySideContext: string;
  currentHiringBrief: string | null;
  otherRoleCalibrationContext: string;
  references?: RoleCalibrationReference[];
  roleDescription: string | null;
  roleName: string;
  userMessage: string;
};

export type RoleCalibrationDraft = {
  followUpQuestion: string | null;
  hiringBrief: string | null;
  shouldUpdate: boolean;
  summary: string;
  userReply: string;
};

export const ROLE_CALIBRATION_OPEN_URL_TOOL_DEFINITION = {
  function: {
    description:
      "Read one or more exact professional-evidence URLs concurrently and return page markdown for each. Batch all immediately known relevant URLs in one call. Do not use for private attachment URLs or unrelated company/JD pages.",
    name: "open_url",
    parameters: {
      additionalProperties: false,
      properties: {
        maxMarkdownChars: {
          default: 18_000,
          description: "Maximum markdown characters returned per URL.",
          maximum: 18_000,
          minimum: 4_000,
          type: "integer",
        },
        urls: {
          description:
            "Exact http(s) URLs that the user supplied or clearly designated as evidence for the reference people.",
          items: { type: "string" },
          maxItems: 8,
          minItems: 1,
          type: "array",
        },
      },
      required: ["urls"],
      type: "object",
    },
    strict: false,
  },
  type: "function" as const,
};

export const ROLE_CALIBRATION_READ_TALENT_TOOL_DEFINITION = {
  function: {
    description:
      "Read the full professional profiles of one to five company-visible internal Harper candidates whose exact talent IDs are already present in resolved mentions. Batch comparisons in one call. Never guess or search for an ID.",
    name: "read_talent",
    parameters: {
      additionalProperties: false,
      properties: {
        talentIds: {
          items: { maxLength: 100, minLength: 1, type: "string" },
          maxItems: 5,
          minItems: 1,
          type: "array",
        },
      },
      required: ["talentIds"],
      type: "object",
    },
    strict: true,
  },
  type: "function" as const,
};

function clip(value: string | null | undefined, maxLength: number) {
  const normalized = String(value ?? "").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function buildRoleCalibrationSystemPrompt() {
  return `ROLE
You turn real-person examples into the private Hiring Brief rules Harper uses to compare future candidates for one Role.

GOAL
Read the supplied professional evidence, identify why the example may represent the level the company values, and translate those signals into general candidate criteria. The Hiring Brief must be directly useful when judging future candidate-to-Role fit. The user reply must explain how the evidence led to each change.

SUCCESS CRITERIA
- Every relevant supplied source has been read.
- Existing Role requirements and confirmed preferences remain intact unless the user changes them; equivalent existing rules are not repeated.
- The Hiring Brief uses operational candidate language such as required, bonus, acceptable substitute, or insufficient by itself.
- Each saved rule is broader than the reference person's exact biography but concrete enough to match future candidates. Explicit Top-tier school, company, program, or core-team signals remain explicit when they matter.
- One example produces a small set of non-exclusive bonuses. Multiple examples may support a stronger shared rule, alternatives, or a meaningful contrast.
- The user can understand which source facts were used, how they were generalized, why the rule has its chosen strength, and which existing conditions were left unchanged.
- Unless the user explicitly requests candidate assessment, the result contains no conclusion, concern, or follow-up about whether the reference person fits the Role. The reference person's Role gaps are outside this calibration.

AVAILABLE CONTEXT
The input contains the current Role, existing Hiring Brief, company context, relevant conversation, supplied attachments, and possibly criteria from other Roles. Treat the current Role fields as authoritative when older conversation text differs.

EVIDENCE
- A reason the user states is the strongest evidence of what the company values.
- Verified professional facts may support that reason and may also reveal a small number of distinctive, job-relevant strengths the user reasonably could be pointing to.
- A short response such as "이런 사람?" inherits the preceding conversation. When no reason was stated, make the narrowest useful interpretation from the profile's strongest distinctive professional signals, save them as bonuses rather than requirements, and explain that interpretation in the user reply.
- Keep observed facts and inferred peer groups distinguishable in the user reply. Missing evidence remains unknown. Use professional, job-related information only.

TOOLS
- Use open_url for user-designated professional URLs. Put all currently known relevant URLs in one urls array.
- Use read_talent only for exact internal talent IDs already resolved in the context, batching the relevant IDs in one call.
- Attachments and pasted professional histories are already available in the input.
- If a required source is unavailable, return no update and request the nearest usable evidence.

DECISION MODEL
Keep these layers distinct in the Hiring Brief:

1. ROLE ELIGIBILITY / EXPERIENCE FIT
   The function, scope, domain, seniority, location, language, and other evidence required to perform this Role. Preserve this layer unless the user explicitly changes it. A reference person's unrelated gap is not a new Role rule.

2. COMPANY TALENT QUALITY / CALIBER
   The demonstrated overall level at which this company is likely to choose an interview after Role eligibility is satisfied. Selective education, Top-tier employers or teams, progression, responsibility, problem difficulty, and rare outcomes can raise this assessment.

3. TEAM-SPECIFIC BONUSES
   Professional evidence that ranks people higher without excluding otherwise qualified candidates. A rare adjacent experience may belong here even when it is not the same function as the Role—for example, unusually strong B2B AI implementation or direct technical work on hard customer problems—while the Role's existing minimum experience remains unchanged.

GENERALIZING A REFERENCE
For every material signal, decide three things:

1. Observed anchor: the verified school, employer, team, work, progression, or outcome that makes the signal credible.
2. Matchable peer group: a category broader than the exact anchor and narrow enough to use in candidate evaluation. State Top-tier status explicitly and name representative peers when that makes the group concrete. The examples are representative, not a whitelist.
3. Rule strength: requirement, bonus, substitute, or context only. One reference defaults to a bonus unless the user explicitly makes it a requirement.

A specific institution is an anchor for its peer group, not the whole rule. For example, a Korean KAIST or science-high-school anchor can support a bonus for Korea's highly selective science/youngjae high schools and leading universities such as Seoul National, KAIST, POSTECH, Yonsei, and Korea University. A Woowa Brothers or AWS anchor can support separate bonuses for leading Korean technology/product companies and globally leading technology companies. Representative Korean peers can include NAVER, Kakao, LINE, Coupang, Woowa Brothers, Daangn, Toss, Moloco, and Dunamu; representative global peers can include AWS, Google, Microsoft, Meta, and Apple. Adapt each group to the person's actual market, period, function, team, and contribution. These names illustrate the level and are not an exhaustive whitelist.

Institutional affiliation can be a useful bonus by itself when the user values selectivity; sustained contribution, increasing responsibility, or rare results make it stronger. Exceptional evidence outside conventional institutions can support an equivalent path.

REFERENCE COUNT
- One person usually supports two to four distinct bonuses. It does not establish an exclusive list or a new hard gate.
- Two people can show a shared signal, two equivalent paths, or a meaningful contrast. Preserve whichever interpretation the evidence supports.
- Three or more varied people can support the smallest stable set of rules that explains why the company values the group, including substitutes and counterexamples.

UPDATING THE HIRING BRIEF
- Return the complete Hiring Brief while preserving unaffected wording and structure.
- Revise only the decision rule established, contradicted, or clarified by the new evidence.
- Keep Role eligibility unchanged when the input concerns only company caliber.
- Write the added text as direct future-candidate criteria, normally compact bullets ending in language such as "가산점", "필수", or "동급 증거로 인정". Include representative schools or companies when they make a Top-tier peer group operational.
- Keep source identity, URLs, profile chronology, and calibration rationale in the user reply. The Hiring Brief contains the resulting criteria, not provenance or phrases such as current preference, reference example, tentative calibration, or Role-fit commentary about the reference person.
- For one reference, change only the relevant section and keep net growth within 700 Korean characters or a comparable amount in another language.
- Several references may justify a broader rewrite of the caliber section when comparison reveals stable rules. Preserve confirmed requirements elsewhere.
- When new evidence conflicts with a confirmed rule, keep the conflict explicit and ask the one question that would change matching most.

OUTPUT
Use the latest user's language. The Hiring Brief should use clear Markdown and keep Role eligibility, company caliber, and confirmed bonuses visibly distinct.

Set shouldUpdate=true when the evidence supports a meaningful Hiring Brief change and return the complete replacement in hiringBrief. Otherwise set shouldUpdate=false, set hiringBrief to null, and ask for the smallest missing input in followUpQuestion.

summary states the decision rules that changed or the reason no safe change was possible.

userReply is the evidence explanation for the company user. It should:
- confirm that the supplied material was reviewed and say how the reference count affected rule strength;
- connect each material source fact to the broader school, company, achievement, or adjacent-experience rule it produced;
- explain why each rule is a bonus, requirement, or substitute;
- name only directly relevant existing conditions that were recognized but not duplicated;
- keep the explanation about the criteria for future candidates. Discuss the reference person's Role fit only when the user explicitly asks for that separate assessment.

For a successful one-reference calibration, followUpQuestion is normally null. Ask a follow-up only when the source cannot be read or the evidence cannot support any safe professional criterion; missing proof that the reference person satisfies this Role is not a calibration question.

Return only the required JSON object.`;
}

export function buildRoleCalibrationUserPrompt(
  input: RoleCalibrationPromptInput
) {
  const references = (input.references ?? []).map((reference, index) => ({
    content: clip(reference.content, 18_000),
    index: index + 1,
    label: clip(reference.label, 240),
    sourceKind: reference.sourceKind,
    truncated: reference.truncated,
    url: reference.url,
  }));
  return [
    "<authoritative_role>",
    JSON.stringify(
      {
        companyContext: clip(input.companyContext, 12_000),
        currentHiringBrief: clip(input.currentHiringBrief, 24_000) || null,
        otherRoleCalibrationContext:
          clip(input.otherRoleCalibrationContext, 16_000) || null,
        roleDescription: clip(input.roleDescription, 18_000) || null,
        roleName: clip(input.roleName, 240),
      },
      null,
      2
    ),
    "</authoritative_role>",
    "<existing_company_side_context>",
    clip(input.companySideContext, 48_000),
    "</existing_company_side_context>",
    "<already_read_sources>",
    JSON.stringify(references, null, 2),
    "</already_read_sources>",
    "<current_user_request>",
    clip(input.userMessage, 16_000),
    "</current_user_request>",
    "The authoritative Role fields override stale copies in conversation context. Read relevant supplied sources with the tools before producing the final JSON.",
  ].join("\n");
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

export function parseRoleCalibrationDraft(
  value: unknown
): RoleCalibrationDraft {
  const source =
    typeof value === "string"
      ? record(JSON.parse(value.replace(/^```(?:json)?\s*|\s*```$/gi, "")))
      : record(value);
  const shouldUpdate = source.shouldUpdate === true;
  const hiringBrief = text(source.hiringBrief) || null;
  const summary = text(source.summary);
  const userReply = text(source.userReply);
  const followUpQuestion = text(source.followUpQuestion) || null;
  if (shouldUpdate && !hiringBrief) {
    throw new Error("Calibration returned no Hiring Brief for an update");
  }
  if (!shouldUpdate && hiringBrief) {
    throw new Error("Calibration returned a Hiring Brief for a no-update result");
  }
  if (!summary) throw new Error("Calibration returned no summary");
  if (!userReply) throw new Error("Calibration returned no user reply");
  if (hiringBrief && hiringBrief.length > 12_000) {
    throw new Error("Calibration Hiring Brief is too long");
  }
  if (summary.length > 600) throw new Error("Calibration summary is too long");
  if (followUpQuestion && followUpQuestion.length > 1_000) {
    throw new Error("Calibration follow-up question is too long");
  }
  if (userReply.length > 2_000) {
    throw new Error("Calibration user reply is too long");
  }
  return {
    followUpQuestion,
    hiringBrief,
    shouldUpdate,
    summary,
    userReply,
  };
}

export const ROLE_CALIBRATION_JSON_SCHEMA = {
  additionalProperties: false,
  properties: {
    followUpQuestion: { maxLength: 1_000, type: ["string", "null"] },
    hiringBrief: {
      maxLength: 12_000,
      type: ["string", "null"],
    },
    shouldUpdate: { type: "boolean" },
    summary: { maxLength: 600, minLength: 1, type: "string" },
    userReply: { maxLength: 2_000, minLength: 1, type: "string" },
  },
  required: [
    "shouldUpdate",
    "hiringBrief",
    "summary",
    "followUpQuestion",
    "userReply",
  ],
  type: "object",
} as const;
