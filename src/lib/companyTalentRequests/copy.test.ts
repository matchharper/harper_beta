import assert from "node:assert/strict";
import test from "node:test";
import { assertCandidateResumeUploadLink } from "@/lib/companyTalentRequests/copyRules";
import {
  CANDIDATE_CONTACT_COPY_MAX_OUTPUT_TOKENS,
  CANDIDATE_CONTACT_COPY_SCHEMA,
  CANDIDATE_CONTACT_CURRENT_INSTRUCTION_MAX_CHARS,
  CANDIDATE_CONTACT_RECENT_CONTEXT_MAX_CHARS,
  buildCandidateContactDraftMessages,
  buildCandidateContactRevisionMessages,
} from "@/lib/companyTalentRequests/copyPrompt";

function buildRepresentativeDraftPrompt() {
  return buildCandidateContactDraftMessages({
    candidateName: "김호진",
    companyName: "SBVA",
    currentInstruction: "Replace Atlas with SBVA in the email and prepare it.",
    kind: "question",
    profileUrl: null,
    recentConversation:
      "Chris: Hi Alex, would you be open to a coffee chat with Atlas? Best, Chris",
    recipientLocale: "ko",
    requestContext:
      "최근 진행하신 운영 자동화 프로젝트 중 하나를 선택해 어떤 문제를 해결하려 했는지와 직접 맡은 역할을 설명해 주세요.",
    roleName: "GTM Operations Lead",
  })
    .map((message) => message.content)
    .join("\n");
}

test("candidate contact copy reserves enough output for reasoning and JSON", () => {
  assert.equal(CANDIDATE_CONTACT_COPY_MAX_OUTPUT_TOKENS, 9_600);
  assert.equal(CANDIDATE_CONTACT_COPY_SCHEMA.properties.body.maxLength, 5_000);
  assert.equal(CANDIDATE_CONTACT_COPY_SCHEMA.properties.subject.maxLength, 180);
  assert.deepEqual(CANDIDATE_CONTACT_COPY_SCHEMA.properties.reason.type, [
    "string",
    "null",
  ]);
  assert.ok(CANDIDATE_CONTACT_COPY_SCHEMA.required.includes("reason"));
});

test("candidate contact prompt bounds repeated batch context while preserving the newest turns", () => {
  const newestMarker = "NEWEST_COMPANY_INSTRUCTION";
  const currentStart = "CURRENT_START";
  const currentEnd = "CURRENT_END";
  const messages = buildCandidateContactDraftMessages({
    candidateName: "Alex",
    companyName: "Acme",
    currentInstruction:
      currentStart +
      "c".repeat(CANDIDATE_CONTACT_CURRENT_INSTRUCTION_MAX_CHARS * 2) +
      currentEnd,
    kind: "contact",
    profileUrl: null,
    recentConversation:
      "old".repeat(CANDIDATE_CONTACT_RECENT_CONTEXT_MAX_CHARS) + newestMarker,
    recipientLocale: "en",
    requestContext: "Share the team introduction.",
    roleName: "Backend Engineer",
  });
  const prompt = messages.map((message) => message.content).join("\n");

  assert.match(prompt, /older conversation omitted/);
  assert.match(prompt, new RegExp(newestMarker));
  assert.match(prompt, new RegExp(currentStart));
  assert.match(prompt, new RegExp(currentEnd));
  assert.match(prompt, /middle omitted to keep the writing context bounded/);
  assert.ok(prompt.length < 30_000);
});

