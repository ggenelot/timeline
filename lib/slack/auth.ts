import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';

export function hashSlackLoginCode(code: string) {
  return createHash('sha256').update(code).digest('hex');
}

export async function createSlackOAuthState(profileId: string | null, intent: 'connect' | 'login') {
  const service = createServerSupabaseServiceClient();
  const state = randomUUID();
  await service.from('slack_oauth_states').insert({
    state,
    profile_id: profileId,
    intent,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString()
  });
  return state;
}

export async function consumeSlackOAuthState(state: string, intent: 'connect' | 'login') {
  const service = createServerSupabaseServiceClient();
  const { data } = await service.from('slack_oauth_states').select('id,profile_id,expires_at,consumed_at,intent').eq('state', state).maybeSingle();
  if (!data || data.consumed_at || data.intent !== intent || new Date(data.expires_at) < new Date()) {
    return null;
  }
  await service.from('slack_oauth_states').update({ consumed_at: new Date().toISOString() }).eq('id', data.id);
  return data;
}

export async function createSlackLoginChallenge(slackTeamId: string, slackUserId: string, ip: string | null, userAgent: string | null) {
  const service = createServerSupabaseServiceClient();
  const token = randomBytes(24).toString('base64url');
  await service.from('slack_login_challenges').insert({
    slack_team_id: slackTeamId,
    slack_user_id: slackUserId,
    code_hash: hashSlackLoginCode(token),
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    requested_ip: ip,
    user_agent: userAgent
  });
  return token;
}

export async function consumeSlackLoginChallenge(token: string) {
  const service = createServerSupabaseServiceClient();
  const hash = hashSlackLoginCode(token);
  const { data } = await service
    .from('slack_login_challenges')
    .select('id,slack_team_id,slack_user_id,expires_at,consumed_at')
    .eq('code_hash', hash)
    .maybeSingle();

  if (!data || data.consumed_at || new Date(data.expires_at) < new Date()) {
    return null;
  }

  await service.from('slack_login_challenges').update({ consumed_at: new Date().toISOString() }).eq('id', data.id);
  return data;
}
