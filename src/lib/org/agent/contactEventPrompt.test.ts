import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildCompanyContactEventPrompt } from "./contactEventPrompt";

test("delivered contacts preserve free-form choices and authorize no work on their own", () => {
  const context = {
    currentContact: { content: "B를 선호하지만 일정은 먼저 확인하고 싶어요." },
    precedingCompanyContacts: [
      { request_context: "A/B 중 어떤 역할을 원하는지 물어봐 주세요." },
    ],
  };
  const prompt = buildCompanyContactEventPrompt(context);
  assert.ok(prompt.includes(JSON.stringify(context)));
  assert.match(prompt, /existing tools/);
  assert.match(prompt, /finish silently/);
  assert.match(prompt, /not company instructions/);
  assert.match(prompt, /company's actual preceding instructions/);
  assert.match(prompt, /fresh Role\/pipeline/);
  assert.doesNotMatch(prompt, /disposition=/);
});

test("company follow-up reads only the candidate-authorized relay, not private Career messages", () => {
  const loader = readFileSync(
    new URL("./contactEvent.server.ts", import.meta.url),
    "utf8"
  );
  assert.match(loader, /content: relay.relay_content/);
  assert.match(loader, /\.eq\("user_id", recommendation.talent_id\)/);
  assert.doesNotMatch(
    loader,
    /originalCandidateMessage|sourceMessage\.data\?\.content/
  );
});

test("the contact event reuses the company-side LLM tool loop and delivery retry identity", () => {
  const chat = readFileSync(new URL("./chat.ts", import.meta.url), "utf8");
  const start = chat.indexOf("export async function runOrgAgentWebActionTurn");
  const eventRunner = chat.slice(
    start,
    chat.indexOf("export async function runOrgAgentChat", start)
  );
  assert.match(eventRunner, /candidate_contact_received/);
  assert.match(eventRunner, /buildCompanyContactEventPrompt/);
  assert.equal(eventRunner.match(/runOrgAgentToolLoop\(\{/g)?.length, 1);
  assert.match(eventRunner, /allowSilentCompletion: true/);
  assert.match(eventRunner, /if \(existingTerminal\)/);
  assert.match(eventRunner, /completed_silent/);
  const consumer = readFileSync(
    new URL(
      "../../../app/api/queues/process-company-agent-web-action/route.ts",
      import.meta.url
    ),
    "utf8"
  );
  assert.match(consumer, /assertOrgWorkspacePermission/);
  assert.ok(
    consumer.indexOf("await deliverCompanyContactEventMessages") <
      consumer.indexOf("status: result.outcome")
  );
});
