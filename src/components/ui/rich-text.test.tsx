import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { convertSlackMrkdwnToWebMarkdown } from "@/lib/org/agent/navigationMarkdown";
import RichText from "./rich-text";

test("Slack candidate introductions keep divider lines from turning full sections into headings", () => {
  const html = renderToStaticMarkup(
    <RichText
      content={convertSlackMrkdwnToWebMarkdown(
        [
          "*TL;DR* - 후보자의 핵심 요약입니다.",
          "",
          "*Harper Note* - 팀과 이해관계자를 조율해 온 경험이 있습니다.",
          "--------",
          "Work Summary:",
          "*Communication Specialist @ Company*",
          "• 출시 커뮤니케이션을 담당했습니다.",
          "------------",
          "",
          "*Preferences:*",
          "• Seoul",
        ].join("\n")
      )}
    />
  );

  assert.doesNotMatch(html, /<h[1-6]\b/);
  assert.equal(html.match(/<hr\b/g)?.length, 2);
  assert.match(html, /<p[^>]*><strong[^>]*>Harper Note<\/strong> - 팀과 이해관계자를 조율해 온 경험이 있습니다\.<\/p>/);
  assert.match(html, /<li[^>]*>출시 커뮤니케이션을 담당했습니다\.<\/li>/);
});

test("does not render a preserved formatting newline after a markdown hard break", () => {
  const html = renderToStaticMarkup(
    <RichText
      content={[
        "**Job Title**  ",
        "Founding Engineer, AI Agent",
        "",
        "**Location**  ",
        "Seoul (On-site)",
      ].join("\n")}
    />
  );

  assert.match(html, /<br\/>Founding Engineer, AI Agent/);
  assert.match(html, /<br\/>Seoul \(On-site\)/);
  assert.doesNotMatch(html, /<br\/>\n/);
});

test("groups standalone bold section titles with the content that follows", () => {
  const html = renderToStaticMarkup(
    <RichText
      content={[
        "**What You'll Do**",
        "- Build the AI agent core.",
        "- Ship the product end to end.",
        "",
        "**Who You Are**  ",
        "- Experienced with production agent systems.",
        "- Strong across the stack.",
      ].join("\n")}
    />
  );

  assert.equal(html.match(/data-rich-text-section-title="true"/g)?.length, 2);
  assert.match(
    html,
    /data-rich-text-section-title="true"><strong[^>]*>Who You Are<\/strong><\/p>\n<ul/
  );
  assert.match(
    html,
    /data-rich-text-section-title\]\)\+:is\(p,ul,ol,blockquote,pre,\[data-rich-text-table\]\)\]:mt-2/
  );
});

test("does not treat a bold label and inline value as a section title", () => {
  const html = renderToStaticMarkup(
    <RichText content={"**Location**  \nSeoul (On-site)"} />
  );

  assert.doesNotMatch(html, /data-rich-text-section-title="true"/);
  assert.match(html, /<strong[^>]*>Location<\/strong><br\/>Seoul \(On-site\)/);
});

test("does not render opportunity run metadata as a link or visible text", () => {
  const html = renderToStaticMarkup(
    <RichText
      content={[
        "검색을 접수했어요.",
        "",
        "[opportunity_run](/career?opportunityRunId=00000000-0000-4000-8000-000000000001&relation=accepted)",
      ].join("\n")}
    />
  );

  assert.match(html, /검색을 접수했어요/);
  assert.doesNotMatch(html, /opportunity_run|opportunityRunId|href=/);
});

test("does not flash a partially streamed opportunity marker", () => {
  const html = renderToStaticMarkup(
    <RichText content={"검색을 접수했어요.\n\n[opportunity_run](/care"} />
  );

  assert.match(html, /검색을 접수했어요/);
  assert.doesNotMatch(html, /opportunity_run|\/care/);
});

test("keeps a single tilde as ordinary range punctuation", () => {
  const html = renderToStaticMarkup(
    <RichText content="시드~시리즈A, 엔지니어 5~20명" />
  );

  assert.match(html, /시드~시리즈A/);
  assert.match(html, /5~20명/);
  assert.doesNotMatch(html, /<del>/);
});

test("keeps explicit double-tilde strikethrough support", () => {
  const html = renderToStaticMarkup(<RichText content="~~이 문장은 취소~~" />);

  assert.match(html, /<del>이 문장은 취소<\/del>/);
});

