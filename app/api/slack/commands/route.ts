import { NextRequest, NextResponse } from 'next/server';
import { verifySlackRequestSignature } from '@/lib/slack/signature';

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-slack-signature');
  const timestamp = request.headers.get('x-slack-request-timestamp');

  const valid = verifySlackRequestSignature({ rawBody, signature, timestamp });
  if (!valid) {
    return NextResponse.json({ error: 'Invalid Slack signature.' }, { status: 401 });
  }

  const params = new URLSearchParams(rawBody);
  const command = params.get('command') ?? '';

  return NextResponse.json({
    response_type: 'ephemeral',
    text: `Commande ${command} reçue. Endpoint prêt pour un futur login magique Timeline.`
  });
}
