import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAccessState } from '../src/tenant/accessState.js';

test('demo mode remains immediately available', () => {
  assert.equal(resolveAccessState({ mode: 'demo', capabilities: [] }), 'ready');
});

test('live access does not render the app until scope has resolved', () => {
  assert.equal(resolveAccessState({ mode: 'supabase', loading: true, capabilities: [] }), 'loading');
});

test('live lookup failures and unassigned users are explicit states', () => {
  assert.equal(resolveAccessState({ mode: 'supabase', loading: false, error: new Error('offline'), capabilities: [] }), 'error');
  assert.equal(resolveAccessState({ mode: 'supabase', loading: false, error: null, capabilities: [] }), 'unassigned');
});

test('a resolved capability set unlocks the authorized app shell', () => {
  assert.equal(resolveAccessState({ mode: 'supabase', loading: false, error: null, capabilities: ['commerce.read'] }), 'ready');
});
