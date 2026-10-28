import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSnapshot, type Query } from './repository';
import { presentationInput } from './writer';

test('stored workspace language reaches the provider and changes the presentation fingerprint', async () => {
  const fingerprints = [];
  for (const [locale, headquarters, language] of [
    ['ko', 'San Francisco, United States', '한국어'],
    ['en', 'Seoul, South Korea', 'English'],
    [null, 'San Francisco, United States', 'English'],
  ]) {
    const query: Query = async sql => {
      if (sql.includes('SELECT role.*')) {
        assert.ok(sql.includes('workspace.locale AS workspace_locale'));
        return [{ name: 'Fixture role', request: 'Research audio models', criteria: [], version: 'brief',
          workspace_locale: locale, headquarters_location: headquarters }];
      }
      return [];
    };
    const snapshot = await loadSnapshot(query, {workspaceId:'workspace', userId:'actor', roleId:'role',
      requestId:'request', kind:'add', talentIds:[]});
    const input = presentationInput(snapshot.role, {talentId:'fixture', profile:{}, searchBrief:[],
      assessment:{}, evaluationId:'evaluation', sourceFingerprint:'source'});
    assert.ok(input.user.includes(`## outputLanguage\n${language}`));
    fingerprints.push(snapshot.sourceFingerprint);
  }
  assert.notEqual(fingerprints[0], fingerprints[1]);
});
