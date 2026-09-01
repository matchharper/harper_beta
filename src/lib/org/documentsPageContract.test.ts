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
const faq = readFileSync(new URL("./serviceFaq.ts", import.meta.url), "utf8");
const markdownRenderer = readFileSync(
  new URL(
    "../../components/org/workspace/OrgDocumentsMarkdown.tsx",
    import.meta.url
  ),
  "utf8"
);
const content = readFileSync(
  new URL("../../content/org-documents.md", import.meta.url),
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

test("Documents exposes every user-facing primary section", () => {
  for (const sectionId of [
    "harper-introduction",
    "getting-started",
    "slack",
    "create-a-role",
    "review-recommendations",
    "accept-or-decline",
    "ask-harper",
    "pipeline",
  ]) {
    assert.match(content, new RegExp(`<!-- id: ${sectionId} -->`));
  }
  assert.match(page, /id="faq"/);
  assert.doesNotMatch(content, /privacy|개인정보|구현 범위|server-side/i);
});

test("Documents renders only the canonical Company FAQ collection", () => {
  assert.match(page, /import \{ COMPANY_SERVICE_FAQ_ITEMS \}/);
  assert.match(page, /COMPANY_SERVICE_FAQ_ITEMS\.map/);
  assert.doesNotMatch(page, /const FAQ_ITEMS =/);
  assert.doesNotMatch(page, /한 역할에 연결 대기 후보자가 5명 이상/);
});

test("Documents keeps primary navigation visible on the right and expands active subsections", () => {
  assert.match(page, /<List aria-hidden="true"/);
  assert.match(page, /<span>문서 내용<\/span>/);
  assert.match(page, /primarySections\.map/);
  assert.match(page, /activePrimarySectionId === section\.id/);
  assert.match(page, /children\.map\(\(child\) => renderLink/);
  assert.match(page, /xl:grid-cols-\[minmax\(0,600px\)_200px\]/);
  assert.match(page, /xl:pl-24/);
  assert.match(page, /2xl:pl-32/);
  assert.doesNotMatch(page, /xl:pl-12/);
  assert.ok(
    page.indexOf("<article") <
      page.indexOf('<aside className="hidden xl:block">')
  );
  assert.match(markdownRenderer, /level: 1 \| 2 \| 3/);
  assert.match(markdownRenderer, /\^\(#\{1,3\}\)/);
});

test("Documents stacks the mobile app bar and section navigation without overlap", () => {
  assert.match(
    sidebar,
    /fixed inset-x-0 top-0 z-50 flex h-12 items-center border-b border-neutral-1000-a05 bg-bg-default/
  );
  assert.doesNotMatch(sidebar, /fixed left-3 top-2 z-50/);
  assert.match(page, /sticky top-12 z-30 -mx-4 -mt-6 mb-12 sm:-mt-9 lg:-mt-10/);
});

test("Documents uses a readable warm black and white typography system", () => {
  assert.match(page, /max-w-\[600px\]/);
  assert.match(markdownRenderer, /text-\[36px\] xl:scroll-mt-12/);
  assert.match(markdownRenderer, /ORG_DOCUMENTS_SECTION_EYEBROWS/);
  for (const eyebrow of [
    "Harper 알아보기",
    "사용 준비",
    "알림과 팀 협업",
    "채용 기준 정리",
    "후보자 검토",
    "연결 결정",
    "후보자 추가 확인",
    "연결 이후 관리",
    "도움말",
  ]) {
    assert.match(markdownRenderer, new RegExp(eyebrow));
  }
  assert.doesNotMatch(markdownRenderer, /= "Organization"/);
  assert.match(markdownRenderer, /as="p"/);
  assert.match(markdownRenderer, /type="eyebrow"/);
  assert.match(markdownRenderer, /normal-case text-primary/);
  assert.match(markdownRenderer, /<h2 className=/);
  assert.match(page, /<h2 className=/);
  assert.match(markdownRenderer, /lead: "mt-2 text-\[18px\]/);
  assert.match(markdownRenderer, /paragraph: "mt-4 text-\[16px\]/);
  assert.match(markdownRenderer, /leading-7 text-\[#403f3f\]/);
  assert.doesNotMatch(`${page}\n${markdownRenderer}`, /neutral-/);
  assert.doesNotMatch(
    `${page}\n${markdownRenderer}`,
    /font-(?:bold|extrabold)/
  );
});

test("Documents visually separates callouts from genuine quotes", () => {
  assert.match(markdownRenderer, /\bInfo\b/);
  assert.match(markdownRenderer, /role="note"/);
  assert.match(
    markdownRenderer,
    /rounded-xl border border-\[#eee7e3\] bg-\[#faf7f5\]/
  );
  assert.match(markdownRenderer, /callout\.icon/);
  assert.match(markdownRenderer, /quote: \{/);
  assert.match(markdownRenderer, /border-l-2 border-\[#d8d1cc\]/);
  assert.doesNotMatch(
    markdownRenderer,
    /container: "mt-6 border-l-2 border-\[#d8d1cc\]/
  );
});

test("Documents uses MuteButton actions and underlined inline navigation", () => {
  assert.match(page, /<MuteButton/);
  assert.match(markdownRenderer, /<MuteButton/);
  assert.match(markdownRenderer, /underline-offset-4/);
  assert.doesNotMatch(page, /<button/);
  assert.doesNotMatch(`${page}\n${markdownRenderer}`, /size="lg"/);
  assert.match(markdownRenderer, /페이지 복사/);
  assert.match(markdownRenderer, /size="md"/);
  assert.match(page, /navigator\.clipboard\.writeText/);
});

test("Documents provides reusable callout, quote, example, and action formats", () => {
  for (const directive of ["callout", "quote", "example", "action"]) {
    assert.match(content, new RegExp(`\`\`\`${directive}`));
  }
  assert.match(content, /\/invite @Harper/);
  assert.match(markdownRenderer, /directive\?\.language === "callout"/);
  assert.match(markdownRenderer, /directive\?\.language === "quote"/);
  assert.match(markdownRenderer, /directive\?\.language === "example"/);
  assert.match(markdownRenderer, /directive\?\.language === "action"/);
});

test("the post-registration flow explains the company’s next steps", () => {
  assert.match(content, /화면을 계속 열어둘 필요는 없습니다/);
  assert.match(content, /대화할 마음이 있는지 확인합니다/);
  assert.match(content, /후보자는 회사의 답을 기다립니다/);
  assert.match(content, /Slack과 \[Inbox\]/);
  assert.match(content, /관심이 없는 사람은 검토 목록에 들어오지 않습니다/);
});

test("the introduction explains Harper's candidate introduction model", () => {
  assert.match(content, /단순히 검색 조건에 맞는 사람의 목록이 아닙니다/);
  assert.match(
    content,
    /프로필만으로 역할을 판단하는 데 중요한 정보가 부족하면/
  );
  assert.match(content, /실제로 이 회사와 대화해 보고 싶다는 의사/);
  assert.match(content, /마지막 검토까지 마친 분만 회사에 소개/);
  assert.match(content, /회사가 검토할 차례입니다/);
});

test("connection decisions explain what happens to the candidate", () => {
  assert.match(content, /후보자는 이미 동의했습니다/);
  assert.match(content, /이 회사와 대화해도 좋다고 답한 상태/);
  assert.match(content, /소개 이메일은 발송되지 않고/);
  assert.match(
    content,
    /종료 결정이 후보자에게 표시되고 Harper가 이를 안내해요/
  );
  assert.match(
    content,
    /이미 후보자에게 보이거나 전달된 안내는 회수할 수 없습니다/
  );
  assert.match(
    content,
    /Reject reason은 선택 사항이며 후보자에게 그대로 보내지지/
  );
  assert.doesNotMatch(content, /웹에도 바로 반영|한 번만 처리|중복 처리/);
});

test("Documents explains the work instead of exposing implementation language", () => {
  assert.match(content, /공고가 있을 때와 없을 때/);
  assert.match(content, /연결 대기에 오기까지/);
  assert.match(content, /Pipeline에 들어오는 시점/);
  assert.match(content, /후보자에게 전달되기 전/);
  assert.match(content, /확인 전에는 보내지 않습니다/);
  assert.doesNotMatch(content, /Harper chat|프로세스|모달|동기화|상태 변경/);
});

test("Documents offers direct Harper team support after FAQ", () => {
  assert.match(
    page,
    /문의하기를 통해 Harper 팀에 직접 문의를 남겨주시면 최대한 빠르게/
  );
  assert.doesNotMatch(page, /프로필 메뉴의 문의하기를 열어주세요/);
});

test("removed FAQ entries stay removed while practical questions are covered", () => {
  assert.doesNotMatch(faq, /정보가 부족해서 결정하기 어려워요/);
  assert.doesNotMatch(faq, /거절한 후보자를 다시 연결할 수 있나요/);
  assert.doesNotMatch(faq, /누가 후보자의 연결 여부를 결정할 수 있나요/);
  assert.match(faq, /Owner, Admin, Viewer 권한은 어떻게 다른가요/);
  assert.match(faq, /Email intro 수신자가 궁금해요/);
  assert.match(faq, /잠깐 중단하는 것과 완전히 종료하는 것은/);
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

test("profile menus link to Calendar settings directly below Documents", () => {
  const documentsItem = /Documents\s*<\/DropdownMenuItem>/g;
  const calendarNavigation =
    /onSelect=\{\(\) => void router\.push\(calendarSettingsHref\)\}/g;
  assert.equal(sidebar.match(documentsItem)?.length, 2);
  assert.equal(sidebar.match(calendarNavigation)?.length, 2);
  assert.match(sidebar, /src="\/images\/logos\/calendar\.png"/);
  assert.match(sidebar, /Documents\s*<\/DropdownMenuItem>[\s\S]*?일정 저장/);
});