test("candidate contact prompt uses one broad writing guide", () => {
  const prompt = buildRepresentativeDraftPrompt();

  assert.match(prompt, /You are Company’s Hiring Partner, Harper/);
  assert.match(
    prompt,
    /회사의 요청을 정확하게 전달하면서도 후보자에게 부담을 주지 않는/
  );
  assert.match(
    prompt,
    /직접적인 내용 혹은 요구를 한 경우에는 그것을 최대한 따른다/
  );
  assert.match(prompt, /전부 필수적인 것은 아니며/);
  assert.match(prompt, /제목에는 회사명과 역할명을 정확히 언급/);
  assert.match(prompt, /해당 회사가 요청했고 Harper가 이를 대신 전달/);
  assert.match(prompt, /제공되었거나 확인된 사실만 사용/);
  assert.match(prompt, /‘후보자님’이라는 일반적인 호칭은 사용하지 않는다/);
  assert.match(prompt, /특별한 이유가 없다면 null/);
  assert.doesNotMatch(prompt, /### Korean example|### English example/);
});

test("candidate resume requests require a descriptive markdown upload link without rewriting its language", () => {
  const url =
    "https://matchharper.com/career/profile?profileSection=links&resumeRequest=signed";

  assert.doesNotThrow(() =>
    assertCandidateResumeUploadLink(
      `Upload it here: [Share your latest CV](${url})`,
      url
    )
  );
  assert.throws(
    () =>
      assertCandidateResumeUploadLink(
        `아래 링크에서 업로드해 주세요.\n${url}`,
        url
      ),
    /descriptive Markdown link/
  );
  assert.throws(
    () => assertCandidateResumeUploadLink(`[Upload](${url})\nRaw: ${url}`, url),
    /must not expose the raw upload URL/
  );
  assert.throws(
    () => assertCandidateResumeUploadLink(`[${url}](${url})`, url),
    /descriptive Markdown link/
  );
});

test("candidate contact prompt weighs the current instruction, recent conversation, and recipient locale", () => {
  const prompt = buildRepresentativeDraftPrompt();
  assert.match(prompt, /recipient's saved language is Korean/);
  assert.match(prompt, /would you be open to a coffee chat with Atlas/);
  assert.match(prompt, /Replace Atlas with SBVA/);
  assert.match(prompt, /해당 문구를 가장 중요한 작성 기준으로 유지/);
  assert.match(prompt, /기존 문구에 요청된 변경 사항을 적용/);
  assert.match(prompt, /<recent_company_conversation>/);
  assert.match(prompt, /<current_company_instruction>/);
  assert.doesNotMatch(prompt, /Return JSON only/i);
});

test("candidate contact revision prompt preserves the authoritative draft and exact edit", () => {
  const url =
    "https://matchharper.com/career/profile?profileSection=links&resumeRequest=signed";
  const messages = buildCandidateContactRevisionMessages({
    current: {
      body: `Please upload here: [Upload your resume](${url})`,
      requestContext: "latest resume availability",
      subject: "Current subject",
    },
    currentInstruction: "Keep it in English and make the greeting shorter.",
    editInstruction: "Make the greeting shorter.",
    kind: "resume",
    profileUrl: url,
    recentConversation: "Chris: Please revise the draft above.",
    recipientLocale: "en",
  });

  const prompt = messages.map((message) => message.content).join("\n");
  assert.match(prompt, /recipient's saved language is English/);
  assert.match(prompt, /Current subject/);
  assert.match(prompt, /Make the greeting shorter/);
  assert.match(prompt, /Revise the complete candidate-facing email/);
  assert.match(prompt, /reason에는 특별히 그렇게 작성한 이유가 있을 때만/);
  assert.match(prompt, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(prompt, /Return JSON only/i);
});

test("candidate contact copy supports an informational contact without a response intent", () => {
  const messages = buildCandidateContactDraftMessages({
    candidateName: "Alex",
    companyName: "Acme",
    currentInstruction: "팀 소개 자료를 전달해 주세요.",
    kind: "contact",
    profileUrl: null,
    recentConversation: "",
    recipientLocale: "ko",
    requestContext: "Acme 팀 소개 자료 전달",
    roleName: "Backend Engineer",
  });
  assert.match(messages[0]?.content ?? "", /## Contact mode/);
  assert.match(
    messages[0]?.content ?? "",
    /without inventing a question, requested document, response deadline/
  );
  assert.match(messages[1]?.content ?? "", /Contact kind: contact/);
  assert.match(messages[1]?.content ?? "", /Acme 팀 소개 자료 전달/);
});

test("contact mode is additive and does not alter question or resume instructions", () => {
  for (const kind of ["question", "resume"] as const) {
    const messages = buildCandidateContactDraftMessages({
      candidateName: "Alex",
      companyName: "Acme",
      currentInstruction: "Use the existing request copy.",
      kind,
      profileUrl: kind === "resume" ? "https://matchharper.com/upload" : null,
      recentConversation: "",
      recipientLocale: "en",
      requestContext: "Existing request",
      roleName: "Backend Engineer",
    });
    assert.doesNotMatch(messages[0]?.content ?? "", /## Contact mode/);
  }
});
