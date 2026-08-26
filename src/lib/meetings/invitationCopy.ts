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
    locale: string | null;
    organizerName: string;
    roleName: string;
    signal?: AbortSignal;
  },
  options: { model?: string } = {}
) {
  const locale = normalizeLocale(args.locale);
  const fallback = buildMeetingInvitationFallback({ ...args, locale });
  const subject = clean(
    buildMeetingInvitationSubject({ ...args, locale }),
    180
  ).replace(/[\r\n]+/g, " ");
  const input = JSON.stringify(
    {
      candidate: clean(args.candidateName, 80),
      candidateNote: clean(args.candidateMessage, 2_000) || null,
      company: clean(args.companyName, 160),
      durationMinutes: args.durationMinutes,
      linkMarker: MEETING_INVITATION_LINK_MARKER,
      organizer: clean(args.organizerName, 80),
      priorContext:
        "The candidate previously confirmed that they would like to connect regarding this exact company and role.",
      requestedLanguage: locale === "ko" ? "Korean" : "English",
      role: clean(args.roleName, 160),
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
              "You are Harper's recruiting coordinator writing a personal scheduling email after a candidate and company have already expressed mutual interest.",
              "The email should feel like a thoughtful handoff into a first conversation, not a notification or a summary of meeting settings.",
              "Write the body in this narrative order:",
              "1. Greet the candidate naturally, using the supplied candidate name exactly at least once. Do not shorten a Korean full name to a guessed given name.",
              "2. Reconnect to the supplied priorContext, company, and role, then share the positive next step that the supplied organizer would also like to meet them. The natural Korean meaning is close to '앞서 [company]의 [role] 역할에 대해 연결 의사를 전해주셨는데, [organizer]님도 직접 이야기 나누고 싶어 하세요.' Adapt it to the sentence rhythm rather than copying it mechanically. If using '좋은 소식이 있어요', make it a clean standalone sentence at the start of this paragraph.",
              "3. Explain that the first conversation is remote over Google Meet, give the duration, and ask the candidate to select two or three suitable times. Call these 시간, 시간대, or 선택지—not 후보.",
              "4. If candidateNote exists, rewrite shorthand into one concise candidate-facing sentence without changing or amplifying its meaning, and place it here. For example, '최대한 빠른 시간으로 잡아주기를 요청함' should become no stronger than '가능하면 가장 빠른 시간으로 부탁드린다고 합니다.' Do not add a reason or a second instruction.",
              `5. Put ${MEETING_INVITATION_LINK_MARKER} alone in its own paragraph exactly once.`,
              "6. Explain that one submitted option will be confirmed automatically and that the Google Meet link and calendar invitation will follow.",
              "7. Close with a brief, warm wish for a good conversation, then thank the candidate and sign as Harper.",
              "Use the requested language and short connected paragraphs. In Korean, prefer 역할 over 포지션, describe the prior step as the candidate having shared their intent to connect, and attach 님 to the supplied organizer's name. Say that the organizer wants to 이야기 나누다 or 만나고 싶어 하다; do not use the self-humbling phrase 만나 뵙고 싶어 하다 on the organizer's behalf. Write with the restrained warmth of a considerate recruiter. Do not invent the organizer's title, relationship to the role, deadlines, interview stages, travel, or personal history.",
              "Return JSON only with body and candidateMessage. candidateMessage is the exact final localized note paragraph included in body, or null when candidateNote is null.",
            ].join("\n"),
          },
          { role: "user", content: `Scheduling facts:\n${input}` },
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
