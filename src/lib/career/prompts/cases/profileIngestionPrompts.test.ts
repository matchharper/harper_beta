import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCareerProfileIngestionSystemPrompt,
  buildCareerProfileUpdateMergeSystemPrompt,
} from "./profileIngestionPrompts";

for (const [name, buildPrompt] of [
  ["initial ingestion", buildCareerProfileIngestionSystemPrompt],
  ["profile update merge", buildCareerProfileUpdateMergeSystemPrompt],
] as const) {
  test(`${name} keeps experience and club classification grounded`, () => {
    const prompt = buildPrompt();

    assert.match(prompt, /source supports it as company employment/);
    assert.match(prompt, /explicitly presents as work\/experience/);
    assert.match(prompt, /master's\/doctoral work/);
    assert.match(prompt, /Never invent an experience/);
    assert.match(prompt, /club entry with substantive details in extras/);
    assert.match(prompt, /simple club name.*education description/);
  });
}
