export const CANDIDATE_CONTACT_RELATIONSHIP_RULES = [
  "The candidate was surfaced to the company through Harper; the input does not establish that the candidate applied, contacted the company, or asked Harper to make this request.",
  "Never say or imply that the candidate applied, submitted an application, expressed interest, contacted Harper, or made an inquiry unless that fact is explicitly supplied in the input.",
  "Make the named company the clear requester and Harper the messenger. Avoid ambiguous or legalistic phrases such as 'on behalf of the company' or Korean wording like 'Harper를 통해 문의해 주셨습니다'.",
  "Use one concise optional-response sentence. Do not repeat opt-out language in multiple paragraphs.",
].join(" ");

const OPTIONAL_RESPONSE_PHRASES =
  /편하실 때|편한 시간|편하신 방식|선택(?:사항|이에요|입니다|이며)|원치 않|답변하지 않|회신하지 않|답하기 어렵|feel free|optional|no need to reply|do not have to reply|decline|ignore|whenever convenient/gi;

export function hasRedundantCandidateContactOptOut(body: string) {
  return (String(body || "").match(OPTIONAL_RESPONSE_PHRASES) ?? []).length > 2;
}
