import { assertCandidateContactUploadLinks } from "./copyRules";

/** An addressable transport slot, not an instruction to another writer. */
export const CONTACT_RESUME_UPLOAD_SLOT = "{{resume_upload_url}}";
export const DIRECT_CONTACT_MESSAGE_CONTRACT = `
For send, messageContent is the complete final candidate-facing body, delivered verbatim without another writing model. 
Write in the recipient's known preferred language (read_talent returns it), otherwise use the conversation's language. 
Include only the company-authorized meaning, not internal handling instructions. 
후보자의 입장도 배려하며 필요한 도움을 주는 채용 파트너처럼 이메일을 작성한다. 핵심 전달 내용을 본문 중심에 두고, 앞뒤에 가벼운 인사와 맥락에 맞는 답변 안내, 감사와 Harper 서명을 자연스럽게 더해도 좋다. 예를 들어 “조율이 필요한 부분이나 궁금한 점이 있으면 편하게 말씀해 주세요”, “감사합니다. Harper 드림” 같은 표현을 사용할 수 있다. 
이런 인사와 배려 표현은 내용을 바꾸지 않는 범위에서 자유롭게 작성하되, 회사의 내용을 그대로 전달하는걸 최우선한다. 후속 연락이나 시점에 대한 안내를 임의로 추가하지는 말아야함.(ex. 바로 답장드릴게요. 등)
Provide messageSubject (1–180 characters) and requestContext (1–800 character internal topic summary). 
When a resume request needs an upload link, use [descriptive label](${CONTACT_RESUME_UPLOAD_SLOT}); the server binds that exact slot to a signed URL. 
Explain that the upload becomes the current Harper profile resume and is relayed for this named company's Role review. 
Attaching one PDF, DOCX, TXT or MD is also possible. Do not add upload instructions to unrelated messages. The upload slot is unavailable for relayId replies.`;

function required(value: unknown, name: string, max: number) {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new Error(
      `${name} must be a non-empty string of at most ${max} characters`
    );
  }
  return value;
}

/** Only machine-contract validation and signed URL binding. Never rewrite prose. */
export function prepareDirectCandidateMessage(
  input: {
    messageContent?: unknown;
    messageSubject?: unknown;
    requestContext?: unknown;
  },
  profileUrl: string | null
) {
  const template = required(input.messageContent, "messageContent", 5_000);
  const subject = required(input.messageSubject, "messageSubject", 180);
  if (/[\r\n]/.test(subject))
    throw new Error("messageSubject must be a single line");
  const requestContext = required(input.requestContext, "requestContext", 800);
  if (template.includes(CONTACT_RESUME_UPLOAD_SLOT) && !profileUrl) {
    throw new Error("Resume upload URL is unavailable for this target form");
  }
  const body = profileUrl
    ? template.replaceAll(CONTACT_RESUME_UPLOAD_SLOT, profileUrl)
    : template;
  assertCandidateContactUploadLinks(body, profileUrl);
  return { body, subject, requestContext, reason: null };
}
