import { isCompensationQuestion } from "@/lib/companyTalentRequests/policy";

export type CandidateContactDraftCopy = {
  body: string;
  requestContext: string;
  subject: string;
};

export const CANDIDATE_CONTACT_WRITING_RULES = [
  "Write like a thoughtful recruiter protecting both the candidate relationship and the named company's professional image, not like a workflow notification or legal notice.",
  "In Korean, use a consistent polished formal tone, address the person naturally by name when available, make the request considerate, and close as Harper. Never address the recipient as '후보자님'.",
  "Make the subject identify the company, role, and concrete purpose so it is useful in an inbox. A Korean subject should normally resemble '[회사명] 역할명 역할 관련 간단한 질문' or '[회사명] 역할명 검토를 위한 최신 이력서 요청'.",
  "The first paragraph after the greeting must say which company and role prompted the note and explain the neutral reason for the question. Derive that reason only from the supplied request; do not invent praise, enthusiasm, a hiring stage, or private evaluation context.",
  "Rephrase the substantive request as one clear, considerate question. Preserve every requirement and do not add a new requirement. Do not copy terse noun phrases, skeptical wording, or internal shorthand verbatim when natural prose can preserve the same meaning.",
  "Help the candidate answer without making the email longer than necessary. Explain the useful dimensions or conditions only when they are inherent in the request: for an experience question, name the requested aspects; for availability or working conditions, invite any condition that would need coordination; for compensation, ask for the exact amount, range, or wording they authorize Harper to share.",
  "After the question, say that a brief or unpolished answer is acceptable and that Harper will preserve the candidate's meaning and relay only what they authorize. Include one concise low-pressure sentence for a candidate who cannot or does not want to answer now. Do not repeat this choice in multiple paragraphs.",
  "Avoid empty pleasantries, generic wellbeing questions, repeated words such as '문의 요청', bureaucratic phrases such as '답변 여부는 편하신 대로 결정해 주시면 됩니다', and phrases that make the company sound indifferent such as '답변 주시지 않으셔도 괜찮습니다'.",
  "Use short readable paragraphs. A normal question email should have a greeting, a contextual opening, the question, one response-guidance paragraph, and the Harper signoff. Do not collapse it to a greeting plus one sentence.",
  "For a resume request, explain the purpose first, then the two upload methods, what happens to the uploaded file, and the candidate's choice. Keep the supplied Markdown upload link and supported file formats exact.",
].join(" ");

export const CANDIDATE_CONTACT_STYLE_EXAMPLES_KO = `아래 예시는 문장 복사본이 아니라 문체와 정보 순서의 기준이다.

[경력 질문]
안녕하세요, {이름}님.

{회사}에서 {역할} 역할을 검토하며, {질문의 대상이 되는 경험}을 조금 더 구체적으로 이해하고 싶어 Harper에 질문을 부탁했습니다.

{회사가 요청한 내용을 한 가지 분명한 질문으로 작성} 길게 정리하지 않으셔도 됩니다.

답변해 주신 내용은 의미가 달라지지 않도록 정리해 {회사}에 전달하겠습니다. 지금 답변하기 어렵다면 이번에는 넘어가셔도 괜찮습니다.

감사합니다.
Harper 드림

[근무 조건 질문]
안녕하세요, {이름}님.

{회사}에서 {역할} 역할을 검토하며, 근무 조건과 관련해 한 가지 확인을 부탁했습니다.

{빈도와 조건을 포함한 회사의 질문} 가능 여부와 함께 미리 고려하거나 조율해야 할 조건이 있다면 알려주세요.

바로 확답하기 어려우시면 가능한 범위나 조율이 필요한 부분만 말씀해 주셔도 괜찮습니다. 답변은 의미가 달라지지 않도록 정리해 {회사}에 전달하겠습니다.

감사합니다.
Harper 드림

[이력서 요청]
안녕하세요, {이름}님.

{회사}에서 {역할} 역할을 검토하며, 최신 경력을 확인할 수 있는 이력서를 공유받을 수 있을지 Harper에 문의했습니다.

공유가 가능하시다면 이 메시지에 지원 형식의 파일 한 개를 첨부해 답장하시거나 아래 링크에서 업로드해 주세요.

[이력서 업로드]({필수 URL})

업로드한 파일은 Harper 프로필의 최신 이력서로 등록되고, Harper가 이번 역할 검토를 위해 {회사}에 전달합니다. 최신본이 없거나 지금 공유하고 싶지 않으시다면 이번에는 업데이트하지 않으셔도 괜찮습니다.

감사합니다.
Harper 드림`;

