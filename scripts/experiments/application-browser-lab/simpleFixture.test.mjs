import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { simpleApplicationPage, receiveSimpleApplication, MAX_RESUME_BYTES } from './lib/simpleFixture.js';

function request({ file = '%PDF-1.7\nTest resume', name = '테스트 지원자', email = 'applicant@example.test', accept = 'application/json' } = {}) {
  const form = new FormData();
  form.set('name', name); form.set('email', email);
  if (file !== null) form.set('resume', new Blob([file], { type: 'application/pdf' }), 'test-resume.pdf');
  return new Request('http://localhost/simple', { method: 'POST', headers: { Accept: accept }, body: form });
}

test('one-page form accepts arbitrary applicant and actual file bytes without a run token', async () => {
  const html = await simpleApplicationPage().text();
  assert.equal((html.match(/<input /g) || []).length, 3);
  assert.doesNotMatch(html, /<iframe|type="checkbox"|name="run"/);
  const response = await receiveSimpleApplication(request());
  assert.equal(response.status, 201);
  const receipt = await response.json();
  assert.equal(receipt.name, '테스트 지원자');
  assert.equal(receipt.email, 'applicant@example.test');
  assert.equal(receipt.file.sha256, createHash('sha256').update('%PDF-1.7\nTest resume').digest('hex'));
  assert.equal(receipt.file.bytes, Buffer.byteLength('%PDF-1.7\nTest resume'));
});

test('missing resume, invalid email and oversized upload do not report success', async () => {
  assert.equal((await receiveSimpleApplication(request({ file: null }))).status, 400);
  assert.equal((await receiveSimpleApplication(request({ email: 'invalid' }))).status, 400);
  assert.equal((await receiveSimpleApplication(request({ file: Buffer.alloc(MAX_RESUME_BYTES + 1) }))).status, 413);
});

test('native form submission works without JavaScript and escapes applicant text', async () => {
  const response = await receiveSimpleApplication(request({ name: '<img src=x onerror=alert(1)>', accept: 'text/html' }));
  assert.equal(response.status, 201);
  const html = await response.text();
  assert.match(html, /지원서 접수 완료/);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img src=x/);
});
