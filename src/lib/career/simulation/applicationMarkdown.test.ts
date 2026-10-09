import test from "node:test";
import assert from "node:assert/strict";
import { renderableApplicationMarkdown } from "./applicationMarkdown";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";

test("resume and cover letter code wrappers render as headings, bold and lists", () => {
  for (const language of ["", "markdown", "md", "text", "plaintext"]) {
    const source = `Here is the revision.\n\n\`\`\`${language}\n# Candidate\n\n**Experience**\n- Built APIs\n\`\`\`\n\nUpload the final file.`;
    const text = renderableApplicationMarkdown(source);
    const html = renderToStaticMarkup(React.createElement(ReactMarkdown, null, text));
    assert.match(html, /<h1>Candidate<\/h1>/);
    assert.match(html, /<strong>Experience<\/strong>/);
    assert.match(html, /<li>Built APIs<\/li>/);
    assert.doesNotMatch(html, /<pre/);
    assert.match(html, /Upload the final file/);
  }
});
test("normal Markdown and actual programming examples retain their content", () => {
  const text = '# Resume\n\n```typescript\nconst value = 1;\n```\n\n~~~md\n## Letter\n~~~';
  assert.equal(renderableApplicationMarkdown(text), '# Resume\n\n```typescript\nconst value = 1;\n```\n\n## Letter');
  assert.equal(renderableApplicationMarkdown('# Resume\n**Engineer**'), '# Resume\n**Engineer**');
});


test("application replies discard legacy binary choice payloads without touching prose", () => {
  assert.equal(renderableApplicationMarkdown('Next step.\n[[CAREER_CHOICE_BUTTONS]]{"choices":["Retry","Stop"]}[[/CAREER_CHOICE_BUTTONS]]'), 'Next step.\n');
  assert.equal(renderableApplicationMarkdown('Next step.\n[[CAREER_CHOICE_BUTTONS]]{"choices":'), 'Next step.\n');
});