export const CANDIDATE_CONTACT_STYLE_EXAMPLES_EN = `These are style and information-order references, not templates to copy.

[Professional experience question]
Hi {name},

{Company} is reviewing your background for the {Role} role and asked Harper to understand {the relevant experience} in a little more detail.

{Write the company's request as one clear question.} There is no need to prepare a long or polished response.

Harper will preserve your meaning and relay only what you authorize to {Company}. If now is not a good time to answer, it is fine to skip this request.

Thank you,
Harper

[Working-condition question]
Hi {name},

{Company} is reviewing your background for the {Role} role and asked Harper to confirm one working condition.

{Write the frequency and condition as one clear question.} Please include any condition that would need advance coordination.

If you cannot confirm right away, you may share only what is workable for you. Harper will preserve your meaning and relay only what you authorize.

Thank you,
Harper`;

const AVAILABILITY_OR_WORKING_CONDITION_PATTERN =
  /가능|일정|시간|주말|평일|야간|교대|행사|출장|출근|재택|하이브리드|근무\s*(?:조건|시간|지역|방식)|입사\s*가능|availability|schedule|weekend|weekday|night|shift|event|travel|onsite|remote|hybrid|working\s*(?:condition|hour|location)|start\s*date/i;

function compact(value: unknown, limit: number) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function signoff(locale: "en" | "ko") {
  return locale === "en" ? "Thank you,\nHarper" : "감사합니다.\nHarper 드림";
}

