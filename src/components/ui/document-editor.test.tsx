import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DocumentEditor,
  copyDocumentText,
  formatDocumentLastChangedAt,
  isDocumentPreviewOverflowing,
} from "@/components/ui/document-editor";

test("renders a taller clickable document preview", () => {
  const html = renderToStaticMarkup(
    <DocumentEditor
      aria-label="문서 내용"
      documentTitle="Request"
      lastChangedAt="2026-08-13T12:34:00.000Z"
      placeholder="내용을 작성해 주세요."
      readOnly
      savedValue="첫 문장"
      value="첫 문장"
    />
  );

  assert.match(html, /^<div/);
  assert.match(html, /<button/);
  assert.match(html, /data-document-editor-preview=""/);
  assert.match(html, /min-h-\[340px\]/);
  assert.match(html, /max-h-\[440px\]/);
  assert.match(html, /max-h-\[268px\]/);
  assert.match(html, /rounded-lg/);
  assert.match(html, /border-neutral-1000-a05/);
  assert.match(html, /hover:bg-neutral-100/);
  assert.match(html, />Request</);
  assert.match(html, />첫 문장</);
  assert.doesNotMatch(html, /uppercase|tracking-/);
  assert.doesNotMatch(html, /<textarea/);
  assert.match(html, /마지막 변경: .+, 4 글자/);
});

test("detects preview overflow from its rendered height", () => {
  assert.equal(isDocumentPreviewOverflowing(170, 168), true);
  assert.equal(isDocumentPreviewOverflowing(169, 168), false);
  assert.equal(isDocumentPreviewOverflowing(168, 168), false);
});

test("copies the complete document value", async () => {
  let copied = "";

  await copyDocumentText("첫 문장\n\n**두 번째 문장**", {
    writeText: async (value) => {
      copied = value;
    },
  });

  assert.equal(copied, "첫 문장\n\n**두 번째 문장**");
});

test("fails when clipboard access is unavailable", async () => {
  await assert.rejects(() => copyDocumentText("내용", null));
});

test("renders the placeholder for empty and whitespace-only documents", () => {
  const html = renderToStaticMarkup(
    <DocumentEditor
      documentTitle="Description"
      placeholder="내용을 작성해 주세요."
      readOnly
      savedValue=""
      value="   "
    />
  );

  assert.match(html, /내용을 작성해 주세요\./);
  assert.doesNotMatch(html, />   </);
});

test("renders markdown formatting in a document preview", () => {
  const html = renderToStaticMarkup(
    <DocumentEditor
      documentTitle="Description"
      format="markdown"
      readOnly
      savedValue={"**핵심 업무**\n\n- 제품 개발"}
      value={"**핵심 업무**\n\n- 제품 개발"}
    />
  );

  assert.match(html, /<strong[^>]*>핵심 업무<\/strong>/);
  assert.match(html, /<ul[^>]*>/);
  assert.doesNotMatch(html, /\*\*핵심 업무\*\*/);
});

test("formats recent changes as relative Korean time", () => {
  const now = new Date("2026-08-13T12:00:00.000Z");

  assert.equal(
    formatDocumentLastChangedAt("2026-08-13T11:59:30.000Z", now),
    "방금 전"
  );
  assert.equal(
    formatDocumentLastChangedAt("2026-08-13T11:42:00.000Z", now),
    "18분 전"
  );
  assert.equal(
    formatDocumentLastChangedAt("2026-08-13T05:00:00.000Z", now),
    "7시간 전"
  );
  assert.equal(
    formatDocumentLastChangedAt("2026-08-05T12:00:00.000Z", now),
    "8일 전"
  );
});

test("formats changes from at least ten days ago as a Korean calendar date", () => {
  const now = new Date("2026-08-13T12:00:00.000Z");

  assert.equal(
    formatDocumentLastChangedAt("2026-08-03T12:00:00.000Z", now),
    "2026. 8. 3."
  );
  assert.equal(formatDocumentLastChangedAt(null, now), "-");
  assert.equal(formatDocumentLastChangedAt("not-a-date", now), "-");
});
