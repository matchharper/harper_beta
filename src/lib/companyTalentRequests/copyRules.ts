export const CANDIDATE_CONTACT_RELATIONSHIP_RULES = [
  "The candidate was surfaced to the company through Harper; the input does not establish that the candidate applied, contacted the company, or asked Harper to make this request.",
  "Never say or imply that the candidate applied, submitted an application, expressed interest, contacted Harper, or made an inquiry unless that fact is explicitly supplied in the input.",
  "Make the named company the clear requester and Harper the messenger. Avoid ambiguous or legalistic phrases such as 'on behalf of the company' or Korean wording like 'Harper를 통해 문의해 주셨습니다'.",
  "The authored body owns the complete candidate-facing response guidance: say once that a brief or unpolished answer is acceptable, Harper will preserve the candidate's meaning and relay only what they authorize, and the candidate may skip the request if now is not a good time. Do not repeat this choice or discuss reminders, delivery channels, or where the same body will appear.",
].join(" ");

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
