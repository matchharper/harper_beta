import assert from "node:assert/strict";
import test from "node:test";
import {
  extractCareerDocumentLinks,
  formatCareerDocumentLink,
} from "./documentLinks";

const document = {
  id: "aaaa1111-2222-4333-8444-555555555555",
  title: "A [B] \\ 합류 검토.md",
};

test("round-trips document titles and renders duplicate references only once", () => {
  const link = formatCareerDocumentLink(document);
  const parsed = extractCareerDocumentLinks(`보고서\n\n${link}\n${link}`);
  assert.deepEqual(parsed.documents, [document]);
  assert.equal(parsed.content, "보고서");
});

test("keeps ordinary links, invalid IDs and code examples as text", () => {
  const link = formatCareerDocumentLink(document);
  const content = `[외부](https://example.com)\n[잘못된 ID](documentId:not-an-id)\n\n\`\`\`md\n${link}\n\`\`\`\n\n    ${link}`;
  assert.deepEqual(extractCareerDocumentLinks(content), {
    content,
    documents: [],
  });
});