function koreanExperienceTopic(value: string) {
  const match = value.match(
    /(?:최근\s+(?:진행|수행)하신\s+)?([가-힣A-Za-z0-9·/&+\-\s]{2,50}?)\s+(?:프로젝트|경험)/
  );
  return String(match?.[1] ?? "")
    .replace(/^(?:본인의|후보자님의|직접|하나의)\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function considerateKoreanRequest(value: string) {
  return value
    .replace(/설명해\s*주세요\.?$/, "설명해 주실 수 있을까요?")
    .replace(/알려\s*주세요\.?$/, "알려주실 수 있을까요?");
}

export function buildCandidateContactFallback(args: {
  candidateName: string;
  companyName: string;
  kind: "question" | "resume";
  locale: "en" | "ko";
  profileUrl: string | null;
  requestContext: string;
  roleName: string;
}): CandidateContactDraftCopy {
  const candidate = compact(args.candidateName, 80);
  const company =
    compact(args.companyName, 160) ||
    (args.locale === "en" ? "The company" : "회사");
  const role =
    compact(args.roleName, 160) ||
    (args.locale === "en" ? "the role" : "해당 역할");
  const requestContext = compact(args.requestContext, 800);
  const compensation = isCompensationQuestion(requestContext);
  const workingCondition =
    AVAILABILITY_OR_WORKING_CONDITION_PATTERN.test(requestContext);

  if (args.locale === "en") {
    const greeting = candidate ? `Hi ${candidate},` : "Hi,";
    if (args.kind === "resume") {
      return {
        subject: `[${company}] Current resume request for ${role}`,
        requestContext,
        body: [
          greeting,
          `${company} is reviewing your background for the ${role} role and asked Harper whether you would be comfortable sharing a current resume.`,
          `If you choose to share one, attach one PDF, DOCX, TXT, or MD file to your reply, or [upload your resume](${args.profileUrl ?? ""}).`,
          `The uploaded file will become the current resume on your Harper profile, and Harper will relay it to ${company} for this role review. If you do not have a current version or do not want to share one now, it is fine to skip this request.`,
          signoff(args.locale),
        ].join("\n\n"),
      };
    }
    const guidance = compensation
      ? `Please include the exact amount, range, or wording you authorize Harper to share. Harper will preserve your meaning and relay only what you authorize to ${company}; if you would rather not share compensation now, it is fine to skip this request.`
      : workingCondition
        ? `Please include any condition that would need advance coordination. If you cannot confirm right away, you may share only what is workable for you; Harper will preserve your meaning when relaying it to ${company}.`
        : `There is no need to prepare a long or polished response. Harper will preserve your meaning and relay only what you authorize to ${company}; if now is not a good time to answer, it is fine to skip this request.`;
    return {
      subject: `[${company}] A question about the ${role} role`,
      requestContext,
      body: [
        greeting,
        `${company} is reviewing your background for the ${role} role and asked Harper to clarify one point.`,
        requestContext,
        guidance,
        signoff(args.locale),
      ].join("\n\n"),
    };
  }

  const greeting = candidate ? `안녕하세요, ${candidate}님.` : "안녕하세요.";
  if (args.kind === "resume") {
    return {
      subject: `[${company}] ${role} 검토를 위한 최신 이력서 요청`,
      requestContext,
      body: [
        greeting,
        `${company}에서 ${role} 역할을 검토하며, 최신 경력을 확인할 수 있는 이력서를 공유받을 수 있을지 Harper에 문의했습니다.`,
        `공유가 가능하시다면 이 메시지에 PDF, DOCX, TXT 또는 MD 파일 한 개를 첨부해 답장하시거나 아래 링크에서 업로드해 주세요.\n\n[이력서 업로드](${args.profileUrl ?? ""})`,
        `업로드한 파일은 Harper 프로필의 최신 이력서로 등록되고, Harper가 이번 역할 검토를 위해 ${company}에 전달합니다. 최신본이 없거나 지금 공유하고 싶지 않으시다면 이번에는 업데이트하지 않으셔도 괜찮습니다.`,
        signoff(args.locale),
      ].join("\n\n"),
    };
  }

  const experienceTopic = koreanExperienceTopic(requestContext);
  const opening = workingCondition
    ? `${company}에서 ${role} 역할을 검토하며, 근무 조건과 관련해 한 가지 확인을 부탁했습니다.`
    : experienceTopic
      ? `${company}에서 ${role} 역할을 검토하며, ${candidate ? `${candidate}님의 ` : ""}${experienceTopic} 경험을 조금 더 구체적으로 이해하고 싶어 Harper에 질문을 부탁했습니다.`
      : `${company}에서 ${role} 역할을 검토하며, 한 가지 확인을 위해 Harper에 질문을 부탁했습니다.`;
  const guidance = compensation
    ? `회사에 전달해도 괜찮은 정확한 금액·범위 또는 다른 표현을 알려주세요. Harper가 의미를 바꾸지 않고 허락해 주신 내용만 ${company}에 전달하겠습니다. 지금 공유하고 싶지 않으시다면 이번에는 넘어가셔도 괜찮습니다.`
    : workingCondition
      ? `가능 여부와 함께 미리 고려하거나 조율해야 할 조건이 있다면 알려주세요. 바로 확답하기 어려우시면 가능한 범위만 말씀해 주셔도 괜찮습니다. 답변은 의미가 달라지지 않도록 정리해 ${company}에 전달하겠습니다.`
      : `길게 정리하지 않으셔도 됩니다. 답변해 주신 내용은 의미가 달라지지 않도록 정리해 ${company}에 전달하겠습니다. 지금 답변하기 어렵다면 이번에는 넘어가셔도 괜찮습니다.`;
  return {
    subject: `[${company}] ${role} 역할 관련 간단한 질문`,
    requestContext,
    body: [
      greeting,
      opening,
      considerateKoreanRequest(requestContext),
      guidance,
      signoff(args.locale),
    ].join("\n\n"),
  };
}
