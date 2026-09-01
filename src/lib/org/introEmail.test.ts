import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildOrgIntroCandidateProfessionalSummary } from "./introEmailProfessionalSummary";
import {
  appendOrgIntroCaptureDisclosure,
  ORG_INTRO_CAPTURE_DISCLOSURE,
} from "./introEmailDisclosure";
import {
  containsOrgIntroCandidateDetractingInformation,
  containsOrgIntroOperationalMetadata,
  containsOrgIntroProcessHistory,
  getOrgIntroDraftSafetyIssues,
} from "./introEmailSafety";

test("does not append an empty organization introduction capture disclosure", () => {
  const first = appendOrgIntroCaptureDisclosure("Best regards,\nHarper");
  const second = appendOrgIntroCaptureDisclosure(first);

  assert.equal(ORG_INTRO_CAPTURE_DISCLOSURE, "");
  assert.equal(first, "Best regards,\nHarper");
  assert.equal(second, first);
});

test("warm intro prompt never exposes a prior company decline or reactivation", () => {
  const source = readFileSync(
    new URL("./introEmail.ts", import.meta.url),
    "utf8"
  );

  assert.match(source, /Never mention or imply a previous decline/);
  assert.match(source, /write a normal first warm introduction/);
  assert.match(source, /generate\("safety_retry", initialIssues\)/);
  assert.match(source, /repeatedly violated safety rules/);
  assert.doesNotMatch(source, /buildSafeOrgIntroEmailDraft/);
});

test("warm intro prompt supports natural Korean and disambiguates recipient roles", () => {
  const source = readFileSync(
    new URL("./introEmail.ts", import.meta.url),
    "utf8"
  );
  const serverSource = readFileSync(
    new URL("./server.ts", import.meta.url),
    "utf8"
  );

  assert.match(source, /ORG_INTRO_KO_SYSTEM_PROMPT/);
  assert.match(source, /자연스럽고 세심한 한국어 존댓말/);
  assert.match(
    source,
    /사람을 "후보자", "담당자"라고 부르거나 설명하지 마세요/
  );
  assert.match(source, /candidateProfessionalSummary만 경력 근거로/);
  assert.match(source, /현재 쉬는 중, 미재직, 경력 공백/);
  assert.match(source, /이 포지션에 관심을 보였다는 확인된 사실/);
  assert.match(source, /companyUserRole/);
  assert.match(source, /테스트, 검증 과정, 테스트 케이스, Slack, Gmail/);
  assert.match(source, /현재 이메일에서 대화를 이어가면 된다는 점/);
  assert.doesNotMatch(source, /must start exactly|must include exactly/i);
  assert.doesNotMatch(source, /반드시 정확히/);
  assert.match(source, /Do not describe the company, the Role, its duties/);
  assert.match(source, /buildOrgIntroSystemPrompt\(context\.locale\)/);
  assert.match(serverSource, /preferred_locale, setting_locale/);
  assert.match(serverSource, /parseCareerPromptLocale/);
  assert.match(serverSource, /locale: introLocale/);
  assert.match(serverSource, /talent_experiences/);
  assert.match(serverSource, /candidateProfessionalSummary/);
  assert.match(serverSource, /company_user_workspace/);
  assert.match(serverSource, /companyUserRole: args\.companyUser\.role/);
  assert.doesNotMatch(serverSource, /acceptanceReason: args\.acceptReason/);
});

test("builds a factual one-line professional summary from current or recent experience", () => {
  assert.equal(
    buildOrgIntroCandidateProfessionalSummary([
      {
        companyName: "Previous Co",
        endDate: "2025-12-01",
        role: "Product Manager",
        startDate: "2024-01-01",
      },
      {
        companyName: "Current Co",
        endDate: null,
        role: "B2B SaaS Founder",
        startDate: "2026-01-01",
      },
    ]),
    "현재 Current Co에서 B2B SaaS Founder로 재직 중입니다."
  );
  assert.equal(
    buildOrgIntroCandidateProfessionalSummary([
      {
        companyName: "Previous Co",
        endDate: "2025-12-01",
        role: "Backend Engineer",
        startDate: "2023-01-01",
      },
    ]),
    "Previous Co에서 Backend Engineer로 근무한 경험이 있습니다."
  );
  assert.equal(buildOrgIntroCandidateProfessionalSummary([]), null);
});

test("warm intro output guard detects company-process history in English and Korean", () => {
  for (const unsafe of [
    "Although the company declined before, it would now like to reconnect.",
    "The team reconsidered its decision.",
    "거절했지만 다시 연결하기로 했습니다.",
    "이전 프로세스 종료 안내 이후 상황이 바뀌었습니다.",
  ]) {
    assert.equal(containsOrgIntroProcessHistory(unsafe), true, unsafe);
  }
  assert.equal(
    containsOrgIntroProcessHistory(
      "I'm pleased to introduce you both regarding the Founding Engineer opportunity."
    ),
    false
  );
});

