function optionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function requireSlackEnv(name: 'SLACK_BOT_TOKEN' | 'SLACK_CLIENT_ID' | 'SLACK_CLIENT_SECRET' | 'SLACK_SIGNING_SECRET') {
  const value = optionalEnv(name);

  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }

  return value;
}

export function getSlackConfig() {
  return {
    botToken: optionalEnv('SLACK_BOT_TOKEN'),
    signingSecret: optionalEnv('SLACK_SIGNING_SECRET'),
    clientId: optionalEnv('SLACK_CLIENT_ID'),
    clientSecret: optionalEnv('SLACK_CLIENT_SECRET'),
    redirectUri: optionalEnv('SLACK_OAUTH_REDIRECT_URI'),
    appBaseUrl: optionalEnv('APP_BASE_URL')
  };
}
