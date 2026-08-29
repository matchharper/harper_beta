import "server-only";

import {
  createChatCompletionWithFallback,
  getLlmErrorMessage,
  supportsResponseFormatForModel,
  usesMaxCompletionTokensForModel,
} from "@/lib/llm/llm";
import { GPT_56_LUNA_MODEL, GPT_56_TERRA_MODEL } from "@/lib/llm/modelConfig";
import {
  buildMeetingInvitationFallback,
  buildMeetingInvitationSubject,
  MEETING_INVITATION_LINK_MARKER,
  type MeetingInvitationEmailDraft,
} from "@/lib/meetings/invitation";

function clean(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, maxLength);
}

function normalizeLocale(value: unknown): "en" | "ko" {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .startsWith("ko")
    ? "ko"
    : "en";
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
  const parsed = JSON.parse(
    value
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
  ) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Meeting invitation copy must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function normalizeKoreanHonorific(value: string, rawName: string) {
  const name = clean(rawName, 160);
  if (!name || name.endsWith("님")) return value;
  let next = value.replaceAll(`${name} 님`, `${name}님`);
  for (const particle of [
    "은",
    "는",
    "이",
    "가",
    "을",
    "를",
    "에게",
    "와",
    "과",
    "도",
    "께서",
  ]) {
    next = next.replaceAll(`${name}${particle}`, `${name}님${particle}`);
  }
  return next;
}

function validateCopy(
  value: Record<string, unknown>,
  candidateName: string,
  locale: "en" | "ko",
  organizerName: string,
  subject: string,
  sourceCandidateMessage: string | null
): MeetingInvitationEmailDraft {
  let body = clean(value.body, 5_000);
  if (locale === "ko") {
    body = normalizeKoreanHonorific(body, candidateName);
    body = normalizeKoreanHonorific(body, organizerName);
  }
  if (!body || body.split(MEETING_INVITATION_LINK_MARKER).length !== 2) {
    throw new Error("Meeting invitation copy is incomplete");
  }
  let candidateMessage = sourceCandidateMessage
    ? clean(value.candidateMessage, 2_000)
    : null;
  if (candidateMessage && locale === "ko") {
    candidateMessage = normalizeKoreanHonorific(
      candidateMessage,
      candidateName
    );
    candidateMessage = normalizeKoreanHonorific(
      candidateMessage,
      organizerName
    );
  }
  if (sourceCandidateMessage && !candidateMessage) {
    throw new Error("Meeting invitation dropped the candidate-visible note");
  }
  if (candidateMessage && !body.includes(candidateMessage)) {
    throw new Error(
      "Meeting invitation body dropped the candidate-visible note"
    );
  }
  return { body, candidateMessage, locale, subject };
}

export async function generateMeetingInvitationEmail(
  args: {
    candidateMessage: string | null;
    candidateName: string;
    companyName: string;
    durationMinutes: number;
    invitationKind?: "first_company_conversation" | "process_stage";
    locale: string | null;
    meetingPurpose?: string;
    organizerName: string;
    processStageName?: string | null;
    roleName: string;
    signal?: AbortSignal;
  },
  options: { model?: string } = {}
) {
  const locale = normalizeLocale(args.locale);
  const invitationKind =
    args.invitationKind === "process_stage"
      ? "process_stage"
      : "first_company_conversation";
  const fallback = buildMeetingInvitationFallback({ ...args, locale });
  const subject = clean(
    buildMeetingInvitationSubject({ ...args, locale }),
    180
  ).replace(/[\r\n]+/g, " ");
  const relationshipContext =
    invitationKind === "first_company_conversation"
      ? {
          meaning:
            "The candidate previously said they wanted to connect about this exact company and role. The organizer reviewed the information Harper shared and now wants to meet the candidate.",
          moment:
            "the first company-candidate conversation after mutual interest",
        }
      : {
          meaning:
            "The candidate is already in the company's hiring process. The company now wants to arrange the named next conversation.",
          moment:
            "a later conversation in an ongoing company-candidate process",
        };
  const input = JSON.stringify(
    {
      audience: {
        language: locale === "ko" ? "Korean" : "English",
        recipientName: clean(args.candidateName, 80),
      },
      meeting: {
        durationMinutes: args.durationMinutes,
        purpose:
          clean(args.meetingPurpose, 600) ||
          "a first conversation about mutual expectations and experience",
        stageName: clean(args.processStageName, 80) || "the next conversation",
      },
      optionalCandidateContext: clean(args.candidateMessage, 2_000) || null,
      relationship: {
        companyName: clean(args.companyName, 160),
        context: relationshipContext,
        organizerName: clean(args.organizerName, 80),
        roleName: clean(args.roleName, 160),
      },
      requiredLinkMarker: MEETING_INVITATION_LINK_MARKER,
    },
    null,
    2
  );

  try {
    const model = options.model?.trim() || GPT_56_LUNA_MODEL;
    const { response } = await createChatCompletionWithFallback({
      buildRequest: (model) => ({
        ...(usesMaxCompletionTokensForModel(model)
          ? { max_completion_tokens: 1_500 }
          : { max_tokens: 1_500 }),
        messages: [
          {
            role: "system",
            content: [
              "Role: Write as Harper, a considerate recruiting coordinator who protects the relationship and momentum between a candidate and a company.",
              "Goal: Help the recipient understand why this meeting is being proposed now, what kind of conversation the company hopes to have, and how to choose a convenient time without making the email feel like a workflow notice.",
              "Evidence: Use only the supplied relationship, meeting, audience, and optional candidate context. The relationship context already describes whether this is a first conversation or a later process step; preserve that meaning instead of importing language from another moment in the hiring process.",
              "Successful body: It greets the recipient naturally; connects the request to the current relationship moment, company, role, and organizer; explains the purpose and duration in candidate-friendly language; weaves optional candidate context into that explanation as one coherent passage; asks for two or three convenient options; places the required link marker alone in one paragraph; explains that a submitted option will be confirmed before the Calendar invitation and Google Meet link follow; and ends like an ongoing one-to-one recruiting correspondence, with concise encouragement grounded in this opportunity and Harper's signature.",
              "Voice: Personal, calm, and genuinely helpful. In Korean, keep full names intact, use 역할 for the role, add 님 naturally to people, describe the organizer as wanting to 이야기 나누다 or 만나고 싶어 하다, and sign off with Harper 드림. Choose connected paragraphs and wording appropriate to the supplied situation.",
              `Required output: Return JSON only with body and candidateMessage. The body must contain ${MEETING_INVITATION_LINK_MARKER} exactly once. candidateMessage is the exact localized paragraph used for optionalCandidateContext, or null when no such context was supplied.`,
            ].join("\n"),
          },
          { role: "user", content: `Email context:\n${input}` },
        ],
        ...(supportsResponseFormatForModel(model) && {
          response_format: { type: "json_object" },
        }),
      }),
      debugLabel: "meetings:invitation-copy",
      fallbackModel: GPT_56_TERRA_MODEL,
      model,
      openAIResponses: { reasoningEffort: "medium" },
      signal: args.signal,
    });
    const generated = validateCopy(
      parseJsonObject(assistantText(response)),
      args.candidateName,
      locale,
      args.organizerName,
      subject,
      args.candidateMessage
    );
    return generated;
  } catch (error) {
    console.warn("[meetings:invitation-copy:fallback]", {
      error: getLlmErrorMessage(error),
    });
    return fallback;
  }
}
