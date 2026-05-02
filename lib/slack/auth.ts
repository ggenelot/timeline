import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';

export function hashSlackLoginCode(code: string) {
  return createHash('sha256').update(code).digest('hex');
}

export async function createSlackOAuthState(profileId: string | null, intent: 'connect' | 'login') {
  const service = createServerSupabaseServiceClient();
  const state = randomUUID();
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  await service.from('slack_oauth_states').insert({
    state,
    profile_id: profileId,
    intent,
    expires_at: expiresAt
  });
  console.info('[slack-oauth-state] state created', {
    flow: 'slack_login',
    step: 'create_state',
    state,
    intent,
    expires_at: expiresAt
  });
  return state;
}

type ConsumeSlackOAuthStateStatus = 'ok' | 'not_found' | 'expired' | 'already_used' | 'intent_mismatch';

type ConsumeSlackOAuthStateResult = {
  status: ConsumeSlackOAuthStateStatus;
  reason: 'ok' | 'state_not_found' | 'state_expired' | 'state_already_used' | 'state_intent_mismatch';
  row: { id: string; profile_id: string | null; expires_at: string; consumed_at: string | null; intent: 'connect' | 'login' } | null;
};

export async function consumeSlackOAuthState(state: string, intent: 'connect' | 'login') {
  const service = createServerSupabaseServiceClient();
  const now = new Date().toISOString();
  const { data } = await service.from('slack_oauth_states').select('id,profile_id,expires_at,consumed_at,intent').eq('state', state).maybeSingle();

  console.info('[slack-oauth-state] consume lookup', {
    flow: 'slack_login',
    step: 'consume_state',
    state,
    found: Boolean(data),
    expires_at: data?.expires_at ?? null,
    consumed_at: data?.consumed_at ?? null,
    now
  });

  if (!data) {
    console.warn('[slack-oauth-state] consume rejected', {
      flow: 'slack_login',
      step: 'consume_state',
      state,
      status: 'not_found',
      reason: 'state_not_found',
      created_at: null,
      expires_at: null,
      consumed_at: null
    });
    return { status: 'not_found', reason: 'state_not_found', row: null } satisfies ConsumeSlackOAuthStateResult;
  }

  if (data.intent !== intent) {
    return { status: 'intent_mismatch', reason: 'state_intent_mismatch', row: data } satisfies ConsumeSlackOAuthStateResult;
  }

  if (new Date(data.expires_at) < new Date()) {
    console.warn('[slack-oauth-state] consume rejected', {
      flow: 'slack_login',
      step: 'consume_state',
      state,
      status: 'expired',
      reason: 'state_expired',
      created_at: null,
      expires_at: data.expires_at,
      consumed_at: data.consumed_at
    });
    return { status: 'expired', reason: 'state_expired', row: data } satisfies ConsumeSlackOAuthStateResult;
  }

  if (data.consumed_at) {
    console.info('[slack-oauth-state] consume idempotent replay', {
      flow: 'slack_login',
      step: 'consume_state',
      state,
      status: 'already_used',
      reason: 'state_already_used',
      created_at: null,
      expires_at: data.expires_at,
      consumed_at: data.consumed_at
    });
    return { status: 'already_used', reason: 'state_already_used', row: data } satisfies ConsumeSlackOAuthStateResult;
  }

  const consumedAt = new Date().toISOString();
  const { data: updated } = await service
    .from('slack_oauth_states')
    .update({ consumed_at: consumedAt })
    .eq('id', data.id)
    .select('id,profile_id,expires_at,consumed_at,intent')
    .single();

  if (!updated) {
    return { status: 'not_found', reason: 'state_not_found', row: null } satisfies ConsumeSlackOAuthStateResult;
  }

  console.info('[slack-oauth-state] consume accepted', {
    flow: 'slack_login',
    step: 'consume_state',
    state,
    status: 'ok',
    created_at: null,
    expires_at: updated.expires_at,
    consumed_at: updated.consumed_at
  });
  return { status: 'ok', reason: 'ok', row: updated } satisfies ConsumeSlackOAuthStateResult;
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
