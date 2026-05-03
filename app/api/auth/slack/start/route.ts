import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ error: 'Connexion Slack SSO désactivée.' }, { status: 410 });
}
