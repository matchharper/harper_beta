import "server-only";

import {
  createChatCompletionWithFallback,
  getLlmErrorMessage,
} from "@/lib/llm/llm";
import { CLAUDE_MODEL, GPT_6_LUNA_MODEL } from "@/lib/llm/modelConfig";
import { validateCompanyContactContext } from "@/lib/companyTalentRequests/policy";
import { candidateContactBodyWithoutTransportFooter } from "@/lib/companyTalentRequests/presentation";
import { assertCandidateContactUploadLinks } from "@/lib/companyTalentRequests/copyRules";
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
  messages: Array<{ content: string; role: string }>,
  parentSignal?: AbortSignal
) {
  const deadline = AbortSignal.timeout(120_000);
  const signal = parentSignal ? AbortSignal.any([parentSignal, deadline]) : deadline;
  signal.throwIfAborted();
  const { response } = await createChatCompletionWithFallback({
    signal,
    anthropicOverloadFallbackModel: GPT_6_LUNA_MODEL,
    buildRequest: () => ({
      // Responses API output budgets include both reasoning and visible JSON.
      // Keep enough room for xhigh reasoning plus a complete subject/body.
      max_tokens: CANDIDATE_CONTACT_COPY_MAX_OUTPUT_TOKENS,
      messages,
      temperature: 0.2,
    }),
    debugLabel: "org/agent:candidate-contact-copy",
    fallbackModel: GPT_6_LUNA_MODEL,
    model: CLAUDE_MODEL,
    openAIResponses: { reasoningEffort: "xhigh" },
    structuredOutput: {
      name: "candidate_contact_copy",
      schema: CANDIDATE_CONTACT_COPY_SCHEMA,
    },
    validateResponse: (response) => {
      const parsed = parseJsonObject(assistantText(response));
      for (const key of ["subject", "body", "requestContext"]) {
        if (typeof parsed[key] !== "string" || !String(parsed[key]).trim())
          throw new Error(`Candidate contact ${key} is required`);
      }
    },
  });
  return parseJsonObject(assistantText(response));
}

function validateDraft(args: {
  body: unknown;
  deliveryIntent: "direct_reply" | "review_draft";
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
  const requestContext = validateCompanyContactContext(args.requestContext);
  const reason = compact(args.reason, 600) || null;
  if (!subject || !body || !requestContext) {
    throw new Error("Candidate contact copy is empty");
  }
  assertCandidateContactUploadLinks(body, args.profileUrl);
  return { body, reason, requestContext, subject };
}

export async function generateCandidateContactDraft(args: {
  candidateName: string;
  verifiedContext?: string;
  companyName: string;
  currentInstruction: string;
  deliveryIntent?: "direct_reply" | "review_draft";
  locale: string | null;
  profileUrl: string | null;
  recentConversation: string;
  requestContext: string;
  requestId: string;
  roleName: string;
  signal?: AbortSignal;
}) {
  const deliveryIntent = args.deliveryIntent ?? "review_draft";
  // Input may be an entire authorized message; the generated durable summary
  // still uses the existing 800-character contract validated below.
  const requestContext = args.requestContext.trim();
  if (!requestContext || requestContext.length > 5_000)
    throw new Error("Candidate contact input must contain 1–5000 characters");
  try {
    const parsed = await generateJson(
      buildCandidateContactDraftMessages({
        verifiedContext: args.verifiedContext,
        candidateName: args.candidateName,
        companyName: args.companyName,
        currentInstruction: args.currentInstruction,
        deliveryIntent: args.deliveryIntent,
        profileUrl: args.profileUrl,
        recentConversation: args.recentConversation,
        recipientLocale: args.locale,
        requestContext,
        roleName: args.roleName,
      }), args.signal
    );
    return validateDraft({
      body: parsed.body,
      deliveryIntent,
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
  locale: string | null;
  profileUrl: string | null;
  recentConversation: string;
  requestId: string;
  signal?: AbortSignal;
}) {
  try {
    const parsed = await generateJson(
      buildCandidateContactRevisionMessages({
        current: args.current,
        currentInstruction: args.currentInstruction,
        editInstruction: args.editInstruction,
        profileUrl: args.profileUrl,
        recentConversation: args.recentConversation,
        recipientLocale: args.locale,
      }), args.signal
    );
    return validateDraft({
      body: parsed.body,
      deliveryIntent: "review_draft",
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
