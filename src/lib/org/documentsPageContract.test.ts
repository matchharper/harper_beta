import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(
  new URL(
    "../../components/org/workspace/pages/OrgDocumentsPage.tsx",
    import.meta.url
  ),
  "utf8"
);
const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const sidebar = readFileSync(
  new URL(
    "../../components/org/workspace/OrgWorkspaceSidebar.tsx",
    import.meta.url
  ),
  "utf8"
);

test("Documents exposes every user-facing section with black and white styling", () => {
  for (const sectionId of [
    "getting-started",
    "slack",
    "create-a-role",
    "review-recommendations",
    "accept-or-decline",
    "ask-harper",
    "pipeline",
    "faq",
  ]) {
    assert.match(page, new RegExp(`id: \"${sectionId}\"`));
  }
  assert.match(page, /sticky top-10/);
  assert.match(page, /translate-x-1 text-black/);
  assert.doesNotMatch(page, /neutral-/);
  assert.doesNotMatch(page, /font-(?:bold|semibold)/);
  assert.doesNotMatch(page, /privacy|개인정보|구현 범위|server-side/i);
});

test("Documents uses MuteButton actions and underlined inline navigation", () => {
  assert.match(page, /<MuteButton/);
  assert.match(page, /function DocumentLink/);
  assert.match(page, /underline decoration-black\/30 underline-offset-4/);
  assert.doesNotMatch(page, /<button/);
});

test("Documents keeps a narrow navigation and a readable left-aligned body", () => {
  assert.match(page, /w-full max-w-none bg-white/);
  assert.equal(page.match(/grid-cols-\[144px_minmax\(0,1fr\)\]/g)?.length, 2);
  assert.equal(page.match(/max-w-\[840px\]/g)?.length, 2);
  assert.doesNotMatch(
    page,
    /minmax\(0,680px\)|max-w-\[640px\]|max-w-\[620px\]/
  );
});

test("Documents provides reusable emphasis, callout, quote, and code formats", () => {
  assert.match(page, /function DocumentStrong/);
  assert.match(page, /<strong className="font-medium text-black"/);
  assert.match(page, /function DocumentCallout/);
  assert.match(page, /function DocumentQuote/);
  assert.match(page, /<blockquote/);
  assert.match(page, /label = "입력 예시"/);
  assert.match(page, /“결제 플랫폼 팀의 백엔드 엔지니어를 찾고 있어/);
  assert.match(page, /function DocumentCodeBlock/);
  assert.match(page, /<pre className=/);
  assert.match(page, /<code className="font-mono whitespace-pre-wrap"/);
  assert.match(page, /\/invite @Harper/);
});

test("the post-registration flow explains the company’s next steps", () => {
  assert.match(page, /화면을 계속 열어둘\s*필요는 없습니다/);
  assert.match(page, /대화할 마음이 있는지\s*확인합니다/);
  assert.match(page, /후보자는 회사의 답을 기다립니다/);
  assert.match(page, /Slack과 <DocumentLink href=\{href\.inbox\}>Inbox/);
  assert.match(page, /관심이 없는 사람은 검토 목록에 들어오지 않습니다/);
});

test("connection decisions explain what happens to the candidate", () => {
  assert.match(page, /후보자는 이미 동의했습니다/);
  assert.match(page, /이 회사와 대화해도\s*좋다고 답한 상태/);
  assert.match(page, /Harper는 소개 메일을 보내지 않습니다/);
  assert.match(page, /이번 연결이 진행되지 않는다고 안내합니다/);
  assert.match(page, /거절 이유는 선택 사항이며 후보자에게 그대로 보내지지/);
  assert.doesNotMatch(page, /웹에도 바로 반영|한 번만 처리|중복 처리/);
});

test("Documents explains the work instead of exposing implementation language", () => {
  assert.match(page, /공고가 있을 때와 없을 때/);
  assert.match(page, /연결 대기에 오기까지/);
  assert.match(page, /Pipeline에 들어오는 시점/);
  assert.match(page, /부탁을 분명하게 쓰는 법/);
  assert.doesNotMatch(page, /Harper chat|프로세스|모달|동기화|상태 변경/);
});

test("removed FAQ entries stay removed while practical questions are covered", () => {
  assert.doesNotMatch(page, /정보가 부족해서 결정하기 어려워요/);
  assert.doesNotMatch(page, /거절한 후보자를 다시 연결할 수 있나요/);
  assert.match(page, /누가 후보자를 수락하거나 거절할 수 있나요/);
  assert.match(page, /소개 메일은 누구에게 가나요/);
  assert.match(page, /역할을 잠시 중단하면 기존 후보자는 어떻게 되나요/);
});

test("Documents replaces Help and remains directly below 문의하기", () => {
  assert.match(routes, /documents: "\/org\/documents"/);
  assert.doesNotMatch(routes, /help: "\/org\/help"/);
  const inquiryIndex = sidebar.indexOf("문의하기");
  const documentsIndex = sidebar.indexOf("Documents", inquiryIndex);
  assert.ok(inquiryIndex >= 0);
  assert.ok(documentsIndex > inquiryIndex);
});

test("profile menu Documents items navigate explicitly", () => {
  const explicitNavigation =
    /onSelect=\{\(\) => void router\.push\(navHref\("documents"\)\)\}/g;
  assert.equal(sidebar.match(explicitNavigation)?.length, 2);
  assert.doesNotMatch(
    sidebar,
    /<DropdownMenuItem asChild>\s*<Link href=\{navHref\("documents"\)\}>/
  );
});
