import assert from 'node:assert/strict';
import test from 'node:test';
import { belongsToLocalRound } from './slackScope.mjs';
test('old Slack events, threads and interactions cannot enter a new round', () => {
  assert.equal(belongsToLocalRound({event:{ts:'100.1'}}, 200), false);
  assert.equal(belongsToLocalRound({event:{ts:'201.1',thread_ts:'100.1'}}, 200), false);
  assert.equal(belongsToLocalRound({container:{message_ts:'100.1'}}, 200), false);
  assert.equal(belongsToLocalRound({event:{ts:'201.1',thread_ts:'200.1'}}, 200), true);
  assert.equal(belongsToLocalRound({event:{ts:'invalid'}}, 200), false);
});
