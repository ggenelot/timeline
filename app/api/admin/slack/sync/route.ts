import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken, requireAuthenticatedUser } from '@/lib/api/auth';

export async function POST(request: NextRequest){
  const token = getBearerToken(request); const auth = await requireAuthenticatedUser(token); if(auth.errorResponse) return auth.errorResponse;
  if(auth.profile.role!=='admin') return NextResponse.json({error:'Accès réservé aux administrateurs.'},{status:403});
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sync-slack-users`;
  const resp = await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,apikey:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}});
  const payload = await resp.json().catch(()=>({}));
  if (!resp.ok && !payload.error) {
    payload.error = payload.message ?? `Échec de la synchronisation Slack (HTTP ${resp.status}).`;
  }
  return NextResponse.json(payload,{status:resp.status});
}
