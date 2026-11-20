import assert from 'node:assert/strict';
import test from 'node:test';
import { formatLlmDateTime, formatLlmElapsed, formatLlmYearsAgo, projectLlmDateTimes } from './promptDateTime';
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

test('elapsed time beside a date never rounds across a year the model would misname', () => {
  const now = new Date('2026-11-19T12:14:00Z'); // 2026-11-19 21:14 KST
  assert.equal(formatLlmElapsed('2026-11-19', now), 'today');
  assert.equal(formatLlmElapsed('2026-11-18', now), '1 day ago');
  assert.equal(formatLlmElapsed('2026-11-10', now), '9 days ago');
  assert.equal(formatLlmElapsed('2026-10-28', now), '3 weeks ago');
  assert.equal(formatLlmElapsed('2026-08-20T00:00:00Z', now), '3 months ago');
  assert.equal(formatLlmElapsed('2025-12-01', now), '12 months ago');
  assert.equal(formatLlmElapsed('2024-12-05', now), '23 months ago');
  assert.equal(formatLlmElapsed('2024-03-01', now), '2 years ago');
  for (const value of ['2026-12-01', null, '', 'soon', '2026-10']) assert.equal(formatLlmElapsed(value, now), '');
});

test('a founding year is said against the calendar year, as people say it', () => {
  const now = new Date('2026-11-19T12:14:00Z');
  assert.equal(formatLlmYearsAgo(2026, now), 'this year');
  assert.equal(formatLlmYearsAgo('2025', now), 'last year');
  assert.equal(formatLlmYearsAgo(2024, now), '2 years ago');
  // KST decides the year: 2026-12-31 16:00 UTC is already 2027 in Seoul.
  assert.equal(formatLlmYearsAgo(2026, new Date('2026-12-31T16:00:00Z')), 'last year');
  for (const value of [2027, null, 'soon', 2024.5]) assert.equal(formatLlmYearsAgo(value, now), '');
});
