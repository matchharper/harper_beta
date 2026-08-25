import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Code } from "./code";

test("Code renders compact inline code by default", () => {
  const markup = renderToStaticMarkup(<Code>/invite @Harper</Code>);

  assert.match(markup, /^<code /);
  assert.match(markup, /text-\[0\.9em\]/);
  assert.match(markup, />\/invite @Harper<\/code>$/);
});

test("Code renders a preformatted block when requested", () => {
  const markup = renderToStaticMarkup(
    <Code type="block">{"first line\nsecond line"}</Code>
  );

  assert.match(markup, /^<pre /);
  assert.match(markup, /overflow-x-auto/);
  assert.match(markup, /<code>first line\nsecond line<\/code><\/pre>$/);
});
