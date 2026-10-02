import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applicationStatuses, selectApplications } from '../src/lib/applicationList.ts';
const rows = applicationStatuses.map((status, index) => Object.freeze({
  id: String(index), firstName: 'Alex', lastName: `Rivera${index}`,
  email: `alex${index}@example.com`, school: 'University of Texas at Arlington',
  status, submittedAt: 100 + index,
}));
Object.freeze(rows);
test('searches each field, full name, whitespace and case', () => {
  for (const term of ['ALEX', 'rivera', '@example.com', 'arlington', '  Alex   Rivera ']) {
    assert.equal(selectApplications(rows, term, 'All', 'newest').length, 5);
  }
});
test('all five status filters combine with search', () => {
  for (const status of applicationStatuses) {
    assert.equal(selectApplications(rows, 'texas', status, 'newest').length, 1);
    assert.equal(selectApplications(rows, 'no-match', status, 'newest').length, 0);
  }
});
test('sorts both directions without modifying frozen inputs', () => {
  assert.deepEqual(selectApplications(rows, '', 'All', 'newest').map(r => r.id), ['4','3','2','1','0']);
  assert.deepEqual(selectApplications(rows, '', 'All', 'oldest').map(r => r.id), ['0','1','2','3','4']);
  assert.deepEqual(rows.map(r => r.id), ['0','1','2','3','4']);
});
test('empty data and unmatched search return empty results', () => {
  assert.deepEqual(selectApplications([], '', 'All', 'newest'), []);
  assert.deepEqual(selectApplications(rows, 'missing', 'All', 'newest'), []);
});
