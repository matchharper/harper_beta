import { formatLlmDateTime } from "@/lib/llm/promptDateTime";

/** LLM-only relationship facts, not user-facing labels or message intent. */
export type AgentIntroductionContext = {
  rootId: string;
  talentId: string;
  roleId: string;
  recommendationId: string;
  candidateName: string | null;
  /** Company-only projection of the existing opportunity creation receipt. */
  candidateInitiatedOpportunity?: true;
  origin: {
    kind: "company_intro" | "candidate_request";
    requestedAt: string;
    companyIntroId?: string;
    candidateSentAt?: string | null;
  } | null;
};

export function formatIntroductionContext(context: AgentIntroductionContext) {
  const origin = context.origin;
  return [
    "Recorded connection history:",
    `Candidate: ${context.candidateName ?? "name not recorded"}; talent ${context.talentId}; Role ${context.roleId}; introduction ${context.rootId}`,
    context.candidateInitiatedOpportunity
      ? "Opportunity creation: saved after the candidate chose this Role. This creation receipt is not a talent-first recommendation."
      : "",
    origin
      ? `Connection origin: ${origin.kind === "candidate_request" ? "후보자의 연결 요청 (candidate-requested connection)" : "회사에서 먼저 요청한 Intro (company-requested Intro)"}; requested ${formatLlmDateTime(origin.requestedAt)}${origin.companyIntroId ? `; company Intro ${origin.companyIntroId}` : ""}.`
      : "Connection origin: not recorded.",
    origin?.kind === "candidate_request"
      ? "The candidate authorized Harper to request a connection for this internal Role. This origin record does not establish which explanation or preparation they received."
      : origin?.kind === "company_intro"
        ? "The company first requested an Intro for this candidate and Role; the candidate subsequently authorized this introduction."
        : "",
    origin?.candidateSentAt ? `Company Intro sent to candidate: ${formatLlmDateTime(origin.candidateSentAt)}.` : "",
  ].filter(Boolean).join("\n");
}

/** Before an introduction exists, the opportunity source is not a sharing decision. */
export function formatOpportunityOrigin(opportunityType: unknown) {
  if (opportunityType === "intro_request") return "Company-originated Intro proposal.";
  if (opportunityType === "internal_recommendation") return "Internal Role opportunity discovered or recommended through Harper; not a company-originated Intro proposal.";
  return null;
}
