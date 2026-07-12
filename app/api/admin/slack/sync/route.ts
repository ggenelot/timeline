import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken } from '@/lib/api/auth';
import { requirePermission } from '@/lib/api/permissions';

export async function POST(request: NextRequest){
  const token = getBearerToken(request);
  const auth = await requirePermission(request, 'settings', 'can_manage');
  if(auth.errorResponse) return auth.errorResponse;
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sync-slack-users`;
  const resp = await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,apikey:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}});
  const payload = await resp.json().catch(()=>({}));
  if (!resp.ok && !payload.error) {
    payload.error = payload.message ?? `Échec de la synchronisation Slack (HTTP ${resp.status}).`;
  }
  return NextResponse.json(payload,{status:resp.status});
}
