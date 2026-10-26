import assert from 'node:assert/strict';
import test from 'node:test';
import { formatLlmDateTime, projectLlmDateTimes } from './promptDateTime';
import { buildCompanyUpdatePrompt } from '../org/agent/companyUpdate';
import { formatOrgAgentToolResult, formatPromptDate } from '../org/agent/promptFormat';

const raw = '2026-10-22T07:06:29.344088+00:00';
test('model timestamps use KST minute precision across offsets and midnight', () => {
  assert.equal(formatLlmDateTime(raw), '2026-10-22 16:06');
  assert.equal(formatLlmDateTime('2026-10-22T23:59:59.999-07:00'), '2026-10-23 15:59');
  assert.equal(formatLlmDateTime(new Date('2026-10-22T15:01:59Z')), '2026-10-23 00:01');
  assert.equal(formatPromptDate('2026-10-22T15:01:59Z'), '2026-10-23');
  assert.equal(formatLlmDateTime('2026-10-22'), '2026-10-22');
  assert.equal(formatLlmDateTime('2026-10-22 16:06'), '2026-10-22 16:06');
  for (const value of [null, undefined, '', 'invalid', '2026-10-22T07:06:29']) assert.equal(formatLlmDateTime(value), '-');
});

test('nested timestamp projection preserves source prose, exact execution references and original data', () => {
  const original = { createdAt: raw, items: [{ scheduled_at: raw, content: raw, revision: raw, expectedUpdatedAt: raw, nextCursor: { createdAt: raw } }], url: `https://example.org/${raw}` };
  const result = projectLlmDateTimes(original) as typeof original;
  assert.equal(result.createdAt, '2026-10-22 16:06');
  assert.equal(result.items[0].scheduled_at, '2026-10-22 16:06');
  for (const key of ['content', 'revision', 'expectedUpdatedAt'] as const) assert.equal(result.items[0][key], raw);
  assert.deepEqual(result.items[0].nextCursor, { createdAt: raw });
  assert.equal(result.url, original.url);
  assert.equal(original.createdAt, raw);
  assert.equal(original.items[0].scheduled_at, raw);
});

test('tool JSON fallback and background event facts use the same timestamp projection', () => {
  const tool = formatOrgAgentToolResult('set_role_notification', { status: 'updated', updatedAt: raw, details: { checked_at: raw } });
  assert.ok(!tool.includes(raw));
  assert.equal(JSON.parse(tool).details.checked_at, '2026-10-22 16:06');
  const event = buildCompanyUpdatePrompt({ facts: { occurredAt: raw, followups: [{ scheduledAt: raw }] } });
  assert.ok(!event.includes(raw));
  assert.ok(event.includes('2026-10-22 16:06'));
});
