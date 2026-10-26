import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOrgAgentRollingToolContext,
  canCompactOrgAgentRead,
  fitOrgAgentToolResultToBudget,
  fitOrgAgentDiagnosticSupplements,
  ORG_AGENT_MAX_TOTAL_TOOL_RESULT_CHARS,
  ORG_AGENT_TOOL_RESULT_BUDGET_MARKER,
} from "@/lib/org/agent/toolResultBudget";

test("rolling context keeps protocol pairs, exact action/failed results and the latest read while preserving the transcript", () => {
  const page = `status=ok\nurl=https://example.com/source\n<page_markdown>\n${"source body ".repeat(1000)}\n</page_markdown>`;
  const action = "status=confirmation_required\npreview=Exact approved text\nref=draft-1\nrevision=3\nidempotency_key=key-1";
  const failure = "outcome=uncertain\neffect_status=unknown\nreason=delivery failed";
  const messages = [
    { role: "assistant", content: null, tool_calls: [{ id: "read-1" }] },
    { role: "tool", name: "open_url", tool_call_id: "read-1", content: page },
    { role: "assistant", content: null, tool_calls: [{ id: "write-1" }] },
    { role: "tool", name: "contact_talent", tool_call_id: "write-1", content: action },
    { role: "tool", name: "open_url", tool_call_id: "failed-1", content: failure },
    { role: "tool", name: "open_url", tool_call_id: "read-2", content: page.replace("source body", "new source") },
  ];
  const original = structuredClone(messages);
  const result = buildOrgAgentRollingToolContext({ messages, compactableResultIndexes: new Set([1, 3, 5]), targetChars: 1000 });
  assert.deepEqual(messages, original);
  assert.equal(result.messages.length, messages.length);
  assert.deepEqual(result.messages[0], original[0]);
  assert.match(String(result.messages[1].content), /context_detail_complete=false/);
  assert.match(String(result.messages[1].content), /https:\/\/example.com\/source/);
  assert.equal(result.messages[3].content, action);
  assert.equal(result.messages[4].content, failure);
  assert.equal(result.messages[5].content, messages[5].content);
  assert.deepEqual(result.compactedCallIds, ["read-1"]);
  assert.ok(result.toolResultChars > 1000, "protected evidence may exceed the soft target");
});

test("list compaction retains candidate IDs, criteria, current state and pagination without prefix slicing", () => {
  const content = `status=ok\noffset=50 has_more=true total=5000\n<matches>\ntalent_id\trole_id\theadline\tcurrent_company_stage\tcriteria\ncandidate-1\trole-1\t${"long headline ".repeat(100)}\tconnected\tM: 12\n</matches>`;
  const result = buildOrgAgentRollingToolContext({ messages: [
    { role: "tool", name: "get_talents", tool_call_id: "list-1", content },
    { role: "tool", name: "read_talent", tool_call_id: "last", content: "status=ok" },
  ], compactableResultIndexes: new Set([0, 1]), targetChars: 10 });
  const compact = result.messages[0].content;
  assert.match(compact, /offset=50 has_more=true total=5000/);
  assert.match(compact, /candidate-1\trole-1\tconnected\tM: 12/);
  assert.doesNotMatch(compact, /long headline/);
});

test("every result in the newest parallel tool round reaches the model intact", () => {
  const page=(name:string)=>`url=https://example.com/${name}\n<page_markdown>\n${name.repeat(5000)}\n</page_markdown>`;
  const messages=[
    {role:"assistant",content:null,tool_calls:[{id:"old"}]},
    {role:"tool",name:"open_url",tool_call_id:"old",content:page("old")},
    {role:"assistant",content:null,tool_calls:[{id:"fresh-1"},{id:"fresh-2"}]},
    {role:"tool",name:"open_url",tool_call_id:"fresh-1",content:page("fresh-1")},
    {role:"tool",name:"open_url",tool_call_id:"fresh-2",content:page("fresh-2")},
  ];
  const result=buildOrgAgentRollingToolContext({messages,compactableResultIndexes:new Set([1,3,4]),targetChars:1000});
  assert.deepEqual(result.compactedCallIds,["old"]);
  assert.equal(result.messages[3].content,messages[3].content);
  assert.equal(result.messages[4].content,messages[4].content);
  assert.ok(result.toolResultChars>1000);
});