test("warm intro output guard blocks candidate details that can create a negative impression", () => {
  for (const unsafe of [
    "김호진님은 현재 쉬는 중입니다.",
    "Alex is currently unemployed and available immediately.",
    "박민서님은 경력 공백 후 이직을 준비 중입니다.",
  ]) {
    assert.equal(
      containsOrgIntroCandidateDetractingInformation(unsafe),
      true,
      unsafe
    );
  }
  assert.equal(
    containsOrgIntroCandidateDetractingInformation(
      "현재 Harper에서 Co-founder로 재직 중입니다."
    ),
    false
  );
});

test("warm intro output guard allows natural greeting, interest, handoff, and closing variants", () => {
  const body =
    "안녕하세요, 박민서님과 SBVA의 Investment Manager 김호진님.\n\n서로 인사 나누실 수 있도록 두 분을 연결해 드립니다.\n\n현재 Harper에서 Co-founder로 재직 중인 박민서님이 Portfolio Operations Lead 역할에 관심을 보여 이번에 소개드립니다.\n\nSBVA의 Investment Manager 김호진님과 이 이메일에서 편하게 대화를 이어가 주세요.\n\n고맙습니다.\nHarper";
  const args = {
    body,
    candidateName: "박민서",
    companyName: "SBVA",
    companyUserName: "김호진",
    companyUserRole: "Investment Manager",
    locale: "ko" as const,
    roleTitle: "Portfolio Operations Lead",
    subject: "Portfolio Operations Lead 포지션 소개 — SBVA 김호진님 · 박민서님",
  };

  assert.deepEqual(getOrgIntroDraftSafetyIssues(args), []);
  assert.deepEqual(
    getOrgIntroDraftSafetyIssues({
      ...args,
      body: body.replaceAll("Investment Manager", "채용 담당자"),
      companyUserRole: "채용 담당자",
    }),
    []
  );
});

test("warm intro output guard accepts a localized English company title and rejects leaked Korean", () => {
  const base = {
    candidateName: "Alex Kim",
    companyName: "SBVA",
    companyUserName: "Jamie Lee",
    companyUserRole: "채용 담당자",
    locale: "en" as const,
    roleTitle: "Backend Engineer",
    subject: "Backend Engineer introduction — SBVA Jamie Lee & Alex Kim",
  };
  const localizedBody =
    "Hi SBVA's Recruiting Manager Jamie Lee and Alex Kim,\n\nIt's a pleasure to introduce you both.\n\nJamie, I'd like to introduce Alex Kim. Alex Kim has expressed interest in the Backend Engineer role.\n\nAlex Kim, I'd like to introduce SBVA's Recruiting Manager Jamie Lee.\n\nPlease continue the conversation in this email thread.\n\nBest regards,\nHarper";

  assert.deepEqual(
    getOrgIntroDraftSafetyIssues({ ...base, body: localizedBody }),
    []
  );
  assert.deepEqual(
    getOrgIntroDraftSafetyIssues({
      ...base,
      body: localizedBody.replaceAll("Recruiting Manager", "채용 담당자"),
    }),
    ["unlocalized_company_user_role"]
  );
});

test("warm intro output guard blocks operational metadata and Korean recipient labels", () => {
  for (const unsafe of [
    "이번 검증 과정에서 본인 계정으로 Slack과 Gmail을 확인했습니다.",
    "B2B SaaS 테스트 케이스로 확인이 이루어졌습니다.",
  ]) {
    assert.equal(containsOrgIntroOperationalMetadata(unsafe), true, unsafe);
  }

  assert.deepEqual(
    getOrgIntroDraftSafetyIssues({
      body: "SBVA의 김호진님, 김호진님 안녕하세요.\n\n두 분을 소개해 드리게 되어 반갑습니다.\n\n김호진님, SBVA의 역할을 소개드립니다.\n\nSBVA의 김호진님, 김호진님을 소개드립니다.\n\n이후 대화는 이 메일에서 이어가 주시면 됩니다.\n\n감사합니다.\nHarper 드림",
      locale: "ko",
      subject:
        "Portfolio Operations Lead 포지션 소개 — SBVA 김호진님 · 김호진님",
    }),
    []
  );
  assert.deepEqual(
    getOrgIntroDraftSafetyIssues({
      body: "SBVA의 이지훈님, 박민서님 안녕하세요.\n\n두 분을 소개해 드리게 되어 반갑습니다.\n\n박민서님, SBVA의 역할을 소개드립니다.\n\n이지훈님, 박민서님을 소개드립니다.\n\n이후 대화는 이 메일에서 이어가 주시면 됩니다.\n\n감사합니다.\nHarper 드림",
      candidateName: "박민서",
      companyName: "SBVA",
      companyUserName: "이지훈",
      locale: "ko",
      subject: "Backend Engineer 포지션 소개 — SBVA 이지훈님 · 박민서님",
    }),
    []
  );
  assert.deepEqual(
    getOrgIntroDraftSafetyIssues({
      body: "후보자 김호진님, SBVA 담당자 김호진님 안녕하세요.\n\n검증 과정에서 Slack을 확인했습니다.\n\n감사합니다.\nHarper 드림",
      locale: "ko",
      subject: "후보자 소개",
    }),
    ["operational_or_test_metadata", "recipient_role_label"]
  );
});
