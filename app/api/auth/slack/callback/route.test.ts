import { hashSlackLoginCode } from '@/lib/slack/auth';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

export function runSlackAuthTests() {
  const token = 'abc';
  assert(hashSlackLoginCode(token) === hashSlackLoginCode(token), 'hash must be deterministic');
  assert(hashSlackLoginCode(token) !== hashSlackLoginCode('def'), 'hash must differ');
}
