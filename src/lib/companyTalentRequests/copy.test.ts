import assert from "node:assert/strict";
import test from "node:test";
import {
  CANDIDATE_CONTACT_RELATIONSHIP_RULES,
  normalizeCandidateResumeUploadLink,
} from "@/lib/companyTalentRequests/copyRules";
import {
  buildCandidateContactFallback,
  CANDIDATE_CONTACT_WRITING_RULES,
} from "@/lib/companyTalentRequests/candidateContactWriting";

test("candidate contact copy does not invent an application or ambiguous requester", () => {
  assert.match(
    CANDIDATE_CONTACT_RELATIONSHIP_RULES,
    /does not establish that the candidate applied/
  );
  assert.match(
    CANDIDATE_CONTACT_RELATIONSHIP_RULES,
    /Make the named company the clear requester and Harper the messenger/
  );
  assert.match(
    CANDIDATE_CONTACT_RELATIONSHIP_RULES,
    /Harper를 통해 문의해 주셨습니다/
  );
  assert.match(
    CANDIDATE_CONTACT_RELATIONSHIP_RULES,
    /The authored body owns the complete candidate-facing response guidance/
  );
  assert.doesNotMatch(CANDIDATE_CONTACT_RELATIONSHIP_RULES, /Harper chat/);
});

test("candidate contact writing rules describe outcomes without fixed prose", () => {
  assert.match(CANDIDATE_CONTACT_WRITING_RULES, /close as Harper/);
  assert.doesNotMatch(CANDIDATE_CONTACT_WRITING_RULES, /begin exactly/i);
  assert.doesNotMatch(CANDIDATE_CONTACT_WRITING_RULES, /end with '감사합니다/);
});

test("candidate resume requests hide the raw upload URL behind a markdown label", () => {
  const url =
    "https://matchharper.com/career/profile?profileSection=links&resumeRequest=signed";

  assert.equal(
    normalizeCandidateResumeUploadLink(
      `아래 링크에서 업로드해 주세요.\n${url}`,
      url
    ),
    `아래 링크에서 업로드해 주세요.\n[이력서 업로드](${url})`
  );
  assert.equal(
    normalizeCandidateResumeUploadLink(
      `Upload it here: [Website](${url})`,
      url
    ),
    `Upload it here: [Upload your resume](${url})`
  );
});

test("candidate contact fallback keeps recruiter structure for experience questions", () => {
  const draft = buildCandidateContactFallback({
    candidateName: "김호진",
    companyName: "SBVA",
    kind: "question",
    locale: "ko",
    profileUrl: null,
    requestContext:
      "최근 진행하신 운영 자동화 프로젝트 중 하나를 선택해 어떤 문제를 해결하려 했는지와 직접 맡은 역할을 설명해 주세요.",
    roleName: "GTM Operations Lead",
  });

  assert.equal(
    draft.subject,
    "[SBVA] GTM Operations Lead 역할 관련 간단한 질문"
  );
  assert.match(draft.body, /^안녕하세요, 김호진님\./);
  assert.match(draft.body, /조금 더 구체적으로 이해하고 싶어/);
  assert.match(draft.body, /길게 정리하지 않으셔도 됩니다/);
  assert.match(draft.body, /의미가 달라지지 않도록 정리해 SBVA에 전달/);
  assert.match(draft.body, /이번에는 넘어가셔도 괜찮습니다/);
});

test("candidate contact fallback invites coordination for working conditions", () => {
  const draft = buildCandidateContactFallback({
    candidateName: "김호진",
    companyName: "SBVA",
    kind: "question",
    locale: "ko",
    profileUrl: null,
    requestContext: "월 1회 정도 주말 행사 대응이 가능하신지 궁금합니다.",
    roleName: "Portfolio Support Manager",
  });

  assert.match(draft.body, /근무 조건과 관련해 한 가지 확인/);
  assert.match(draft.body, /미리 고려하거나 조율해야 할 조건/);
  assert.match(draft.body, /바로 확답하기 어려우시면 가능한 범위만/);
});

test("candidate contact fallback preserves allowed age and nationality questions", () => {
  const draft = buildCandidateContactFallback({
    candidateName: "Chris Heo",
    companyName: "SBVA",
    kind: "question",
    locale: "ko",
    profileUrl: null,
    requestContext: "현재 나이와 국적을 알려주실 수 있나요?",
    roleName: "FDE",
  });

  assert.equal(draft.requestContext, "현재 나이와 국적을 알려주실 수 있나요?");
  assert.match(draft.body, /현재 나이와 국적/);
});

test("candidate resume fallback explains purpose, handling, and choice", () => {
  const url =
    "https://matchharper.com/career/profile?profileSection=links&resumeRequest=signed";
  const draft = buildCandidateContactFallback({
    candidateName: "김호진",
    companyName: "SBVA",
    kind: "resume",
    locale: "ko",
    profileUrl: url,
    requestContext: "최신 이력서 공유 가능 여부",
    roleName: "Founder Success Lead",
  });

  assert.equal(
    draft.subject,
    "[SBVA] Founder Success Lead 검토를 위한 최신 이력서 요청"
  );
  assert.match(draft.body, /최신 경력을 확인할 수 있는 이력서/);
  assert.match(draft.body, /PDF, DOCX, TXT 또는 MD/);
  assert.match(draft.body, /Harper 프로필의 최신 이력서로 등록/);
  assert.match(draft.body, /이번 역할 검토를 위해 SBVA에 전달/);
  assert.match(draft.body, /이번에는 업데이트하지 않으셔도/);
});
