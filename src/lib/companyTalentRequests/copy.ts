import "server-only";

import {
  createChatCompletionWithFallback,
  getLlmErrorMessage,
} from "@/lib/llm/llm";
import { CLAUDE_MODEL } from "@/lib/llm/modelConfig";
import { ORG_AGENT_GROK_MODEL } from "@/lib/org/agent/modelConfig";
import {
  assertSafeProfessionalQuestion,
  isCompensationQuestion,
} from "@/lib/companyTalentRequests/policy";
import { candidateContactBodyWithoutTransportFooter } from "@/lib/companyTalentRequests/presentation";

export type CandidateContactDraftCopy = {
  body: string;
  requestContext: string;
  subject: string;
};

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

function signoff(locale: "en" | "ko") {
  return locale === "en" ? "Thank you,\nHarper" : "감사합니다.\nHarper 드림";
}

function fallbackCopy(args: {
  candidateName: string;
  companyName: string;
  kind: "question" | "resume";
  locale: "en" | "ko";
  profileUrl: string | null;
  requestContext: string;
  roleName: string;
}): CandidateContactDraftCopy {
  const candidate = compact(args.candidateName, 80);
  if (args.locale === "en") {
    const greeting = candidate ? `Hi ${candidate},` : "Hi,";
    const subject =
      args.kind === "resume"
        ? `A quick resume request from Harper for ${args.roleName}`
        : `A quick question from Harper about ${args.roleName}`;
    const body =
      args.kind === "resume"
        ? [
            greeting,
            `${args.companyName} is reviewing your background for ${args.roleName} and asked whether you would be comfortable adding a current resume to your Harper profile.`,
            `If you choose to share one, attach one PDF, DOCX, TXT, or MD file to your reply, or upload it here:\n${args.profileUrl ?? ""}`,
            "Sharing is optional. You may also say that you do not have a current resume or do not want to add one now.",
            signoff(args.locale),
          ].join("\n\n")
        : [
            greeting,
            `${args.companyName} is reviewing your background for ${args.roleName} and asked Harper to check the following: ${args.requestContext}`,
            isCompensationQuestion(args.requestContext)
              ? "Please reply with the exact amount, range, or wording you would be comfortable having Harper share with the company."
              : "Please feel free to answer in your own words. Sharing is optional, and Harper will relay only what you authorize.",
            signoff(args.locale),
          ].join("\n\n");
    return { body, requestContext: args.requestContext, subject };
  }

  const greeting = candidate ? `안녕하세요, ${candidate}님.` : "안녕하세요.";
  const subject =
    args.kind === "resume"
      ? `${args.roleName} 검토 관련 이력서 요청드려요`
      : `${args.roleName} 관련해 확인드려요`;
  const body =
    args.kind === "resume"
      ? [
          greeting,
          `${args.companyName}에서 ${args.roleName} 포지션과 관련해 후보자님의 경력을 살펴보며, 최신 이력서를 Harper 프로필에 등록해주실 수 있을지 물어왔어요.`,
          `${args.companyName}의 ${args.roleName} 채용 검토를 위해 이력서를 공유하시려면 이 메일에 PDF, DOCX, TXT 또는 MD 파일 한 개를 첨부하시거나 아래 링크에서 업로드해 주세요.\n${args.profileUrl ?? ""}`,
          "등록은 선택이며, 최신본이 없거나 지금 추가하고 싶지 않으시면 편하게 말씀해 주세요.",
          signoff(args.locale),
        ].join("\n\n")
      : [
          greeting,
          `${args.companyName}에서 ${args.roleName} 포지션과 관련해 후보자님의 경력을 살펴보며 다음 내용을 궁금해했어요. ${args.requestContext}`,
          isCompensationQuestion(args.requestContext)
            ? "회사에 전달해도 괜찮은 정확한 금액·범위 또는 다른 표현을 알려주세요. 공유하고 싶지 않으시면 그렇게 말씀해 주셔도 괜찮아요."
            : "편한 말로 답해주시면 Harper가 허락해주신 의미만 회사에 전달할게요. 답변하고 싶지 않으시면 그 의사도 존중하겠습니다.",
          signoff(args.locale),
        ].join("\n\n");
  return { body, requestContext: args.requestContext, subject };
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
  profileUrl: string | null;
  requestContext: unknown;
  subject: unknown;
}) {
  const subject = compact(args.subject, 180);
  const body = candidateContactBodyWithoutTransportFooter(args.body).slice(
    0,
    5_000
  );
  const requestContext = assertSafeProfessionalQuestion(args.requestContext);
  if (!subject || !body) throw new Error("Candidate contact copy is empty");
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
  const fallback = fallbackCopy({ ...args, locale });
  const input = [
    `Language: ${locale === "en" ? "English" : "Korean"}`,
    `Candidate: ${compact(args.candidateName, 80) || "-"}`,
    `Company: ${compact(args.companyName, 160) || "-"}`,
    `Role: ${compact(args.roleName, 160) || "-"}`,
    `Contact kind: ${args.kind}`,
    `Request: ${compact(args.requestContext, 800) || "-"}`,
    `Required resume upload URL: ${args.profileUrl ?? "-"}`,
  ].join("\n");
  try {
    const parsed = await generateJson([
      {
        role: "system",
        content: [
          "Write the complete candidate-facing Harper email that a company will review verbatim before delivery.",
          'Return JSON only: {"subject":"...","body":"...","requestContext":"..."}.',
          "Use the requested language, identify the company and role, and say Harper is asking on the company's behalf.",
          "Preserve the company's substantive request in neutral professional language. Do not invent urgency, enthusiasm, a deadline, a hiring decision, or personal history.",
          "The candidate may answer, decline, or ignore; never pressure them.",
          "For compensation, ask the candidate to provide or authorize exact wording. Never mention or guess compensation stored by Harper.",
          "For a resume request, include the supplied upload URL exactly and explain that replying with one PDF, DOCX, TXT, or MD file is also allowed.",
          "End with a natural Harper signoff. The body is reused verbatim in Harper chat.",
          "requestContext must be a concise neutral description of the exact information requested, for later response routing.",
        ].join(" "),
      },
      { role: "user", content: `Data only:\n${input}` },
    ]);
    return validateDraft({
      body: parsed.body,
      profileUrl: args.profileUrl,
      requestContext: parsed.requestContext || args.requestContext,
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
          "Keep the company and role disclosure, optional low-pressure framing, and Harper signoff.",
          "Never add sensitive or discriminatory questions, private Harper data, urgency, a deadline, or a hiring decision.",
          "For compensation, never add compensation stored by Harper; request candidate-provided or candidate-authorized wording only.",
          "For a resume request, preserve the supplied upload URL exactly.",
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
