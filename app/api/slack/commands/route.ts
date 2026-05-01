import { NextRequest, NextResponse } from 'next/server';
import { verifySlackRequestSignature } from '@/lib/slack/signature';
import { createSlackLoginChallenge } from '@/lib/slack/auth';
import { getSlackConfig } from '@/lib/slack/config';

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-slack-signature');
  const timestamp = request.headers.get('x-slack-request-timestamp');
  console.info('[slack-commands] incoming command request', {
    hasSignature: Boolean(signature),
    hasTimestamp: Boolean(timestamp),
    bodySize: rawBody.length
  });

  const valid = verifySlackRequestSignature({ rawBody, signature, timestamp });
  if (!valid) {
    console.warn('[slack-commands] invalid Slack signature');
    return NextResponse.json({ error: 'Invalid Slack signature.' }, { status: 401 });
  }

  const params = new URLSearchParams(rawBody);
  const command = params.get('command') ?? '';
  const text = (params.get('text') ?? '').trim();
  console.info('[slack-commands] parsed command payload', {
    command,
    text
  });

  if (command === '/timeline' && text === 'login') {
    const userId = params.get('user_id');
    const teamId = params.get('team_id');
    if (!userId || !teamId) {
      console.error('[slack-commands] missing user/team in login command payload', {
        hasUserId: Boolean(userId),
        hasTeamId: Boolean(teamId)
      });
      return NextResponse.json({ response_type: 'ephemeral', text: 'Impossible de générer un lien de connexion.' });
    }

    const token = await createSlackLoginChallenge(teamId, userId, request.headers.get('x-forwarded-for'), request.headers.get('user-agent'));
    const base = getSlackConfig().appBaseUrl ?? new URL(request.url).origin;
    console.info('[slack-commands] generated login challenge token', {
      teamId,
      userId
    });
    return NextResponse.json({
      response_type: 'ephemeral',
      text: `Connexion Timeline: ${base}/auth/slack/magic?token=${token}`
    });
  }

  return NextResponse.json({ response_type: 'ephemeral', text: `Commande ${command} reçue.` });
}
