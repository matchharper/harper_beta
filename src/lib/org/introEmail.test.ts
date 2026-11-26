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

test("warm intro prompt supports warm, evidence-grounded introductions in both locales", () => {
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
  assert.match(source, /두 분 다 만나보고 싶다고 하셔서 연결한다는 확인된 사실/);
  assert.match(source, /직접 만들었거나 맡은 일을 씁니다/);
  assert.match(source, /일정은 이 메일에서 두 분이 바로 잡으시면 된다고/);
  // With a booking link below the body, the hand-off points to it instead of the thread.
  assert.match(source, /bookingLink가 true면 메일 바로 아래에 시간 고르는 링크가 붙으니/);
  assert.match(source, /When bookingLink is true, a time-picking link is added right below the email/);
  assert.match(serverSource, /bookingLink: Boolean\(args\.bookingLink\)/);
  // The same-name rule, and the title shape the 담당자 safety check accepts.
  assert.match(source, /회사 사람의 직함을 쓸 때는 "<회사>의 <직함> <이름>님" 모양으로 씁니다/);
  assert.match(source, /두 사람 이름이 같으면 회사 사람은 이 모양/);
  assert.match(source, /If both people have the same name, keep them apart/);
  assert.match(source, /"Harper 드림"으로 맺습니다/);
  // No words from the person being introduced reach the model, so no interest or joining claims.
  assert.match(source, /관심이 얼마나 큰지, 왜 옮기려는지, 조건, 합류 가능 시기는 쓰지 마세요/);
  assert.match(source, /do not describe how interested they are, why they want to move, their conditions, or when they could join/);
  assert.match(source, /"대표님" 같은 직함 호칭 대신 이름에 "님"을 붙여/);
  assert.match(source, /not wording to copy/);
  assert.match(source, /companySummary/);
  assert.match(source, /roleSummary/);
  assert.match(source, /connectionEvidence/);
  assert.match(source, /Do not turn the email into a pitch deck or resume summary/);
  assert.match(source, /Do not emphasize location/);
  assert.match(source, /현재 쉬는 중, 미재직, 경력 공백/);
  assert.match(source, /companyUserRole/);
  assert.match(source, /테스트, 검증 과정, 테스트 케이스, Slack, Gmail/);
  assert.doesNotMatch(source, /must start exactly|must include exactly/i);
  assert.doesNotMatch(source, /반드시 정확히/);
  assert.doesNotMatch(
    source,
    /Do not describe the company, the Role, its duties/
  );
  assert.match(source, /buildOrgIntroSystemPrompt\(context\.locale\)/);
  assert.match(serverSource, /preferred_locale, setting_locale/);
  assert.match(serverSource, /parseCareerPromptLocale/);
  assert.match(serverSource, /locale: introLocale/);
  assert.match(serverSource, /talent_experiences/);
  assert.match(serverSource, /candidateProfessionalSummary/);
  assert.match(serverSource, /args\.workspace\.company_description/);
  assert.match(serverSource, /args\.workspace\.pitch/);
  assert.match(serverSource, /args\.recommendation\.fit_reasons/);
  assert.match(serverSource, /args\.role\.description/);
  assert.match(serverSource, /company_user_workspace/);
  assert.match(serverSource, /companyUserRole: args\.companyUser\.role/);
  assert.doesNotMatch(serverSource, /acceptanceReason: args\.acceptReason/);
});

test("intro source preserves shared achievements and does not infer employment from an absent end date", () => {
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
        description: "장애 복구 시간을 45분에서 18분으로 단축했습니다.",
      },
    ]),
    "B2B SaaS Founder · Current Co\n시작: 2026-01-01; 종료: 미기록 (현재 재직 여부 미확인)\n장애 복구 시간을 45분에서 18분으로 단축했습니다.\n\nProduct Manager · Previous Co\n시작: 2024-01-01; 종료: 2025-12-01"
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
    "Backend Engineer · Previous Co\n시작: 2023-01-01; 종료: 2025-12-01"
  );
  assert.equal(buildOrgIntroCandidateProfessionalSummary([]), null);
});

test("the subject calls the person being introduced by name, as in the mail-tone review", () => {
  const source = readFileSync(new URL("./introEmail.ts", import.meta.url), "utf8");
  assert.ok(source.includes('"<first name>, meet <company person\'s name> at <company>"'));
  assert.ok(source.includes('"<소개받는 사람 이름>님, <회사명> <회사 사람 이름>님 소개해 드려요"'));
});

test("the prompts' example mails pass the output guard, so following their shape never blocks a send", () => {
  const source = readFileSync(new URL("./introEmail.ts", import.meta.url), "utf8");
  const examples = [
    ["en", /not wording to copy: "([^"]+)"/],
    ["ko", /그대로 쓰라는 뜻은 아닙니다: "([^"]+)"/],
  ] as const;
  for (const [locale, pattern] of examples) {
    const body = source.match(pattern)?.[1];
    assert.ok(body, `${locale} example`);
    assert.deepEqual(getOrgIntroDraftSafetyIssues({ body, locale, subject: "" }), [], body);
  }
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
