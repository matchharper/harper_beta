import assert from 'node:assert/strict';
import test from 'node:test';
import { CareerCapabilityRuntime } from './capabilities/runtime';
import { formatTalentMessageContentForLlmPrompt } from './opportunityFeedbackNote';

test('a completed turn carries empty queries, search evidence and page failures into the next provider conversation', async () => {
  const runtime = new CareerCapabilityRuntime({ mode: 'progressive', eligibleTools: [], promptArgs: () => ({ channel: 'chat', isOnboardingDone: true, profile: null, structuredProfileText: '', talentContextSection: '' }) });
  const step = runtime.resolveStep(false);
  await runtime.recordResult('web_search', { query: 'Example recruiter email', resultCount: 0, results: [] }, step, { query: 'Example recruiter email' });
  await runtime.recordResult('web_search', { query: 'Example product', resultCount: 1, results: [{ title: 'Product', url: 'https://example.org/product', highlights: ['A developer tool.'] }] }, step);
  await runtime.recordResult('open_url', { ok: false, status: 'failed' }, step, { url: 'https://example.org/team' });
  const payload = JSON.parse(JSON.stringify({ agentTurn: { record: runtime.completedRecord() } }));
  const nextInput = formatTalentMessageContentForLlmPrompt({ role: 'assistant', content: 'Draft saved.', payload });
  assert.match(nextInput, /Example recruiter email\nResults returned: 0/);
  assert.match(nextInput, /A developer tool/);
  assert.match(nextInput, /https:\/\/example.org\/team\nRead failed/);
  assert.doesNotMatch(nextInput, /observedAt|"toolResults"/);
  // Historical facts survive unrelated later turns; they live on their original message.
  assert.equal(formatTalentMessageContentForLlmPrompt({ role: 'assistant', content: 'Draft saved.', payload }), nextInput);
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
