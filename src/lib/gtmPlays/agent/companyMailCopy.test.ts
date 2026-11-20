import assert from "node:assert/strict";
import test from "node:test";
import {
  candidateLine1, companyMailMarkdown, companyMailSubject, renderCompanyMail, renderWrittenCompanyMail, replySubject,
  type CompanyMailCopyInput,
} from "./companyMailCopy";

// Made-up company and posting (public repo).
const base: CompanyMailCopyInput = {
  variant: "S1",
  language: "ko",
  companyName: "Company A",
  postingTitle: "백엔드 엔지니어",
  visible: 2,
  interested: 1,
  questions: ["미국 밖(멕시코)에서 원격으로 일할 수 있나요?"],
  lines: [
    { line1: "백엔드 엔지니어 · 경력 6년 · 멕시코시티", line2: "결제 API를 처음부터 만들어 하루 100만 건 규모로 운영", interested: true },
    { line1: "백엔드 엔지니어 · 경력 8년 · 서울", line2: "대규모 정산 시스템을 이끌었고 Go와 Kubernetes를 주로 씀", interested: false },
  ],
  unnamedInterested: 0,
  senderName: "Ashley Kim",
  landingUrl: "https://matchharper.com/org?gtm=mail-1",
  unsubscribeUrl: "https://matchharper.com/unsubscribe/mail-1",
};

const text = (input: Partial<CompanyMailCopyInput>) => renderCompanyMail({ ...base, ...input }).text;

test("S1 KO: the count line without 'Harper에', the question, the bullets with the mark on the interested one only", () => {
  const mail = renderCompanyMail(base);
  assert.equal(mail.subject, "백엔드 엔지니어 포지션에 맞는 분들이 있어 연락드려요");
  assert.match(mail.text, /안녕하세요, Company A 채용 담당자님\./);
  assert.match(mail.text, /Harper에서 회사 채용을 돕고 있는 Ashley Kim입니다\./);
  assert.match(mail.text, /Company A의 백엔드 엔지니어 포지션에 맞는 분이 2명 있어 연락드려요\./);
  assert.doesNotMatch(mail.text, /Harper에 2명/);
  assert.match(mail.text, /그중 한 분은 이 포지션에 직접 관심을 보이면서, 지원 전에 하나만 확인하고 싶어 하세요\./);
  assert.match(mail.text, /“미국 밖\(멕시코\)에서 원격으로 일할 수 있나요\?”/);
  assert.match(mail.text, /이 메일에 답장 주시면 제가 그분께 바로 전해드릴게요\./);
  assert.match(mail.text, /백엔드 엔지니어 · 경력 6년 · 멕시코시티 \(직접 관심\)/);
  assert.match(mail.text, /백엔드 엔지니어 · 경력 8년 · 서울\n/);
  assert.doesNotMatch(mail.text, /경력 8년 · 서울 \(직접 관심\)/);
  assert.match(mail.text, /이름과 연락처는 연결을 요청하시면 후보에게 확인한 뒤 이어드려요\./);
  assert.match(mail.text, /2명 자세히 보기/);
  assert.match(mail.text, /Ashley Kim 드림\nTalent Partner, Harper · matchharper\.com/);
  assert.match(mail.html, /org\?gtm=mail-1/);
  assert.match(mail.html, /unsubscribe\/mail-1/);
  // The company name is only ever followed by 의 (no guessed particle).
  assert.doesNotMatch(mail.text, /Company A(은|는|이|가|을|를)/);
});

test("S2 KO: no question, the interest line and the 'reply' line", () => {
  const mail = text({ variant: "S2", questions: [] });
  assert.match(mail, /그중 한 분은 이 포지션에 직접 관심을 보이셨어요\./);
  assert.match(mail, /궁금한 점은 이 메일에 답장 주셔도 돼요\./);
  assert.doesNotMatch(mail, /하나만 확인하고 싶어/);
});

