#!/usr/bin/env node
// Creates the 5 fixed `*@pcivile.test` Auth accounts that supabase/seed.sql
// expects to already exist (it only attaches profiles/roles to them).
// Idempotent: existing accounts have their password reset instead of failing,
// so reruns always converge on a known-good login.
//
// Usage:
//   npm run demo:create-test-accounts
//   npm run demo:create-test-accounts -- --force   # required if the target doesn't look local
//
// Note: Supabase Auth itself requires an email per account, but the app's
// actual login field is profiles.identifier (e.g. "admin"), not the email -
// /api/auth/resolve-identifier translates the typed identifier to an email
// before signing in. We set user_metadata.identifier explicitly here so it
// doesn't depend on email-format derivation in handle_new_user().

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const rawLine of readFileSync(filePath, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(path.join(repoRoot, '.env.local'));
loadEnvFile(path.join(repoRoot, '.env'));

function log(event, data = {}) {
  console.log(JSON.stringify({ event, ...data }));
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Check .env.local / .env.');
  process.exit(1);
}

const force = process.argv.includes('--force') || process.env.CREATE_TEST_ACCOUNTS_FORCE === '1';
const looksLocal = /127\.0\.0\.1|localhost|host\.docker\.internal/.test(SUPABASE_URL);

if (!looksLocal && !force) {
  console.error(`Refusing to run: NEXT_PUBLIC_SUPABASE_URL (${SUPABASE_URL}) does not look like a local Supabase instance.`);
  console.error('This script creates/resets fixed test accounts - rerun with --force (or CREATE_TEST_ACCOUNTS_FORCE=1) only if you really want that in this project.');
  process.exit(1);
}
if (!looksLocal && force) {
  log('warning', { message: 'forcing test account creation against a non-local-looking Supabase URL', url: SUPABASE_URL });
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const PASSWORD = process.env.E2E_TEST_PASSWORD || process.env.DEMO_SEED_PASSWORD || 'DemoPass123!';

const FIXED_ACCOUNTS = [
  { email: 'admin@pcivile.test', identifier: 'admin', fullName: 'Alice Admin' },
  { email: 'responsable@pcivile.test', identifier: 'responsable', fullName: 'Romain Responsable' },
  { email: 'benevole@pcivile.test', identifier: 'benevole', fullName: 'Bruno Benevole' },
  { email: 'benevole2@pcivile.test', identifier: 'benevole2', fullName: 'Bianca Benevole' },
  { email: 'benevole3@pcivile.test', identifier: 'benevole3', fullName: 'Basile Benevole' }
];

async function listExistingUsersByEmail() {
  const byEmail = new Map();
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const user of data.users) {
      if (user.email) byEmail.set(user.email, user.id);
    }
    if (data.users.length < 1000) break;
    page += 1;
  }
  return byEmail;
}

async function main() {
  log('start', { target: SUPABASE_URL, accounts: FIXED_ACCOUNTS.length });

  const existing = await listExistingUsersByEmail();

  for (const account of FIXED_ACCOUNTS) {
    const existingId = existing.get(account.email);
    if (existingId) {
      const { error } = await supabase.auth.admin.updateUserById(existingId, { password: PASSWORD });
      if (error) throw new Error(`updateUserById(${account.email}) failed: ${error.message}`);
      log('skip_existing_password_reset', { email: account.email });
      continue;
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email: account.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: account.fullName, identifier: account.identifier }
    });
    if (error) throw new Error(`createUser(${account.email}) failed: ${error.message}`);
    log('created', { email: account.email, id: data.user.id });
  }

  log('done', { count: FIXED_ACCOUNTS.length });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
