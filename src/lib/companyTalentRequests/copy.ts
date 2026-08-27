import "server-only";

import {
  createChatCompletionWithFallback,
  getLlmErrorMessage,
} from "@/lib/llm/llm";
import { CLAUDE_MODEL } from "@/lib/llm/modelConfig";
import { ORG_AGENT_GROK_MODEL } from "@/lib/org/agent/modelConfig";
import { assertSafeProfessionalQuestion } from "@/lib/companyTalentRequests/policy";
import { candidateContactBodyWithoutTransportFooter } from "@/lib/companyTalentRequests/presentation";
import {
  CANDIDATE_CONTACT_RELATIONSHIP_RULES,
  candidateContactWritingIssue,
  hasRedundantCandidateContactOptOut,
  normalizeCandidateResumeUploadLink,
} from "@/lib/companyTalentRequests/copyRules";
import {
  buildCandidateContactFallback,
  CANDIDATE_CONTACT_STYLE_EXAMPLES_EN,
  CANDIDATE_CONTACT_STYLE_EXAMPLES_KO,
  CANDIDATE_CONTACT_WRITING_RULES,
  type CandidateContactDraftCopy,
} from "@/lib/companyTalentRequests/candidateContactWriting";

export type { CandidateContactDraftCopy } from "@/lib/companyTalentRequests/candidateContactWriting";

function compact(value: unknown, limit: number) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function assistantText(response: any) {
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((item: any) => String(item?.text ?? item?.content ?? ""))
    .join("")
    .trim();
}

