import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { ApplicationQuestionFields } from "./ApplicationQuestionFields";
import type { ApplicationQuestion } from "@/lib/ops/applicationQuestions";
const field = (
  type: string,
  extra: Partial<ApplicationQuestion> = {}
): ApplicationQuestion => ({
  label: `Question ${type}`,
  type,
  required: null,
  options: [],
  fileTypes: [],
  multiple: null,
  instructions: "",
  ...extra,
});

test("typed fields render accessible local inputs without an external form or invented choices", () => {
  const html = renderToStaticMarkup(
    <ApplicationQuestionFields
      questions={[
        field("email", { required: true }),
        field("tel"),
        field("textarea"),
        field("radio", { options: ["Seoul", "Remote"] }),
        field("checkbox", { options: ["Python", "Go"] }),
        field("checkbox", { label: "동의 항목" }),
        field("select"),
        field("multiselect"),
        field("file-or-url", { fileTypes: [".pdf"], multiple: true }),
        field("unknown"),
        field("submit"),
      ]}
    />
  );
  assert.match(html, /type="email"/);
  assert.match(html, /type="tel"/);
  assert.match(html, /<textarea/);
  assert.match(html, /Seoul/);
  assert.match(html, /Remote/);
  assert.match(html, /Python/);
  assert.match(html, /Go/);
  assert.match(html, /동의 항목/);
  assert.match(html, /accept=".pdf"/);
  assert.match(html, /multiple=""/);
  assert.match(html, /선택지 미확인/);
  assert.match(html, /미리보기를 지원하지 않습니다/);
  assert.doesNotMatch(html, /<form|type="submit"|action=/);
});
