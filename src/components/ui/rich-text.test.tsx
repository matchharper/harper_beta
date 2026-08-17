import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import RichText from "./rich-text";

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
