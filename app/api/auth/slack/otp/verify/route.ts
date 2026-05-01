import { NextResponse } from 'next/server';
import { consumeSlackLoginChallenge } from '@/lib/slack/auth';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { otp?: string };
  const otp = body.otp?.trim();
  if (!otp) return NextResponse.json({ error: 'OTP requis.' }, { status: 400 });

  const challenge = await consumeSlackLoginChallenge(otp);
  if (!challenge) return NextResponse.json({ error: 'OTP invalide ou expiré.' }, { status: 400 });

  const service = createServerSupabaseServiceClient();
  const { data: identity } = await service
    .from('slack_identities')
    .select('profile_id')
    .eq('slack_team_id', challenge.slack_team_id)
    .eq('slack_user_id', challenge.slack_user_id)
    .maybeSingle<{ profile_id: string | null }>();

  if (identity?.profile_id) {
    const { data: profile } = await service.from('profiles').select('email').eq('id', identity.profile_id).maybeSingle<{ email: string | null }>();
    if (!profile?.email) return NextResponse.json({ error: 'Email introuvable.' }, { status: 400 });
    const { data: linkData } = await service.auth.admin.generateLink({ type: 'magiclink', email: profile.email, options: { redirectTo: `${new URL(request.url).origin}/missions` } });
    return NextResponse.json({ next: linkData?.properties?.action_link ?? '/login?slack=magic_invalid', type: 'login' });
  }

  return NextResponse.json({
    next: `/auth/slack/signup?team=${encodeURIComponent(challenge.slack_team_id)}&user=${encodeURIComponent(challenge.slack_user_id)}`,
    type: 'signup'
  });
}
