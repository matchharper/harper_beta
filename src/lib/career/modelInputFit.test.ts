import assert from "node:assert/strict";
import test from "node:test";

import {
  CAREER_SINGLE_INPUT_TOKEN_LIMIT,
  describeCareerInputFit,
  fitCareerHistoryToModel,
  fitCareerInputText,
  readableTextOf,
} from "./modelInputFit";

const page = (body: string) => `I'd need more opportunities as per the following:

<!DOCTYPE html><html><head><style>.a{color:red}${"x".repeat(2_000)}</style>
<script>var y = 1;</script></head><body><div><h1>PPP Earnings &amp; Visas</h1>
<p>Your salary equals $14.9k/mo PPP.</p><img src="data:image/png;base64,${"QUJD".repeat(5_000)}">
<p>${body}</p></div></body></html>`;

test("the limit is a quarter of the smallest documented Career model input", () => {
  assert.equal(CAREER_SINGLE_INPUT_TOKEN_LIMIT, 230_500);
});

test("readable text drops markup, style, scripts and embedded files", () => {
  const text = readableTextOf(page("Only GCC roles beat it.")).text;
  assert.match(text, /I'd need more opportunities as per the following:/);
  assert.match(text, /PPP Earnings & Visas/);
  assert.match(text, /Only GCC roles beat it\./);
  assert.doesNotMatch(text, /color:red|var y|base64|QUJD|<p>/);
});

test("input within the limit is returned unchanged", () => {
  const original = page("short");
  const fit = fitCareerInputText(original, 50_000);
  assert.equal(fit.text, original);
  assert.equal(fit.reduced, undefined);
  assert.equal(describeCareerInputFit(fit), original);
});

test("an oversized page keeps all of its readable text and says so", () => {
  const original = page("Only GCC roles beat it.");
  const fit = fitCareerInputText(original, 2_000);
  assert.equal(fit.reduced?.readableOnly, true);
  assert.equal(fit.reduced?.originalChars, original.length);
  const described = describeCareerInputFit(fit);
  assert.match(described, /markup, style code and embedded files were removed/);
  assert.match(described, /Only GCC roles beat it\./);
});

test("oversized readable text keeps its beginning and states the omission", () => {
  const original = `Start here. ${"word ".repeat(20_000)}End here.`;
  const fit = fitCareerInputText(original, 1_000);
  assert.equal(fit.reduced?.readableOnly, false);
  assert.ok(fit.text.startsWith("Start here."));
  assert.doesNotMatch(fit.text, /End here\./);
  assert.match(describeCareerInputFit(fit), /Only its first .* readable characters follow/);
});

test("history fits the model by leaving out the oldest messages first", () => {
  // Every whitespace-separated "a" is one token; 300k tokens per message.
  const big = "a ".repeat(300_000);
  const messages = [
    { role: "user", content: "summary of earlier conversation" },
    { role: "user", content: big },
    { role: "assistant", content: big },
    { role: "user", content: big },
    { role: "user", content: "current question" },
  ];
  const result = fitCareerHistoryToModel({
    model: "gpt-6.1-terra",
    systemText: "system",
    toolsText: "[]",
    messages,
    isSummary: message => message === messages[0],
  });
  assert.ok(result.omitted >= 1);
  assert.equal(result.messages[0].content, "summary of earlier conversation");
  assert.equal(result.messages.at(-1)?.content, "current question");
  assert.match(result.messages[1].content, /earlier message.* left out of this conversation history/);
});

test("history within the limit, or for a model without a documented limit, is unchanged", () => {
  const messages = [{ role: "user", content: "hello" }];
  assert.deepEqual(fitCareerHistoryToModel({ model: "gpt-6.1-terra", systemText: "", toolsText: "", messages }),
    { messages, omitted: 0 });
  const huge = [{ role: "user", content: "a ".repeat(1_000_000) }, { role: "user", content: "now" }];
  assert.equal(fitCareerHistoryToModel({ model: "z-ai/glm-5.3-flash", systemText: "", toolsText: "", messages: huge }).omitted, 0);
});
