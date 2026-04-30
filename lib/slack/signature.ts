import { createHmac, timingSafeEqual } from 'node:crypto';
import { requireSlackEnv } from '@/lib/slack/config';

export function verifySlackRequestSignature({
  rawBody,
  signature,
  timestamp
}: {
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
}) {
  if (!signature || !timestamp) {
    return false;
  }

  const epoch = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(epoch)) {
    return false;
  }

  const ageInSeconds = Math.abs(Math.floor(Date.now() / 1000) - epoch);
  if (ageInSeconds > 60 * 5) {
    return false;
  }

  const signingSecret = requireSlackEnv('SLACK_SIGNING_SECRET');
  const baseString = `v0:${timestamp}:${rawBody}`;
  const computed = `v0=${createHmac('sha256', signingSecret).update(baseString).digest('hex')}`;

  const providedBuffer = Buffer.from(signature, 'utf8');
  const computedBuffer = Buffer.from(computed, 'utf8');

  if (providedBuffer.length !== computedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, computedBuffer);
}
