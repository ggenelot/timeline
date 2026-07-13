import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';

export function hashSlackLoginCode(code: string) {
  return createHash('sha256').update(code).digest('hex');
}

// Code numérique à 6 chiffres, tiré uniformément (randomInt évite le biais modulo).
export function generateNumericCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

const OTP_TTL_MS = 10 * 60_000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RATE_WINDOW_MS = 15 * 60_000;
const OTP_RATE_MAX = 5;

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
    .neq('channel', 'otp_login')
    .maybeSingle();

  if (!data || data.consumed_at || new Date(data.expires_at) < new Date()) {
    return null;
  }

  await service.from('slack_login_challenges').update({ consumed_at: new Date().toISOString() }).eq('id', data.id);
  return data;
}

type CreateNumericChallengeResult = { status: 'ok'; code: string } | { status: 'rate_limited' };

// Émet un code OTP 6 chiffres pour un couple Slack (team, user) : invalide les codes actifs
// précédents (un seul code valable à la fois), applique un plafond d'émission, ne stocke que le
// hash. Le code brut retourné n'est délivré que par DM Slack et ne doit jamais être loggé.
export async function createSlackNumericLoginChallenge(
  slackTeamId: string,
  slackUserId: string,
  ip: string | null,
  userAgent: string | null
): Promise<CreateNumericChallengeResult> {
  const service = createServerSupabaseServiceClient();
  const now = Date.now();

  // Anti-spam : au plus OTP_RATE_MAX codes émis par utilisateur sur la fenêtre glissante.
  const { count } = await service
    .from('slack_login_challenges')
    .select('id', { count: 'exact', head: true })
    .eq('slack_team_id', slackTeamId)
    .eq('slack_user_id', slackUserId)
    .eq('channel', 'otp_login')
    .gte('created_at', new Date(now - OTP_RATE_WINDOW_MS).toISOString());
  if ((count ?? 0) >= OTP_RATE_MAX) {
    return { status: 'rate_limited' };
  }

  // Un seul code actif à la fois : les précédents non consommés sont neutralisés.
  await service
    .from('slack_login_challenges')
    .update({ consumed_at: new Date().toISOString() })
    .eq('slack_team_id', slackTeamId)
    .eq('slack_user_id', slackUserId)
    .eq('channel', 'otp_login')
    .is('consumed_at', null);

  const code = generateNumericCode();
  await service.from('slack_login_challenges').insert({
    slack_team_id: slackTeamId,
    slack_user_id: slackUserId,
    code_hash: hashSlackLoginCode(code),
    channel: 'otp_login',
    expires_at: new Date(now + OTP_TTL_MS).toISOString(),
    attempt_count: 0,
    requested_ip: ip,
    user_agent: userAgent
  });

  return { status: 'ok', code };
}

type VerifyNumericChallengeResult =
  | { status: 'ok'; row: { id: string; slack_team_id: string; slack_user_id: string } }
  | { status: 'invalid' | 'expired' | 'locked' | 'not_found' };

// Vérifie un code OTP 6 chiffres, scopé au couple (team, user) — jamais de lookup global par
// hash. Incrémente le compteur de tentatives et verrouille au-delà d'OTP_MAX_ATTEMPTS.
export async function verifySlackNumericLoginChallenge(params: {
  slackTeamId: string;
  slackUserId: string;
  code: string;
}): Promise<VerifyNumericChallengeResult> {
  const service = createServerSupabaseServiceClient();

  const { data: row } = await service
    .from('slack_login_challenges')
    .select('id,slack_team_id,slack_user_id,code_hash,expires_at,attempt_count')
    .eq('slack_team_id', params.slackTeamId)
    .eq('slack_user_id', params.slackUserId)
    .eq('channel', 'otp_login')
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<{
      id: string;
      slack_team_id: string;
      slack_user_id: string;
      code_hash: string;
      expires_at: string;
      attempt_count: number;
    }>();

  if (!row) return { status: 'not_found' };
  if (row.attempt_count >= OTP_MAX_ATTEMPTS) return { status: 'locked' };
  if (new Date(row.expires_at) < new Date()) return { status: 'expired' };

  if (hashSlackLoginCode(params.code) !== row.code_hash) {
    await service
      .from('slack_login_challenges')
      .update({ attempt_count: row.attempt_count + 1 })
      .eq('id', row.id);
    return { status: 'invalid' };
  }

  await service.from('slack_login_challenges').update({ consumed_at: new Date().toISOString() }).eq('id', row.id);
  return { status: 'ok', row: { id: row.id, slack_team_id: row.slack_team_id, slack_user_id: row.slack_user_id } };
}

type ResolvedSlackTarget = {
  profileId: string;
  email: string | null;
  slackUserId: string;
  slackTeamId: string;
};

// Résout un bénévole à partir de ce qu'il peut saisir sur /login : son identifiant Timeline,
// son pseudo Slack (@handle) ou son slack_user_id. Retourne null s'il n'a pas de compte Slack lié.
export async function resolveSlackTargetByIdentifier(rawIdentifier: string): Promise<ResolvedSlackTarget | null> {
  const trimmed = rawIdentifier.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/^@+/, '').toLowerCase();

  const service = createServerSupabaseServiceClient();
  const { data: profile } = await service
    .from('profiles')
    .select('id,email,slack_user_id,slack_team_id')
    .or(`identifier.eq.${normalized},slack_username.ilike.${normalized},slack_user_id.eq.${trimmed}`)
    .maybeSingle<{ id: string; email: string | null; slack_user_id: string | null; slack_team_id: string | null }>();

  if (!profile?.slack_user_id || !profile?.slack_team_id) return null;
  return {
    profileId: profile.id,
    email: profile.email,
    slackUserId: profile.slack_user_id,
    slackTeamId: profile.slack_team_id
  };
}
