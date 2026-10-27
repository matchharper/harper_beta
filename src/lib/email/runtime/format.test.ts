import assert from "node:assert/strict";
import { test } from "node:test";
import { renderReplyEmail, emailVisibleMarkdown } from "./format";

test("email renders nested Markdown, tables, quotes and literal code in both parts", () => {
  const email = renderReplyEmail(
    "## 확인한 내용\n\n**역할**과 _조건_입니다.\n\n- 첫 항목\n  - 하위 항목\n\n> 받은 안내\n\n| 항목 | 값 |\n|---|---|\n| 지역 | 서울 |\n\n```text\na_b <literal>\n```\n\n[상세](https://example.com/a_(b))"
  );
  assert.match(email.html, /<h2/);
  assert.match(email.html, /<strong>역할<\/strong>/);
  assert.match(email.html, /<ul[\s\S]*<ul/);
  assert.match(email.html, /<blockquote/);
  assert.match(email.html, /<table/);
  assert.match(email.html, /<meta charset="utf-8">/);
  assert.match(email.html, /overflow-wrap:break-word;word-break:normal/);
  assert.match(email.html, /a_b (?:&lt;|&#x3C;)literal(?:&gt;|>)/);
  assert.doesNotMatch(email.html, /<literal>/);
  assert.match(email.text, /a_b <literal>/);
  assert.match(email.text, /상세 \(https:\/\/example.com\/a_\(b\)\)/);
  assert.doesNotMatch(email.text, /\*\*역할\*\*|\|---|```/);
});
test("email escapes dangerous HTML and URLs, and does not load images", () => {
  const email = renderReplyEmail(
    "[bad](javascript:alert%281%29)\n\n<script>alert(1)</script>\n\n![tracking](https://example.com/track.png)\n\n[mail](mailto:test@example.com)"
  );
  assert.doesNotMatch(email.html, /javascript:|<script|<img/);
  assert.match(email.html, /mailto:test@example.com/);
});
test("web posting IDs become usable email links and relative URLs retain their path", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const email = renderReplyEmail(
    `[posting](${id})\n\n[프로필](/career/profile?profileSection=links)`
  );
  assert.match(
    email.text,
    /https:\/\/matchharper.com\/career\/history\?historyTab=new&id=/
  );
  assert.match(
    email.html,
    /https:\/\/matchharper.com\/career\/profile\?profileSection=links/
  );
});
test("app control payloads never appear as email body and footer is added only when requested", () => {
  const source =
    '답변입니다.\n\n[[CAREER_CHOICE_BUTTONS]]\n{"choices":["네","아니요"]}\n[[/CAREER_CHOICE_BUTTONS]]';
  assert.equal(emailVisibleMarkdown(source), "답변입니다.");
  assert.doesNotMatch(renderReplyEmail(source).text, /chris@/);
  assert.match(
    renderReplyEmail(source, { footer: true }).text,
    /chris@matchharper.com/
  );
});

test("partial and inherited web controls are removed without changing ordinary Markdown", () => {
  const body =
    'Text **kept**.\n[[MOCK_INTERVIEW:00000000-0000-4000-8000-000000000001]]\n[[APPLICATION_START_OFFER]]{"roleId":"r"}[[/APPLICATION_START_OFFER]]\n[[CAREER_CHOICE_BUTTONS]]{"choices":';
  assert.equal(emailVisibleMarkdown(body), "Text **kept**.");
});

test("plain text keeps one table row per line and prints bare URLs only once", () => {
  const url = "https://example.com/continue?token=synthetic&next=career";
  const email = renderReplyEmail(
    `| Item | Value |\n|---|---|\n| Work | Hybrid |\n| Pay | Unknown |\n\n${url}\n\n[Continue](${url})`
  );
  assert.match(email.text, /Item \| Value\nWork \| Hybrid\nPay \| Unknown/);
  assert.ok(email.text.includes(`${url}\n\nContinue (${url})`));
  assert.doesNotMatch(
    email.text,
    /token=synthetic[^\n]*\(https:\/\/example.com/
  );
});

test("both email parts preserve ordered starts, task checks, entities and literal Unicode code", () => {
  const email = renderReplyEmail("3. A & B\n4. 다음\n   - 하위\n\n- [x] 완료\n- [ ] 대기\n\n```text\n한글 <value> & raw\n```", { audience: "company" });
  assert.match(email.html, /<ol start="3"/);
  assert.match(email.text, /3\. A & B\n4\. 다음\n+  • 하위/);
  assert.match(email.text, /☑\s+완료/);
  assert.match(email.text, /☐\s+대기/);
  assert.match(email.text, /한글 <value> & raw/);
  assert.doesNotMatch(email.html, /<input|<value>/);
});

test("company navigation is rendered as real workspace links in HTML and text", async () => {
  const { renderCompanyReplyEmail } = await import("./format");
  const result = renderCompanyReplyEmail("[역할](role:role-123) [목록](roles)", "workspace-123");
  assert.match(result.html, /orgId=workspace-123/);
  assert.match(result.text, /roleId=role-123/);
  assert.doesNotMatch(result.html, /href="role:|href="https:\/\/matchharper.com\/roles"/);
});
