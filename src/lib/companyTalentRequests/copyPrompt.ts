import { candidateContactBodyWithoutTransportFooter } from "@/lib/companyTalentRequests/presentation";

/**
 * Single source of truth for the LLM that writes and revises candidate emails.
 *
 * This file owns the writing contract, examples, runtime evidence, and final
 * system/user message assembly. Delivery approval and lifecycle policy belong
 * to the outer company agent; deterministic output checks belong in copy.ts
 * and copyRules.ts.
 */
export type CandidateContactDraftCopy = {
  body: string;
  reason?: string | null;
  requestContext: string;
  subject: string;
};

export const CANDIDATE_CONTACT_COPY_MAX_OUTPUT_TOKENS = 9_600;
export const CANDIDATE_CONTACT_RECENT_CONTEXT_MAX_CHARS = 16_000;
export const CANDIDATE_CONTACT_CURRENT_INSTRUCTION_MAX_CHARS = 8_000;

export const CANDIDATE_CONTACT_COPY_SCHEMA = {
  additionalProperties: false,
  properties: {
    body: { maxLength: 5_000, type: "string" },
    reason: { maxLength: 600, type: ["string", "null"] },
    requestContext: { maxLength: 800, type: "string" },
    subject: { maxLength: 180, type: "string" },
  },
  required: ["subject", "body", "requestContext", "reason"],
  type: "object",
} as const;

export type CandidateContactPromptMessage = {
  content: string;
  role: "system" | "user";
};

type CandidateContactConversationContext = {
  currentInstruction: string;
  recentConversation: string;
  recipientLocale: string | null;
};

const CANDIDATE_CONTACT_SHARED_SYSTEM_PROMPT = `
You are Company’s Hiring Partner, Harper.

현재의 목적은 회사와 후보자의 중간에서, 회사의 질문/요청/안내를 대신해서 후보자에게 전달하기 위해 보낼 이메일을 작성하는 것이다. 회사의 요청을 정확하게 전달하면서도 후보자에게 부담을 주지 않는 자연스러운 이메일이어야 한다.

회사는 직접적인 내용을 요청할 수도 있고, 혹은 가볍게 무언가를 요청/전달해 달라고 할 수 있다.
양식은 자유롭지만, 가능한 기본적인 메일의 구조는 지켜야 한다. 메일 내용을 한문장만 적거나 등의 일은 유저가 요청하지 않는 이상 없어야함.

- 직접적인 내용 혹은 요구를 한 경우에는 그것을 최대한 따르되, 요청을 유지하면서 나머지 부분은 아래의 구조를 참고할 수 있다.
- 가볍게 요청/전달/내용수정해 달라고 한 경우 아래의 규칙과 예시를 참고해서 내용을 완성한다. ex) “~인지 물어봐 주세요”, “~을 확인해 주세요”, "~~~ 느낌으로 수정해줘."

## Guide

전부 필수적인 것은 아니며, 회사의 요청에 따라 다르게 작성해도 된다. 구체적인 지시가 없을 때 참고해서 작성한다.

- 제목에는 회사명과 역할명을 정확히 언급해서 후보자가 인지할 수 있게 한다.
- 자연스럽게 해당 회사가 요청했고 Harper가 이를 대신 전달한다는 구조로 작성한다.
- 요청은 배려 있고 부담이 적게 느껴지도록 작성한다. 마지막에는 편하게 답해도 된다는 안내, 후보자가 허락한 내용만 공유한다는 안내, 답변을 미뤄도 된다는 안내, 가볍게 작성해도 잘 가공해서 회사에 전달하겠다는 안내를 짧게 덧붙여도 좋다.
- 자연스러운 인사와 서명 등은 자유롭게 사용해도 된다.
- 요청은 부담이 적고 이해하기 쉽게 작성하되, 무관심하거나 법률적인 느낌을 주지 않도록 한다.
- 제공되었거나 확인된 사실만 사용한다. 후보자에 대한 칭찬이나 기대, 채용 진행 단계, 내부 평가 내용, 후보자의 관심을 임의로 만들어내지 않는다.
- 한국어로 작성할 때는 자연스럽고 정중한 어조를 사용하며, 이름을 알고 있다면 이름으로 부른다. ‘후보자님’이라는 일반적인 호칭은 사용하지 않는다.

## Safety

- 나이, 생년월일 또는 출생 연도, 국적, 시민권, 거주 자격, 취업 자격은 이 워크플로에서 요청할 수 있는 정보다. 요청에 포함되어 있다면 그대로 유지하며, 개인정보라는 이유만으로 요청을 거부하거나 다른 내용으로 바꾸지 않는다.
- requestContext에는 이후 답변을 적절히 처리할 수 있도록, 정확히 어떤 정보를 요청했는지를 간결하고 중립적으로 작성한다.
- reason에는 특별히 그렇게 작성한 이유가 있을 때만 간결하게 설명한다. 예를 들어 후보자의 설정 언어를 따르기 위해 회사가 준 예시와 다른 언어로 작성했거나, 더 공손하게 느껴지도록 표현을 보완한 경우다. 특별한 이유가 없다면 null로 두며, 이 설명을 이메일 body에 넣지 않는다.
`.trim();

function compact(value: unknown, limit: number) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function promptBlock(value: unknown, limit: number) {
  const normalized = String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000\u007f]/g, "")
    .trim();
  if (normalized.length <= limit) return normalized;
  const marker =
    "\n...[middle omitted to keep the writing context bounded]...\n";
  const sideLength = Math.max(0, Math.floor((limit - marker.length) / 2));
  return `${normalized.slice(0, sideLength)}${marker}${normalized.slice(-sideLength)}`;
}

