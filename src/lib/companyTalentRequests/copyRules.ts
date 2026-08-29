export const CANDIDATE_CONTACT_RELATIONSHIP_RULES = [
  "The candidate was surfaced to the company through Harper; the input does not establish that the candidate applied, contacted the company, or asked Harper to make this request.",
  "Never say or imply that the candidate applied, submitted an application, expressed interest, contacted Harper, or made an inquiry unless that fact is explicitly supplied in the input.",
  "Make the named company the clear requester and Harper the messenger. Avoid ambiguous or legalistic phrases such as 'on behalf of the company' or Korean wording like 'Harper를 통해 문의해 주셨습니다'.",
  "The authored body owns the complete candidate-facing response guidance: say once that a brief or unpolished answer is acceptable, Harper will preserve the candidate's meaning and relay only what they authorize, and the candidate may skip the request if now is not a good time. Do not repeat this choice or discuss reminders, delivery channels, or where the same body will appear.",
].join(" ");

const OPTIONAL_RESPONSE_PHRASES =
  /편하실 때|편한 시간|편하신 방식|선택(?:사항|이에요|입니다|이며)|원치 않|답변(?:을)?\s*(?:하지 않|하기 어렵)|회신하지 않|확답하기 어렵|공유하고 싶지 않|넘어가셔도|업데이트하지 않으셔도|feel free|optional|no need to reply|do not have to reply|decline|ignore|skip this request|whenever convenient/gi;

export function hasRedundantCandidateContactOptOut(body: string) {
  return (String(body || "").match(OPTIONAL_RESPONSE_PHRASES) ?? []).length > 2;
}

const ROBOTIC_CANDIDATE_CONTACT_PATTERN =
  /후보자님|문의(?:를)?\s*요청|답변\s*여부는\s*편하신\s*대로|답변\s*주시지\s*않으셔도|여쭤보고\s*싶은\s*사항|Harper를\s*통해\s*연락드립니다|candidate(?:'s)?\s+response\s+is\s+optional|no\s+response\s+is\s+required/i;

export function candidateContactWritingIssue(body: unknown) {
  const value = String(body ?? "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (!value) return "Candidate contact copy is empty";
  if (ROBOTIC_CANDIDATE_CONTACT_PATTERN.test(value)) {
    return "Candidate contact copy uses robotic or distancing wording";
  }

  const paragraphs = value.split(/\n\s*\n/).filter(Boolean);
  if (paragraphs.length < 5) {
    return "Candidate contact copy is missing recruiter email structure";
  }
  if (value.startsWith("안녕하세요")) {
    if (!/^안녕하세요(?:,\s*[^\n.]+님)?\./.test(value)) {
      return "Korean candidate contact copy has an unnatural greeting";
    }
    if (!/감사합니다\.\nHarper 드림$/.test(value)) {
      return "Korean candidate contact copy has an invalid Harper signoff";
    }
    if ((value.match(/Harper 드림/g) ?? []).length !== 1) {
      return "Korean candidate contact copy repeats the Harper signoff";
    }
  } else {
    if (!/^Hi(?:\s+[^,\n]+)?,/.test(value)) {
      return "English candidate contact copy has an unnatural greeting";
    }
    if (!/Thank you,\nHarper$/.test(value)) {
      return "English candidate contact copy has an invalid Harper signoff";
    }
  }
  return null;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeCandidateResumeUploadLink(
  body: string,
  profileUrl: string | null
) {
  const url = String(profileUrl ?? "").trim();
  if (!url) return body;

  const sentinel = "\u0000HARPER_RESUME_UPLOAD_LINK\u0000";
  const markdownLink = new RegExp(
    `\\[[^\\]\\n]{1,120}\\]\\(${escapeRegExp(url)}\\)`,
    "g"
  );
  const normalized = body
    .replace(markdownLink, sentinel)
    .replaceAll(`<${url}>`, sentinel)
    .replaceAll(url, sentinel);
  const label = /[가-힣]/.test(body) ? "이력서 업로드" : "Upload your resume";
  return normalized.replaceAll(sentinel, `[${label}](${url})`);
}
