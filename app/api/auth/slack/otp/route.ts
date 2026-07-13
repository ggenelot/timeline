import { NextResponse } from 'next/server';
import { createSlackNumericLoginChallenge, resolveSlackTargetByIdentifier } from '@/lib/slack/auth';
import { SlackService } from '@/lib/slack/service';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { slackIdentifier?: string };
  const rawIdentifier = body.slackIdentifier?.trim();
  if (!rawIdentifier) return NextResponse.json({ error: 'Identifiant requis.' }, { status: 400 });

  // Anti-énumération : on répond toujours { success: true }, que le compte existe ou non,
  // et même en cas de rate-limit — sans révéler l'existence d'un profil.
  const target = await resolveSlackTargetByIdentifier(rawIdentifier);
  if (!target) return NextResponse.json({ success: true });

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const userAgent = request.headers.get('user-agent');
  const result = await createSlackNumericLoginChallenge(target.slackTeamId, target.slackUserId, ip, userAgent);
  if (result.status !== 'ok') return NextResponse.json({ success: true });

  try {
    const slack = new SlackService();
    const dm = await slack.openDirectMessage(target.slackUserId);
    await slack.postMessage(
      dm,
      `Voici ton code de connexion Timeline (valable 10 min) : ${result.code}\n\nSaisis-le sur la page de connexion, onglet « Code par Slack ».`
    );
  } catch (error) {
    console.error('[slack-otp] delivery failure', { reason: error instanceof Error ? error.message : 'unknown' });
  }

  return NextResponse.json({ success: true });
}
