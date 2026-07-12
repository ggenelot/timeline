import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken } from '@/lib/api/auth';
import { requirePermission } from '@/lib/api/permissions';

export async function POST(request: NextRequest){
  const token = getBearerToken(request);
  const auth = await requirePermission(request, 'settings', 'can_manage');
  if(auth.errorResponse) return auth.errorResponse;
  const body = await request.json().catch(()=>({}));
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-slack-invitations`;
  const resp = await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,apikey:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const payload = await resp.json();
  return NextResponse.json(payload,{status:resp.status});
}