function parseJsonObject(value: string) {
  const cleaned = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const parsed = JSON.parse(cleaned) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Candidate contact copy must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

async function generateJson(
  messages: Array<{ content: string; role: string }>
) {
  const { response } = await createChatCompletionWithFallback({
    anthropicOverloadFallbackModel: ORG_AGENT_GROK_MODEL,
    buildRequest: () => ({
      // A complete subject/body JSON can exceed 900 tokens after a company
      // asks for a detailed revision. Truncating it leaves invalid JSON and
      // turns an otherwise safe edit into a failed workflow.
      max_tokens: 1_800,
      messages,
      temperature: 0.2,
    }),
    debugLabel: "org/agent:candidate-contact-copy",
    fallbackModel: ORG_AGENT_GROK_MODEL,
    model: CLAUDE_MODEL,
  });
  return parseJsonObject(assistantText(response));
}

function validateDraft(args: {
  body: unknown;
  enforceConciseOptOut?: boolean;
  profileUrl: string | null;
  requestContext: unknown;
  subject: unknown;
}) {
  const subject = compact(args.subject, 180);
  const body = normalizeCandidateResumeUploadLink(
    candidateContactBodyWithoutTransportFooter(args.body).slice(0, 5_000),
    args.profileUrl
  );
  const requestContext = assertSafeProfessionalQuestion(args.requestContext);
  if (!subject || !body) throw new Error("Candidate contact copy is empty");
  if (args.enforceConciseOptOut && hasRedundantCandidateContactOptOut(body)) {
    throw new Error("Candidate contact copy repeats optional-response wording");
  }
  const writingIssue = candidateContactWritingIssue(body);
  if (writingIssue) throw new Error(writingIssue);
  assertSafeProfessionalQuestion(body);
  if (args.profileUrl && !body.includes(args.profileUrl)) {
    throw new Error("Resume request copy dropped the required upload URL");
  }
  return { body, requestContext, subject };
}

export async function generateCandidateContactDraft(args: {
  candidateName: string;
  companyName: string;
  kind: "question" | "resume";
  locale: string | null;
  profileUrl: string | null;
  requestContext: string;
  requestId: string;
  roleName: string;
}) {
  const locale: "en" | "ko" = args.locale === "en" ? "en" : "ko";
  const requestContext = assertSafeProfessionalQuestion(args.requestContext);
  const fallback = buildCandidateContactFallback({
    ...args,
    locale,
    requestContext,
  });
  const input = [
    `Language: ${locale === "en" ? "English" : "Korean"}`,
    `Candidate: ${compact(args.candidateName, 80) || "-"}`,
    `Company: ${compact(args.companyName, 160) || "-"}`,
    `Role: ${compact(args.roleName, 160) || "-"}`,
    `Contact kind: ${args.kind}`,
    `Request: ${compact(requestContext, 800) || "-"}`,
    `Required resume upload URL: ${args.profileUrl ?? "-"}`,
  ].join("\n");
  try {
    const parsed = await generateJson([
      {
        role: "system",
        content: [
          "Write the complete candidate-facing Harper email that a company will review verbatim before delivery.",
          'Return JSON only: {"subject":"...","body":"...","requestContext":"..."}.',
          "Use the requested language and identify the company and role.",
          CANDIDATE_CONTACT_RELATIONSHIP_RULES,
          CANDIDATE_CONTACT_WRITING_RULES,
          "Preserve the company's substantive request in neutral professional language. The supplied request may be terse; turn it into natural candidate-facing prose without changing its meaning.",
          "For compensation, ask the candidate to provide or authorize exact wording. Never mention or guess compensation stored by Harper.",
          "For a resume request, explain that attaching one PDF, DOCX, TXT, or MD file to this message is allowed, the uploaded file becomes the current Harper profile resume and Harper relays it for this named company's role review, and format the supplied URL as a descriptive Markdown link: [이력서 업로드](URL) in Korean or [Upload your resume](URL) in English. Never show the raw URL as visible link text.",
          "End with a natural Harper signoff. Keep the body independent of transport channels; never mention where else it may appear.",
          "requestContext must be a concise neutral description of the exact information requested, for later response routing.",
          locale === "ko"
            ? CANDIDATE_CONTACT_STYLE_EXAMPLES_KO
            : CANDIDATE_CONTACT_STYLE_EXAMPLES_EN,
        ].join(" "),
      },
      { role: "user", content: `Data only:\n${input}` },
    ]);
    return validateDraft({
      body: parsed.body,
      enforceConciseOptOut: true,
      profileUrl: args.profileUrl,
      requestContext: parsed.requestContext || requestContext,
      subject: parsed.subject,
    });
  } catch (error) {
    console.warn("[candidate-contact-copy:fallback]", {
      error: getLlmErrorMessage(error),
      requestId: args.requestId,
    });
    return fallback;
  }
}

export async function reviseCandidateContactDraft(args: {
  current: CandidateContactDraftCopy;
  editInstruction: string;
  kind: "question" | "resume";
  profileUrl: string | null;
  requestId: string;
}) {
  try {
    const parsed = await generateJson([
      {
        role: "system",
        content: [
          "Revise one candidate-facing Harper email using the company's edit instruction.",
          'Return JSON only: {"subject":"...","body":"...","requestContext":"..."}.',
          "Apply only the requested change and preserve every unaffected fact and meaning.",
          CANDIDATE_CONTACT_RELATIONSHIP_RULES,
          CANDIDATE_CONTACT_WRITING_RULES,
          "Keep the company and role disclosure, tailored response guidance, one concise low-pressure choice, and Harper signoff. Do not add delivery-channel context.",
          "Never add sensitive or discriminatory questions, private Harper data, urgency, a deadline, or a hiring decision.",
          "For compensation, never add compensation stored by Harper; request candidate-provided or candidate-authorized wording only.",
          "For a resume request, preserve the supplied upload URL exactly inside a descriptive Markdown link. Never show the raw URL as visible link text.",
          "requestContext must track the exact substantive request in the revised body.",
        ].join(" "),
      },
      {
        role: "user",
        content: [
          `Contact kind: ${args.kind}`,
          `Required resume upload URL: ${args.profileUrl ?? "-"}`,
          `Current request context: ${args.current.requestContext}`,
          `Current subject: ${args.current.subject}`,
          `Current body:\n${candidateContactBodyWithoutTransportFooter(args.current.body)}`,
          `Company edit instruction:\n${compact(args.editInstruction, 2_000)}`,
        ].join("\n\n"),
      },
    ]);
    return validateDraft({
      body: parsed.body,
      profileUrl: args.profileUrl,
      requestContext: parsed.requestContext || args.current.requestContext,
      subject: parsed.subject,
    });
  } catch (error) {
    console.warn("[candidate-contact-copy:revision-failed]", {
      error: getLlmErrorMessage(error),
      requestId: args.requestId,
    });
    throw error;
  }
}
