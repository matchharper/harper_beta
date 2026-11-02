import assert from 'node:assert/strict';
import test from 'node:test';
import { extractBrowserMarkers, latestBrowserRequest } from './marker';
const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
test('browser presentation markers target independent sessions and preserve quoted source', () => {
  const quoted = `> [[browser:${first}]]\n\`[[browser:${first}]]\`\n\`\`\`\n[[browser:${first}]]\n\`\`\`\n\\[[browser:${first}]]`;
  assert.deepEqual(extractBrowserMarkers(quoted), { content: quoted, sessionIds: [] });
  assert.deepEqual(extractBrowserMarkers(`로그인해 주세요. [[browser:${first}]] [[browser:${second}]] [[browser:${first}]]`), {
    content: '로그인해 주세요.', sessionIds: [first, second],
  });
});
test('restored older markers do not override the current turn or a newer browser request', () => {
  const old = { id: 1, role: 'assistant', content: `[[browser:${first}]]` };
  const user = { id: 2, role: 'user', content: `[[browser:${first}]]` };
  assert.equal(latestBrowserRequest([old, user]), null);
  assert.deepEqual(latestBrowserRequest([old, user, { id: 3, role: 'assistant', content: `여기서 로그인해 주세요. [[browser:${second}]]` }]), {
    key: `3:${second}`, sessionId: second,
  });
});
