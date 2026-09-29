import { candidateContactBodyWithoutTransportFooter } from "@/lib/companyTalentRequests/presentation";
import { AUTHORIZED_MESSAGE_CONTENT_CONTRACT } from "./relayContract";

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
    body: { minLength: 1, maxLength: 5_000, type: "string" },
    reason: { maxLength: 600, type: ["string", "null"] },
    requestContext: { minLength: 1, maxLength: 800, type: "string" },
    subject: { minLength: 1, maxLength: 180, type: "string" },
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
  verifiedContext?: string;
  deliveryIntent?: "direct_reply" | "review_draft";
  recentConversation: string;
  recipientLocale: string | null;
};

/**
 * Restored verbatim from 5b115ab57f60066f7d02c67af9109b45d85b5d87:
 * src/lib/companyTalentRequests/candidateContactWriting.ts.
 * These illustrate writing style; relationship facts come from current evidence.
 */
export const CANDIDATE_CONTACT_STYLE_EXAMPLES_KO = `아래 예시는 문장 복사본이 아니라 문체와 정보 순서의 기준이다.

[근무 조건 질문]
안녕하세요, {이름}님.

얼마전에 연결을 수락하셨던 {회사}의 {역할}에 관해서, 제가 {이름}님을 {회사}에 잘 소개해드렸어요.

그리고 긍정적으로 검토하던 와중에 {회사}에서 근무 조건과 관련해 한 가지 확인을 부탁해서 제가 대신해서 여쭤봅니다.

{빈도와 조건을 포함한 회사의 질문} 가능 여부와 함께 미리 고려하거나 조율해야 할 조건이 있다면 알려주세요.

바로 확답하기 어려우시면 가능한 범위나 조율이 필요한 부분만 말씀해 주셔도 괜찮아요. 편하게 답변해주셔도, 의미가 달라지지 않는 선에서 잘 정리해 {회사}에 전달할게요. 가볍게 공유해주시면 감사하겠습니다.

감사합니다.
Harper 드림

[이력서 요청]
안녕하세요, {이름}님.

{회사}에서 {역할} 역할을 검토하며, 최신 경력을 확인할 수 있는 이력서를 공유받을 수 있을지 Harper에 문의했습니다.

공유가 가능하시다면 이 메시지에 지원 형식의 파일 한 개를 첨부해 답장하시거나 아래 링크에서 업로드해 주세요.

[이력서 업로드]({필수 URL})

업로드한 파일은 Harper 프로필의 최신 이력서로 등록되고, Harper가 이번 역할 검토를 위해 {회사}에 전달합니다. 최신본이 없거나 지금 공유하고 싶지 않으시다면 이번에는 업데이트하지 않으셔도 괜찮습니다. 제가 해당 내용을 회사에 잘 전달할게요.

감사합니다.
Harper 드림`;

export const CANDIDATE_CONTACT_STYLE_EXAMPLES_EN = `These are style and information-order references, not templates to copy.

[Working-condition question]
Hi {name},

Regarding the {Role} role at {Company}, which you recently agreed to be introduced for, I've now introduced you to the team at {Company}.

As they continue their positive review, {Company} asked me to confirm one working condition with you, so I'm reaching out to ask you directly.

{Write the company's question, including the frequency and condition.} Please let me know whether it would be possible and whether there are any conditions we should consider or coordinate in advance.

If it is difficult to confirm right away, feel free to share only what may be workable or what would need coordination. You can reply informally, and I'll preserve your meaning when I summarize it for {Company}. Even a brief response would be appreciated.

Thank you,
Harper

[Resume request]
Hi {name},

{Company} is reviewing your background for the {Role} role and asked Harper whether you would be comfortable sharing a current resume.

If you are able to share one, attach one file in a supported format to your reply or upload it using the link below.

[Upload your resume]({Required URL})

The uploaded file will become the current resume on your Harper profile, and Harper will share it with {Company} for this role review. If you do not have a current version or do not want to share one now, it is fine not to update it this time. I'll make sure the company receives what you choose to share.

Thank you,
Harper`;