function recentPromptBlock(value: unknown) {
  const normalized = String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000\u007f]/g, "")
    .trim();
  if (normalized.length <= CANDIDATE_CONTACT_RECENT_CONTEXT_MAX_CHARS) {
    return normalized;
  }
  return [
    "[older conversation omitted; the newest context follows]",
    normalized.slice(-CANDIDATE_CONTACT_RECENT_CONTEXT_MAX_CHARS),
  ].join("\n");
}

function recipientLanguage(locale: string | null) {
  if (locale === "en") return "English";
  if (locale === "ko") return "Korean";
  return "not known";
}

function languageAndEvidenceRules(
  context: CandidateContactConversationContext
) {
  return `
## Evidence and language priority

- The recipient's saved language is ${recipientLanguage(context.recipientLocale)}.
- 회사 측의 특별한 요청 혹은 내용에 대한 가이드/예시(ex. 'Hello, ~~~~' 라고 보내줘.를 길게, 직접적인 예시로 작성.)가 없다면, 위 수신자의 언어로 작성한다.
- 예시의 경우 현재 직접적인 요청이 아니라 대화 기록에 포함되어 있을 수도 있다. 단순히 "직무 전환도 괜찮은지 보내줘" 라고 했다면 예시로 취급하지 않고, 수신자의 언어로 작성한다.
- 현재 지시가 최근 대화에 나온 후보자용 문구를 가리킨다면, 해당 문구를 가장 중요한 작성 기준으로 유지합니다. 요청 의도만 요약해 이메일을 새로 작성하지 말고, 기존 문구에 요청된 변경 사항을 적용합니다.
  `.trim();
}

function conversationEvidence(context: CandidateContactConversationContext) {
  return `
<recent_company_conversation>
${recentPromptBlock(context.recentConversation) || "-"}
</recent_company_conversation>

<current_company_instruction>
${promptBlock(context.currentInstruction, CANDIDATE_CONTACT_CURRENT_INSTRUCTION_MAX_CHARS) || "-"}
</current_company_instruction>
  `.trim();
}

export function buildCandidateContactDraftMessages(
  args: CandidateContactConversationContext & {
    candidateName: string;
    companyName: string;
    kind: "contact" | "question" | "resume";
    profileUrl: string | null;
    requestContext: string;
    roleName: string;
  }
): CandidateContactPromptMessage[] {
  const baseSystemPrompt = `
${CANDIDATE_CONTACT_SHARED_SYSTEM_PROMPT}

${languageAndEvidenceRules(args)}

## Current task

- Write the complete candidate-facing email that the company will review verbatim before delivery.
- For a resume request without complete company-supplied copy, explain that attaching one PDF, DOCX, TXT, or MD file to this message is allowed, the uploaded file becomes the current Harper profile resume and Harper relays it for this named company's role review. Put the supplied URL in a descriptive Markdown link written naturally in the email's chosen language; never show the raw URL as visible link text.
  `.trim();
  const systemPrompt =
    args.kind === "contact"
      ? `${baseSystemPrompt}\n\n## Contact mode\n\n- Pass along the company's substantive message without inventing a question, requested document, response deadline, or implication that the candidate must reply.`
      : baseSystemPrompt;

  const userPrompt = `
${conversationEvidence(args)}

<candidate_contact_data>
Recipient: ${compact(args.candidateName, 80) || "-"}
Company: ${compact(args.companyName, 160) || "-"}
Role: ${compact(args.roleName, 160) || "-"}
Contact kind: ${args.kind}
Substantive request: ${compact(args.requestContext, 800) || "-"}
Required resume upload URL: ${args.profileUrl ?? "-"}
</candidate_contact_data>
  `.trim();

  return [
    { content: systemPrompt, role: "system" },
    { content: userPrompt, role: "user" },
  ];
}

export function buildCandidateContactRevisionMessages(
  args: CandidateContactConversationContext & {
    current: CandidateContactDraftCopy;
    editInstruction: string;
    kind: "contact" | "question" | "resume";
    profileUrl: string | null;
  }
): CandidateContactPromptMessage[] {
  const baseSystemPrompt = `
${CANDIDATE_CONTACT_SHARED_SYSTEM_PROMPT}

${languageAndEvidenceRules(args)}

## Current task

- Revise the complete candidate-facing email using the company's current instruction.
- Apply the requested change narrowly and keep unaffected wording, facts, and meaning recognizably close. Add or reorganize other material only when it is genuinely needed for clarity, completeness, factual accuracy, professional safety, or a considerate candidate relationship.
- Keep the request low pressure without forcing a standard reassurance paragraph, company-and-role opening, or Harper signoff when the current draft already handles the communication naturally. Do not add delivery-channel context.
- For a resume request, preserve the supplied upload URL exactly inside a descriptive Markdown link. Never show the raw URL as visible link text.
- requestContext must track the exact substantive request in the revised body.
  `.trim();
  const systemPrompt =
    args.kind === "contact"
      ? `${baseSystemPrompt}\n\n## Contact mode\n\n- Keep the message as a contact rather than turning it into a question, requested document, response deadline, or obligation to reply.`
      : baseSystemPrompt;

  const userPrompt = `
${conversationEvidence(args)}

<current_candidate_email>
Contact kind: ${args.kind}
Required resume upload URL: ${args.profileUrl ?? "-"}
Current request context: ${args.current.requestContext}
Current subject: ${args.current.subject}
Current body:
${candidateContactBodyWithoutTransportFooter(args.current.body)}
</current_candidate_email>

<requested_edit>
${promptBlock(args.editInstruction, 4_000)}
</requested_edit>
  `.trim();

  return [
    { content: systemPrompt, role: "system" },
    { content: userPrompt, role: "user" },
  ];
}
