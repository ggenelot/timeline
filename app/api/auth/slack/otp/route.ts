import { NextResponse } from 'next/server';
import { createSlackLoginChallenge } from '@/lib/slack/auth';
import { SlackService } from '@/lib/slack/service';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';

function normalizeSlackIdentifier(value: string) {
  return value.trim().replace(/^@+/, '').toLowerCase();
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { slackIdentifier?: string };
  const rawIdentifier = body.slackIdentifier?.trim();
  if (!rawIdentifier) return NextResponse.json({ error: 'Identifiant Slack requis.' }, { status: 400 });

  const identifier = normalizeSlackIdentifier(rawIdentifier);
  const service = createServerSupabaseServiceClient();
  const { data: profile } = await service
    .from('profiles')
    .select('slack_user_id,slack_team_id')
    .or(`slack_username.ilike.${identifier},slack_user_id.eq.${rawIdentifier}`)
    .maybeSingle<{ slack_user_id: string | null; slack_team_id: string | null }>();

  if (!profile?.slack_user_id || !profile?.slack_team_id) return NextResponse.json({ success: true });

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const userAgent = request.headers.get('user-agent');
  const otp = await createSlackLoginChallenge(profile.slack_team_id, profile.slack_user_id, ip, userAgent);

  try {
    const slack = new SlackService();
    const dm = await slack.openDirectMessage(profile.slack_user_id);
    await slack.postMessage(dm, `Votre OTP Timeline (valable 10 min): ${otp}`);
  } catch (error) {
    console.error('[slack-otp] delivery failure', { reason: error instanceof Error ? error.message : 'unknown' });
  }

  return NextResponse.json({ success: true });
}
