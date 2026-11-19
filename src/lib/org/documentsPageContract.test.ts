import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { COMPANY_SERVICE_FAQ_ITEMS } from "./serviceFaq";
import { ko } from "@/i18n/org/ko";
import { en } from "@/i18n/org/en";

const content = readFileSync(
  new URL("../../content/org-documents.md", import.meta.url),
  "utf8"
);
const englishContent = readFileSync(
  new URL("../../content/org-documents.en.md", import.meta.url),
  "utf8"
);

const documentDestinations = (body: string) =>
  [...body.matchAll(/^(#{1,3})\s+.+?<!-- id: ([\w-]+) -->$/gm)].map(
    ([, heading, id]) => ({ id, level: heading.length })
  );

test("Korean and English Documents preserve the same navigation destinations", () => {
  const koreanHeadings = documentDestinations(content);
  const englishHeadings = documentDestinations(englishContent);

  assert.deepEqual(koreanHeadings, englishHeadings);
  assert.equal(
    new Set(koreanHeadings.map(({ id }) => id)).size,
    koreanHeadings.length
  );

  for (const body of [content, englishContent]) {
    const headingIds = new Set(documentDestinations(body).map(({ id }) => id));
    for (const [, target] of body.matchAll(/\]\(#([^)]*)\)/g)) {
      if (target.startsWith("org-")) {
        assert.ok(
          [
            "company",
            "members",
            "slack",
            "newRole",
            "inbox",
            "calendar",
            "pipeline",
          ].includes(target.slice(4)),
          target
        );
      } else {
        assert.ok(headingIds.has(target), target);
      }
    }
  }
});

test("each canonical FAQ has synchronized Korean copy and an English translation", () => {
  for (const item of COMPANY_SERVICE_FAQ_ITEMS) {
    const questionKey = `faq.${item.key}.question` as keyof typeof ko;
    const answerKey = `faq.${item.key}.answer` as keyof typeof ko;
    assert.equal(ko[questionKey], item.question, questionKey);
    assert.equal(ko[answerKey], item.answer, answerKey);
    assert.ok(en[questionKey]?.trim(), questionKey);
    assert.ok(en[answerKey]?.trim(), answerKey);
    assert.notEqual(en[answerKey], ko[answerKey], answerKey);
  }
});
