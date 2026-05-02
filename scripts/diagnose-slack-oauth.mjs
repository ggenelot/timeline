#!/usr/bin/env node

const required = [
  'SLACK_CLIENT_ID',
  'SLACK_CLIENT_SECRET',
  'SLACK_OAUTH_REDIRECT_URI',
  'APP_BASE_URL'
];

const optional = ['SLACK_BOT_TOKEN', 'SLACK_TEAM_ID', 'SLACK_TEAM_DOMAIN'];
const env = process.env;

function log(type, payload) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), type, ...payload }));
}

async function check(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, ok: res.ok, json, text };
}

(async () => {
  log('diagnostic_start', { baseUrl: env.APP_BASE_URL ?? null });

  for (const key of required) {
    log('env_check', { key, present: Boolean(env[key]) });
  }
  for (const key of optional) {
    log('env_check_optional', { key, present: Boolean(env[key]) });
  }

  const base = (env.APP_BASE_URL || '').replace(/\/$/, '');
  if (!base) {
    log('fatal', { message: 'APP_BASE_URL missing' });
    process.exit(1);
  }

  const startUrl = `${base}/api/auth/slack/start`;
  const start = await check(startUrl, { method: 'POST' });
  log('route_check', { route: '/api/auth/slack/start', status: start.status, ok: start.ok, hasOauthUrl: Boolean(start.json?.oauthUrl) });

  if (start.json?.oauthUrl) {
    const parsed = new URL(start.json.oauthUrl);
    log('oauth_url_check', {
      host: parsed.host,
      pathname: parsed.pathname,
      redirect_uri: parsed.searchParams.get('redirect_uri'),
      client_id_present: Boolean(parsed.searchParams.get('client_id')),
      scope: parsed.searchParams.get('scope')
    });
  }

  const callbackProbeUrl = `${base}/api/auth/slack/callback`;
  const callbackProbe = await check(callbackProbeUrl, { method: 'GET' });
  log('route_check', { route: '/api/auth/slack/callback', status: callbackProbe.status, ok: callbackProbe.ok });

  if (env.SLACK_BOT_TOKEN) {
    const authTest = await check('https://slack.com/api/auth.test', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams()
    });
    log('slack_auth_test', { status: authTest.status, ok: authTest.ok, slackOk: Boolean(authTest.json?.ok), error: authTest.json?.error ?? null });
  }

  log('supabase_hint', {
    check: 'Verify slack_identities contains mapping for SLACK test account and expected workspace/team id.'
  });
  log('diagnostic_done', {});
})();