test("identical read evidence can reference the newest complete result but pinned evidence never changes", () => {
  const content = "status=ok\n" + "full detail ".repeat(1000);
  const messages = [
    { role: "tool", name: "read_talent", tool_call_id: "first", content },
    { role: "tool", name: "read_talent", tool_call_id: "pinned", content },
    { role: "tool", name: "read_talent", tool_call_id: "latest", content },
  ];
  const result = buildOrgAgentRollingToolContext({ messages, compactableResultIndexes: new Set([0, 2]), targetChars: 10 });
  assert.match(result.messages[0].content, /historical_read_same_as=latest/);
  assert.equal(result.messages[1].content, content);
  assert.equal(result.messages[2].content, content);
});

test("pure profile reads compact only narrative bodies and keep identity, relationships and feedback", () => {
  assert.equal(canCompactOrgAgentRead("read_talent", { includeProfile: true }), true);
  const content = [
    "status=ok",
    "profile_url=/org/role/role-1?talentId=talent-1",
    'role=role-1 capabilities={"canContact":false} criteria=[{"name":"Product","rating":"Good"}]',
    "<candidate>\ntalent_id\tname\n talent-1\tCandidate\n</candidate>",
    `<profile_summary>\nfield\tvalue\nlocation\tToronto\nbio\t${"biography ".repeat(1000)}\nunknown_fact\texact source fact\n</profile_summary>`,
    `<positions>\nrole_id\tstage\tfit\tfit_reasons\ttradeoffs\tfeedback\tfeedback_reason\nrole-1\tconnected\t${"fit prose ".repeat(500)}\tOld reason\tOld tradeoff\tsaved\tCompany feedback verbatim\n</positions>`,
    `<recommendation_reasons>\nrole_id\trecommendation_reason\nrole-1\t${"public recommendation paragraph ".repeat(1000)}\n</recommendation_reasons>`,
    `<experience>\ncompany\trole\tstart\tend\tdescription\nSource Co\tEngineer\t2024-01-01\t-\t${"career detail ".repeat(1000)}\n</experience>`,
    "<company_contact_history>\nrequest_id\tstatus\ncontact-1\tsent\n</company_contact_history>",
  ].join("\n");
  const messages = [
    { role: "tool", name: "read_talent", tool_call_id: "profile", content },
    { role: "tool", name: "get_talents", tool_call_id: "latest", content: "status=ok\noffset=0 has_more=false" },
  ];
  const original = structuredClone(messages);
  const result = buildOrgAgentRollingToolContext({ messages, compactableResultIndexes: new Set([0, 1]), targetChars: 10 });
  const compact = result.messages[0].content;
  assert.deepEqual(messages, original);
  assert.match(compact, /context_detail_complete=false/);
  assert.match(compact, /includeProfile=true/);
  assert.match(compact, /talent-1/);
  assert.match(compact, /canContact.*false/);
  assert.match(compact, /Product.*Good/);
  assert.match(compact, /location\tToronto/);
  assert.match(compact, /unknown_fact\texact source fact/);
  assert.match(compact, /role-1\tconnected\tsaved\tCompany feedback verbatim/);
  assert.match(compact, /<recommendation_reasons>\nrole_id\nrole-1\n<\/recommendation_reasons>/);
  assert.match(compact, /Source Co\tEngineer\t2024-01-01\t-/);
  assert.match(compact, /contact-1\tsent/);
  assert.doesNotMatch(compact, /career detail|fit prose|biography biography|public recommendation paragraph/);
  assert.equal(result.messages[1].content, messages[1].content);
});

