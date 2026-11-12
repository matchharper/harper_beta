import assert from 'node:assert/strict';
import test from 'node:test';
import { CareerCapabilityRuntime } from './capabilities/runtime';
import { formatTalentMessageContentForLlmPrompt } from './opportunityFeedbackNote';

test('completed research remains in the receipt but not in a new user turn, including legacy payloads', async () => {
  const runtime = new CareerCapabilityRuntime({ mode: 'progressive', eligibleTools: [], promptArgs: () => ({ channel: 'chat', isOnboardingDone: true, profile: null, structuredProfileText: '', talentContextSection: '' }) });
  const step = runtime.resolveStep(false);
  await runtime.recordResult('web_search', { query: 'Example recruiter email', resultCount: 0, results: [] }, step, { query: 'Example recruiter email' });
  await runtime.recordResult('open_url', { ok: false, status: 'failed' }, step, { url: 'https://example.org/team' });
  const payload = JSON.parse(JSON.stringify({ agentTurn: { record: runtime.completedRecord() } }));
  assert.ok(payload.agentTurn.record.toolResults[0].execution);
  assert.ok(payload.agentTurn.record.toolResults[0].research);
  for (const legacy of [false, true]) {
    if (legacy) for (const result of payload.agentTurn.record.toolResults) delete result.execution;
    assert.equal(formatTalentMessageContentForLlmPrompt({ role: 'assistant', content: 'Draft saved.', payload }), 'Draft saved.');
  }
});

test('document capability carries the resume authoring guide before any writer runs', () => {
  const runtime = new CareerCapabilityRuntime({ mode: 'progressive', eligibleTools: [{ type: 'function', function: { name: 'upsert_document', description: 'write', parameters: { type: 'object' } } }], preloads: ['documents'], promptArgs: () => ({ channel: 'chat', isOnboardingDone: true, profile: null, structuredProfileText: '', talentContextSection: '' }) });
  assert.ok(runtime.resolveStep(false).systemBlocks.some(block => block.key === 'handbook:resume'));
});

test('background-only guidance cannot be carried or preloaded into a foreground conversation', () => {
  const runtime = new CareerCapabilityRuntime({ mode: 'progressive', eligibleTools: [],
    handbooks: [{ id: 'proactive_career', version: 'old', remainingReplies: 2 }],
    selection: { capabilityIds: [], handbookIds: ['proactive_career'], status: 'selected', elapsedMs: 0 },
    promptArgs: () => ({ channel: 'chat', isOnboardingDone: true, profile: null, structuredProfileText: '', talentContextSection: '' }) });
  const step = runtime.resolveStep(false);
  assert.ok(!step.systemBlocks.some(block => block.key === 'handbook:proactive_career'));
  assert.ok(!step.systemBlocks.find(block => block.key === 'handbook_catalog')?.text.includes('proactive_career'));
  assert.equal(runtime.load({ handbook_ids: ['proactive_career'] }, step, 'load_handbook').ok, false);
});
