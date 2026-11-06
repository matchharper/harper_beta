import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (file: string) =>
  readFileSync(path.join(here, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Every selector list in a stylesheet, including those inside @media. */
function selectors(css: string) {
  return [...css.matchAll(/([^{}]+)\{/g)]
    .map((match) => match[1].trim())
    .filter((selector) => selector && !selector.startsWith("@"));
}

// The company workspace turns the candidate side's theme on with its own
// attribute. Pairing the two in one :is()/:has() list keeps every career
// rule's specificity, so candidate screens render exactly as before.
test("each sky theme selector names the career and the company attribute together", () => {
  const css = read("career-floating-sky.css");
  const career = css.match(/\[data-career-theme="sky"\]/g)?.length ?? 0;
  const paired =
    css.match(/\[data-career-theme="sky"\], \[data-harper-theme="sky"\]\)/g)?.length ?? 0;
  assert.ok(career > 10);
  assert.equal(paired, career, "a career-only theme selector would leave the company screens out");
  assert.equal(css.match(/\[data-harper-theme="sky"\]/g)?.length, career);
  for (const selector of selectors(css).filter((value) => value.includes("data-career-theme"))) {
    assert.match(selector, /(:is|:has)\(\[data-career-theme="sky"\], \[data-harper-theme="sky"\]\)/, selector);
  }
});

test("company-only rules cannot reach a candidate screen", () => {
  const css = read("org-floating-sky.css");
  assert.ok(!css.includes("data-career-theme"));
  for (const list of selectors(css)) {
    for (const selector of list.split(",").map((value) => value.trim())) {
      assert.match(selector, /\.org-|data-harper-theme|data-org-/, selector);
    }
  }
});