test("renders underline with Markdown emphasis, quotes and inline code without enabling HTML", () => {
  const html = renderToStaticMarkup(
    <RichText
      content={
        '## 판단\n\n> 중요한 결론\n\n<u>다음 **선택지**</u>와 `production ML`\n\n`<u>literal</u>`\n\n<img src=x onerror="alert(1)">'
      }
    />
  );
  assert.match(html, /<h2/);
  assert.match(html, /<blockquote/);
  assert.match(html, /<u[^>]*>다음 <strong[^>]*>선택지<\/strong><\/u>/);
  assert.match(html, /<code[^>]*>production ML<\/code>/);
  assert.match(html, /&lt;u&gt;literal&lt;\/u&gt;/);
  assert.doesNotMatch(html, /<img|<script/);
  assert.match(html, /&lt;img/);
});

test("reference links preserve exact destinations and accessible source labels", () => {
  const html = renderToStaticMarkup(
    <RichText
      referenceLinks
      content="투자 발표가 있었다. [**공식 발표**](https://example.com/news?round=a#funding)"
    />
  );

  assert.match(html, /data-rich-text-reference="true"/);
  assert.match(html, /href="https:\/\/example.com\/news\?round=a#funding"/);
  assert.match(html, /aria-label="공식 발표 \(example.com\)"/);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /focus-visible:outline-2/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /s2\/favicons\?domain=example.com&amp;sz=32/);
  assert.match(html, /referrerPolicy="no-referrer"/);
  assert.match(html, /text-action/);
  assert.doesNotMatch(html, /bg-bg-weak|domain_url=.*round/);
});

test("references work in tables and standalone source paragraphs with long URLs", () => {
  const html = renderToStaticMarkup(
    <RichText
      referenceLinks
      content={[
        "| 항목 | 출처 |",
        "|---|---|",
        "| 연간 기본급 | [채용 공고](https://jobs.example.com/ml) |",
        "",
        "https://example.com/very/long/path?source=research",
      ].join("\n")}
    />
  );

  assert.equal(html.match(/data-rich-text-reference="true"/g)?.length, 2);
  assert.match(html, /<table/);
  assert.match(html, /aria-label="example.com \(example.com\)"/);
  assert.match(
    html,
    /href="https:\/\/example.com\/very\/long\/path\?source=research"/
  );
});

test("reference styling is opt-in and leaves internal navigation and email handling intact", () => {
  const defaultHtml = renderToStaticMarkup(
    <RichText content="[공식 발표](https://example.com/news)" />
  );
  assert.doesNotMatch(defaultHtml, /data-rich-text-reference/);

  const html = renderToStaticMarkup(
    <RichText
      referenceLinks
      renderEmailLinksAsText
      onHarperLinkClick={() => undefined}
      content="[문서](/career/profile) · [이메일](mailto:hello@example.com)"
    />
  );
  assert.match(html, /<button[^>]*title="\/career\/profile"/);
  assert.match(html, /이메일/);
  assert.doesNotMatch(html, /data-rich-text-reference|<a /);
});

test("reference mode does not enable unsafe protocols or raw HTML", () => {
  const html = renderToStaticMarkup(
    <RichText
      referenceLinks
      content={"[bad](javascript:alert%281%29) <script>alert(1)</script>"}
    />
  );
  assert.doesNotMatch(
    html,
    /href="javascript:|data-rich-text-reference|<script/
  );
});

test("Career Markdown has a larger medium H1 and open-edge tables, without changing the default", () => {
  const content =
    "# Fieldguide\n\n| 시점 | 투자금 |\n|---|---:|\n| 2026년 | 100원 |";
  const career = renderToStaticMarkup(
    <RichText variant="career" content={content} />
  );
  const standard = renderToStaticMarkup(<RichText content={content} />);

  assert.match(career, /<h1[^>]*text-xl font-medium/);
  assert.match(career, /first:pl-0 last:pr-0/);
  assert.match(career, /tr:last-child&gt;td\]:border-b-0/);
  assert.match(career, /<td style="text-align:right"/);
  assert.doesNotMatch(career, /class="border border-/);
  assert.match(standard, /text-base font-semibold/);
  assert.doesNotMatch(standard, /first:pl-0|last:pr-0|text-xl/);
});