test("S1 EN: 'I know of N people', the first name, (interested)", () => {
  const mail = renderCompanyMail({
    ...base, language: "en", postingTitle: "Backend Engineer", questions: ["Can this role be done remotely from Mexico?"],
    lines: [
      { line1: "Backend Engineer · 6 years · Mexico City", line2: "Built a payments API from scratch", interested: true },
      { line1: "Backend Engineer · 8 years · Seoul", line2: "Led a large settlement system", interested: false },
    ],
  });
  assert.equal(mail.subject, "Candidates for your Backend Engineer role");
  assert.match(mail.text, /Hi Company A team,/);
  assert.match(mail.text, /I'm Ashley from Harper, where I help companies with their hiring\./);
  assert.match(mail.text, /I know of 2 people who'd fit your Backend Engineer role, so I wanted to reach out\./);
  assert.doesNotMatch(mail.text, /Harper has/);
  assert.match(mail.text, /One of them is interested in the role directly and wanted to check one thing before applying:/);
  assert.match(mail.text, /Mexico City \(interested\)/);
  assert.doesNotMatch(mail.text, /Seoul \(interested\)/);
  assert.match(mail.text, /See all 2 candidates/);
});

test("a candidate without a summary consent shows only as 'one more' (KO and EN)", () => {
  const ko = text({ variant: "S2", questions: [], lines: [base.lines[1]], unnamedInterested: 1 });
  assert.match(ko, /직접 관심을 보인 분이 한 분 더 있어요/);
  assert.doesNotMatch(ko, /\(직접 관심\)/);
  const en = renderCompanyMail({ ...base, language: "en", variant: "S2", questions: [], lines: [base.lines[1]], unnamedInterested: 1 }).text;
  assert.match(en, /One more person has shown direct interest in the role/);
});

test("S3: Re: the same subject, the previous N, 'last ones too' only when N grew", () => {
  const input: Partial<CompanyMailCopyInput> = {
    variant: "S3", visible: 3, previousVisible: 2, questions: [], previousSubject: "백엔드 엔지니어 포지션에 맞는 분들이 있어 연락드려요",
    lines: [{ line1: "백엔드 엔지니어 · 경력 4년 · 상파울루", line2: "결제 정산 배치를 Go로 다시 짜서 운영", interested: true, question: "비자 지원이 되나요?" }],
  };
  const mail = renderCompanyMail({ ...base, ...input });
  assert.equal(mail.subject, "Re: 백엔드 엔지니어 포지션에 맞는 분들이 있어 연락드려요");
  assert.match(mail.text, /지난번에 백엔드 엔지니어 포지션에 맞는 분 2명을 소개드렸는데, 그 뒤로 직접 관심을 보인 분이 한 분 더 생겨서 이어서 연락드려요\./);
  assert.match(mail.text, /이분은 “비자 지원이 되나요\?”를 궁금해하세요\. 답장 주시면 전해드릴게요\./);
  assert.match(mail.text, /지난번 분들까지 3명을 여기에 모아뒀어요\./);
  assert.doesNotMatch(mail.text, /Harper에서 회사 채용을 돕고/);
  const same = text({ ...input, visible: 2, previousVisible: 2 });
  assert.match(same, /\n2명을 여기에 모아뒀어요\./);
  assert.doesNotMatch(same, /지난번 분들까지/);
  const en = renderCompanyMail({ ...base, ...input, language: "en", previousSubject: "Candidates for your Backend Engineer role" });
  assert.equal(en.subject, "Re: Candidates for your Backend Engineer role");
  assert.match(en.text, /I've put all 3 candidates, including the ones from my last email, in one place\./);
  assert.match(renderCompanyMail({ ...base, ...input, language: "en", visible: 2 }).text, /I've put all 2 candidates in one place\./);
});

test("at most the bullets given: the copy never adds candidate lines of its own", () => {
  const lines = [1, 2, 3].map((n) => ({ line1: `엔지니어 · 경력 ${n}년`, line2: `한 일 ${n}`, interested: false }));
  const markdown = companyMailMarkdown({ ...base, variant: "S2", questions: [], visible: 7, lines });
  assert.equal((markdown.match(/^- /gm) ?? []).length, 3);
  assert.match(markdown, /7명 자세히 보기/);
});

test("line 1, the subject helpers and an Ashley-written thread mail", () => {
  assert.equal(candidateLine1({ title: "Backend Engineer", years: 6.7, location: "Seoul" }, "en"), "Backend Engineer · 6 years · Seoul");
  assert.equal(candidateLine1({ title: null, years: 0.4, location: null }, "ko"), "경력 1년 미만");
  assert.equal(replySubject("Re: Hello"), "Re: Hello");
  assert.equal(companyMailSubject({ variant: "S3", language: "ko", postingTitle: "PM", previousSubject: null }), "Re: PM 포지션에 맞는 분들이 있어 연락드려요");
  const written = renderWrittenCompanyMail({
    language: "ko", previousSubject: "PM 포지션에 맞는 분들이 있어 연락드려요", body: "답장 감사해요.\n\n관심 보인 분이 한 분 더 생겼어요.",
    visible: 3, senderName: "Ashley Kim", landingUrl: "https://matchharper.com/org?gtm=m", unsubscribeUrl: "https://matchharper.com/u/m",
  });
  assert.equal(written.subject, "Re: PM 포지션에 맞는 분들이 있어 연락드려요");
  assert.match(written.text, /답장 감사해요\./);
  assert.match(written.text, /3명 자세히 보기/);
  assert.match(written.text, /Ashley Kim 드림/);
});
