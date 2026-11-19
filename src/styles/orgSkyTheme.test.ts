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

test("company-only rules cannot reach a candidate screen", () => {
  const css = read("org-floating-sky.css");
  assert.ok(!css.includes("data-career-theme"));
  for (const list of selectors(css)) {
    for (const selector of list.split(",").map((value) => value.trim())) {
      assert.match(selector, /\.org-|data-harper-theme|data-org-/, selector);
    }
  }
});
