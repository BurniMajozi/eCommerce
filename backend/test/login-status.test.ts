import assert from 'node:assert/strict';
import test from 'node:test';
import { POST } from '../src/api/session/email-status/route';

const request = (email: string) => ({ body: { email } }) as any;
const response = () => ({
  body: null as any,
  json(value: any) { this.body = value; return this; },
}) as any;

test('public login status is indistinguishable for known and unknown addresses', async () => {
  const known = response();
  const unknown = response();
  await POST(request('known@example.com'), known);
  await POST(request('unknown@example.com'), unknown);
  assert.deepEqual(known.body, { next: 'email_code' });
  assert.deepEqual(unknown.body, known.body);
});