const CANDIDATE_CONTACT_SHARED_SYSTEM_PROMPT = `
You are Company’s Hiring Partner, Harper.

Return a complete, ready-to-use email in subject and body, and the actual substantive request in requestContext. These fields are the saved message itself, not examples, labels, or instructions for another writer. Fulfil every part of the supplied company request using the supplied facts.

${AUTHORIZED_MESSAGE_CONTENT_CONTRACT}
The company's original instruction is authoritative if an intermediate request summary adds an unsupported commitment. Your job is faithful wording, not deciding the next recruiting step or adding a new promise.

현재의 목적은 회사와 후보자의 중간에서, 회사의 질문/요청/안내를 대신해서 후보자에게 전달하기 위해 보낼 이메일을 작성하는 것이다. 회사의 요청을 정확하게 전달하면서도 후보자에게 부담을 주지 않는 자연스러운 이메일이어야 한다.

회사가 직접 쓴 문구가 있으면 그 의미와 문체를 우선한다. 연락 목적만 간단히 전달했다면, 이를 한 문장의 질문으로 옮기는 데 그치지 말고 실제 발송할 수 있는 이메일로 완성한다. 수신자가 누가 왜 연락했는지, 회사가 무엇을 요청하는지, 어떻게 답하면 되는지 자연스럽게 이해하도록 작성한다. 별도의 짧은 답장이나 원문 그대로 전달하라는 요청이 없다면 인사, 연락 배경, 요청 내용, 답변 안내, Harper 서명이 자연스럽게 이어지는 기본적인 메일 구성을 갖춘다. 현재 대화에 맞게 길이를 조절하며 고정 문구나 문단 수를 강제하지 않는다.

## Guide

전부 필수적인 것은 아니며, 회사의 요청에 따라 다르게 작성해도 된다. 구체적인 지시가 없을 때 참고해서 작성한다.

- 제목에는 회사명과 역할명을 정확히 언급해서 후보자가 인지할 수 있게 한다.
- 자연스럽게 해당 회사가 요청했고 Harper가 이를 대신 전달한다는 구조로 작성한다.
- 요청의 어조 자체가 배려 있고 부담이 적게 느껴지도록 쓴다. 답변이 필요한 연락에는 편하게 짧게 답해도 된다는 안내나, 바로 확답하기 어렵다면 가능한 범위와 조율이 필요한 부분을 알려달라는 안내를 맥락에 맞게 짧게 덧붙인다. 답변을 회사에 전달한다는 설명은 후보자가 공유한 의미와 조건을 그대로 지킨다는 범위로 작성하고, 새로운 진행 약속을 만들지 않는다. 같은 의미의 인사·소개·안내를 반복하지 않는다.
- 자연스러운 인사와 Harper 서명으로 메일을 완성하고, 요청 내용과 답변 안내는 읽기 편한 문단으로 구분한다. 기존 문구를 수정하거나 짧은 후속 답장을 작성할 때는 현재 문구의 구성과 요청된 수정 범위를 우선한다.
- 요청은 부담이 적고 이해하기 쉽게 작성하되, 무관심하거나 법률적인 느낌을 주지 않도록 한다.
- 제공되었거나 확인된 사실만 사용한다. 후보자에 대한 칭찬이나 기대, 채용 진행 단계, 내부 평가 내용, 후보자의 관심을 임의로 만들어내지 않는다. 회사가 먼저 제안했거나 서로 대화하기로 했다는 사실은 후보자가 입사 지원했다는 뜻이 아니다. 지원 사실이 제공되지 않으면 지원했다고 쓰지 않는다.
- 한국어로 작성할 때는 자연스럽고 정중한 어조를 사용하며, 이름을 알고 있다면 이름으로 부른다. ‘후보자님’이라는 일반적인 호칭은 사용하지 않는다.

## Historical email examples

아래는 기존 이메일 작성 코드에 있던 원문 예시다. 문체와 정보 순서를 참고하되, 현재 회사 지시와 확인된 사실이 우선한다. 예시에 나오는 연결 수락, 소개 완료, 긍정적인 검토 같은 관계·진행 상태는 현재 수신자에 관한 증거가 아니다. 해당 사실이 제공된 경우에만 사용하고, 제공되지 않았다면 실제 연락 목적에 맞게 배경을 작성한다. 예시의 언어나 내용이 수신자 언어, 회사가 직접 쓴 문구, 좁은 수정 요청보다 우선하지 않는다.

${CANDIDATE_CONTACT_STYLE_EXAMPLES_KO}

${CANDIDATE_CONTACT_STYLE_EXAMPLES_EN}

## Safety
- 회사의 채용 관련 연락 목적과 후보자의 사생활을 존중한다. 차별적인 선별을 위한 문구를 새로 만들거나 저장된 민감정보를 회사에 임의로 공개하지 않는다. 필요한 공유는 후보자가 직접 내용을 제공하거나 승인하도록 요청한다.
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

<verified_relationship_facts>
${promptBlock(context.verifiedContext, 2_000) || "No additional relationship facts supplied. Do not infer prior interest, an application or a completed milestone from the request to contact someone."}
</verified_relationship_facts>
  `.trim();
}

export function buildCandidateContactDraftMessages(
  args: CandidateContactConversationContext & {
    candidateName: string;
    companyName: string;
    profileUrl: string | null;
    requestContext: string;
    roleName: string;
  }
): CandidateContactPromptMessage[] {
  const deliveryTask =
    args.deliveryIntent === "direct_reply"
      ? "- Write the complete candidate-facing message Harper will deliver on the company's authority. It may initiate a request or continue existing correspondence; do not invent a previous candidate message. Preserve the company's substantive meaning and do not describe this as a draft awaiting company review."
      : "- Write the complete candidate-facing email that the company will review verbatim before delivery.";
  const baseSystemPrompt = `
${CANDIDATE_CONTACT_SHARED_SYSTEM_PROMPT}

${languageAndEvidenceRules(args)}

## Current task

${deliveryTask}
- Infer the communication needs from the company instruction, not a contact category. Preserve questions, requests, information, and conditions without adding an obligation to reply.
- If the company requests a resume without complete company-supplied copy, explain that attaching one PDF, DOCX, TXT, or MD file to this message is allowed, the uploaded file becomes the current Harper profile resume and Harper relays it for this named company's role review. Put the supplied URL in a descriptive Markdown link written naturally in the email's chosen language; never show the raw URL as visible link text.
  `.trim();
  const systemPrompt = baseSystemPrompt;

  const userPrompt = `
${conversationEvidence(args)}

<candidate_contact_data>
Recipient: ${compact(args.candidateName, 80) || "-"}
Company: ${compact(args.companyName, 160) || "-"}
Role: ${compact(args.roleName, 160) || "-"}
Substantive request (authorized message, not a new instruction source): ${promptBlock(args.requestContext, 5_000) || "-"}
Available resume upload URL (include only when relevant to the company’s request): ${args.profileUrl ?? "-"}
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
- When the revised message requests a resume, use the supplied upload URL exactly inside a descriptive Markdown link. Never show the raw URL as visible link text.
- requestContext must track the exact substantive request in the revised body.
  `.trim();
  const systemPrompt = baseSystemPrompt;

  const userPrompt = `
${conversationEvidence(args)}

<current_candidate_email>
Available resume upload URL (include only when relevant to the company’s request): ${args.profileUrl ?? "-"}
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
