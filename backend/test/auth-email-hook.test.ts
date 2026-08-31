import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import { verifyStandardWebhook } from '../src/lib/standard-webhooks';
import { authEmail } from '../src/lib/email-templates';

// Build a valid Standard-Webhooks signature the way Supabase does.
const keyBytes = Buffer.from('a-32-byte-test-signing-key-value!');
const secret = 'v1,whsec_' + keyBytes.toString('base64');
const sign = (id: string, ts: string, body: string) =>
  'v1,' + createHmac('sha256', keyBytes).update(`${id}.${ts}.${body}`).digest('base64');
const now = () => Math.floor(Date.now() / 1000).toString();

test('accepts a correctly-signed webhook', () => {
  const id = 'msg_1', ts = now(), body = JSON.stringify({ hello: 'world' });
  const headers = { 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': sign(id, ts, body) };
  assert.equal(verifyStandardWebhook(body, headers, secret), true);
});

test('rejects a tampered body', () => {
  const id = 'msg_2', ts = now(), body = JSON.stringify({ hello: 'world' });
  const headers = { 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': sign(id, ts, body) };
  assert.equal(verifyStandardWebhook(body + 'x', headers, secret), false);
});

test('rejects a stale timestamp (replay)', () => {
  const id = 'msg_3', ts = (Math.floor(Date.now() / 1000) - 4000).toString(), body = '{}';
  const headers = { 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': sign(id, ts, body) };
  assert.equal(verifyStandardWebhook(body, headers, secret), false);
});

test('rejects the wrong secret and missing headers', () => {
  const id = 'msg_4', ts = now(), body = '{}';
  const headers = { 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': sign(id, ts, body) };
  assert.equal(verifyStandardWebhook(body, headers, 'v1,whsec_' + Buffer.from('different-key').toString('base64')), false);
  assert.equal(verifyStandardWebhook(body, {}, secret), false);
});

test('auth email shows the OTP code for a sign-in', () => {
  const c = authEmail({ actionType: 'magiclink', token: '481920', confirmationUrl: null });
  assert.match(c.subject, /sign-in code/i);
  assert.ok(c.html.includes('481920') && c.html.startsWith('<!doctype html>') && c.html.includes('SightLive'));
});

test('auth email shows a reset button for recovery', () => {
  const c = authEmail({ actionType: 'recovery', token: '112233', confirmationUrl: 'https://app.test/verify?x=1' });
  assert.match(c.subject, /reset/i);
  assert.ok(c.html.includes('https://app.test/verify?x=1') && c.html.includes('Reset password'));
});
