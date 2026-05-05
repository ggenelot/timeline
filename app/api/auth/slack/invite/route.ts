import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseServiceClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Token manquant' }, { status: 400 });
  const service = createServerSupabaseServiceClient();
  const { data: invite } = await service.from('slack_invitations').select('status,slack_email').eq('invite_token', token).maybeSingle();
  if (!invite || ['expired', 'accepted'].includes(invite.status)) return NextResponse.json({ error: 'Invitation invalide' }, { status: 400 });
  return NextResponse.json({ email: invite.slack_email });
}
