import "server-only";

import {
  createChatCompletionWithFallback,
  getLlmErrorMessage,
} from "@/lib/llm/llm";
import { CLAUDE_MODEL, GPT_56_LUNA_MODEL } from "@/lib/llm/modelConfig";
import { assertSafeProfessionalQuestion } from "@/lib/companyTalentRequests/policy";
import { candidateContactBodyWithoutTransportFooter } from "@/lib/companyTalentRequests/presentation";
import { assertCandidateResumeUploadLink } from "@/lib/companyTalentRequests/copyRules";
import {
  CANDIDATE_CONTACT_COPY_MAX_OUTPUT_TOKENS,
  CANDIDATE_CONTACT_COPY_SCHEMA,
  buildCandidateContactDraftMessages,
  buildCandidateContactRevisionMessages,
  type CandidateContactDraftCopy,
} from "@/lib/companyTalentRequests/copyPrompt";

export type { CandidateContactDraftCopy } from "@/lib/companyTalentRequests/copyPrompt";

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
    anthropicOverloadFallbackModel: GPT_56_LUNA_MODEL,
    buildRequest: () => ({
      // Responses API output budgets include both reasoning and visible JSON.
      // Keep enough room for xhigh reasoning plus a complete subject/body.
      max_tokens: CANDIDATE_CONTACT_COPY_MAX_OUTPUT_TOKENS,
      messages,
      temperature: 0.2,
    }),
    debugLabel: "org/agent:candidate-contact-copy",
    fallbackModel: GPT_56_LUNA_MODEL,
    model: CLAUDE_MODEL,
    openAIResponses: { reasoningEffort: "xhigh" },
    structuredOutput: {
      name: "candidate_contact_copy",
      schema: CANDIDATE_CONTACT_COPY_SCHEMA,
    },
    validateResponse: (response) => {
      parseJsonObject(assistantText(response));
    },
  });
  return parseJsonObject(assistantText(response));
}

function validateDraft(args: {
  body: unknown;
  profileUrl: string | null;
  reason: unknown;
  requestContext: unknown;
  subject: unknown;
}) {
  const subject = compact(args.subject, 180);
  const body = candidateContactBodyWithoutTransportFooter(args.body).slice(
    0,
    5_000
  );
  const requestContext = assertSafeProfessionalQuestion(args.requestContext);
  const reason = compact(args.reason, 600) || null;
  if (!subject || !body) throw new Error("Candidate contact copy is empty");
  assertSafeProfessionalQuestion(body);
  assertCandidateResumeUploadLink(body, args.profileUrl);
  return { body, reason, requestContext, subject };
}

export async function generateCandidateContactDraft(args: {
  candidateName: string;
  companyName: string;
  currentInstruction: string;
  kind: "contact" | "question" | "resume";
  locale: string | null;
  profileUrl: string | null;
  recentConversation: string;
  requestContext: string;
  requestId: string;
  roleName: string;
}) {
  const requestContext = assertSafeProfessionalQuestion(args.requestContext);
  try {
    const parsed = await generateJson(
      buildCandidateContactDraftMessages({
        candidateName: args.candidateName,
        companyName: args.companyName,
        currentInstruction: args.currentInstruction,
        kind: args.kind,
        profileUrl: args.profileUrl,
        recentConversation: args.recentConversation,
        recipientLocale: args.locale,
        requestContext,
        roleName: args.roleName,
      })
    );
    return validateDraft({
      body: parsed.body,
      profileUrl: args.profileUrl,
      reason: parsed.reason,
      requestContext: parsed.requestContext || requestContext,
      subject: parsed.subject,
    });
  } catch (error) {
    console.warn("[candidate-contact-copy:generation-failed]", {
      error: getLlmErrorMessage(error),
      requestId: args.requestId,
    });
    throw error;
  }
}

export async function reviseCandidateContactDraft(args: {
  current: CandidateContactDraftCopy;
  currentInstruction: string;
  editInstruction: string;
  kind: "contact" | "question" | "resume";
  locale: string | null;
  profileUrl: string | null;
  recentConversation: string;
  requestId: string;
}) {
  try {
    const parsed = await generateJson(
      buildCandidateContactRevisionMessages({
        current: args.current,
        currentInstruction: args.currentInstruction,
        editInstruction: args.editInstruction,
        kind: args.kind,
        profileUrl: args.profileUrl,
        recentConversation: args.recentConversation,
        recipientLocale: args.locale,
      })
    );
    return validateDraft({
      body: parsed.body,
      profileUrl: args.profileUrl,
      reason: parsed.reason,
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
