import { NextResponse } from 'next/server';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string; slackTeamId?: string; slackUserId?: string };
  if (!body.email || !body.password || !body.slackTeamId || !body.slackUserId) return NextResponse.json({ error: 'Paramètres manquants.' }, { status: 400 });
  const service = createServerSupabaseServiceClient();
  const { data: created, error } = await service.auth.admin.createUser({ email: body.email, password: body.password, email_confirm: true, user_metadata: { full_name: `Slack ${body.slackUserId}` } });
  if (error || !created.user?.id) return NextResponse.json({ error: error?.message ?? 'Création impossible.' }, { status: 400 });
  await service.from('slack_identities').upsert({ profile_id: created.user.id, slack_team_id: body.slackTeamId, slack_user_id: body.slackUserId, is_primary: true, last_login_at: new Date().toISOString() });
  const { data: linkData } = await service.auth.admin.generateLink({ type: 'magiclink', email: body.email, options: { redirectTo: `${new URL(request.url).origin}/missions` } });
  return NextResponse.json({ next: linkData?.properties?.action_link ?? '/login' });
}