test("matching explanation bodies compact while their ledger stays exact; editable memory/full reads stay pinned", () => {
  assert.equal(canCompactOrgAgentRead("get_more_data", { kinds: ["matching_runs"] }), true);
  for (const input of [
    { kinds: ["company_memory"] }, { kinds: ["workspace_memory"] },
    { kinds: ["matching_runs", "company_memory"] },
    { kinds: ["matching_runs"], fullTextKeys: ["company_pitch"] },
  ]) assert.equal(canCompactOrgAgentRead("get_more_data", input), false);
  const ledger = "candidate=talent-1 evaluation=eval-1 Brief=7 run=run-4 time=2026-10-22 mutualFit=86";
  const result = buildOrgAgentRollingToolContext({ messages: [
    { role: "tool", name: "get_more_data", tool_call_id: "evaluations", content: `${ledger}\n<evaluation_explanations>\n${"rationale ".repeat(1000)}\n</evaluation_explanations>` },
    { role: "tool", name: "read_talent", tool_call_id: "last", content: "status=ok" },
  ], compactableResultIndexes: new Set([0]), targetChars: 10 });
  assert.ok(result.messages[0].content.includes(ledger));
  assert.ok(!result.messages[0].content.includes("rationale"));
});

test("the legacy single-result debugger retains its existing budget", () => {
  assert.equal(ORG_AGENT_MAX_TOTAL_TOOL_RESULT_CHARS, 80_000);
});

test("an exhausted tool-result budget still returns a fixed non-empty incomplete marker", () => {
  const result = fitOrgAgentToolResultToBudget({
    remainingChars: 0,
    serializedResult: "serialization_complete=true\nsecret complete value",
  });

  assert.equal(result.complete, false);
  assert.equal(result.content, ORG_AGENT_TOOL_RESULT_BUDGET_MARKER);
  assert.notEqual(result.content, "");
  assert.match(result.content, /complete=false/);
  assert.doesNotMatch(result.content, /serialization_complete=true/);
});

test("an already-incomplete serializer result is replaced instead of prefix-sliced", () => {
  const result = fitOrgAgentToolResultToBudget({
    remainingChars: 10_000,
    serializedResult: [
      "serialization_complete=false",
      "field_complete=true",
      "partial value",
    ].join("\n"),
  });

  assert.equal(result.complete, false);
  assert.equal(result.content, ORG_AGENT_TOOL_RESULT_BUDGET_MARKER);
  assert.doesNotMatch(result.content, /field_complete=true/);
});

test("a complete result inside the remaining budget is preserved exactly", () => {
  const serializedResult = "serialization_complete=true\nvalue=hello";
  const result = fitOrgAgentToolResultToBudget({
    remainingChars: serializedResult.length,
    serializedResult,
  });

  assert.deepEqual(result, { complete: true, content: serializedResult });
});

test("supplemental errors cannot displace authored base results or exceed remaining space", () => {
  const base = "기존 안내 전체";
  const deliveries = [{ content: base, diagnosticText: "details".repeat(1000) }];
  assert.deepEqual(fitOrgAgentDiagnosticSupplements(deliveries, 0), [base]);
  for (const available of [10, 100, 2000]) {
    const [content] = fitOrgAgentDiagnosticSupplements(deliveries, available);
    assert.ok(content.startsWith(base)); assert.ok(content.length <= base.length + available);
  }
});
test("later base results reclaim space from earlier diagnostics", () => {
  const deliveries = [{ content: "first", diagnosticText: "first error" }, { content: "second", diagnosticText: "second error" }];
  const broad = fitOrgAgentDiagnosticSupplements(deliveries, 200);
  assert.match(broad[0], /first error/); assert.match(broad[1], /second error/);
  assert.deepEqual(fitOrgAgentDiagnosticSupplements(deliveries, 0), ["first", "second"]);
});
