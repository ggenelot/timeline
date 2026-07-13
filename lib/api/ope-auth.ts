import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requirePermission } from '@/lib/api/permissions';

// Accès OPE : permission `can_manage` sur la ressource `mission` (admin
// implicite via has_permission). Renvoie un client service si autorisé, sinon
// une réponse d'erreur prête à retourner.
export async function authorizeOpe(
  req: NextRequest
): Promise<{ client: SupabaseClient | null; error: NextResponse | null }> {
  const auth = await requirePermission(req, 'mission', 'can_manage');
  if (auth.errorResponse) return { client: null, error: auth.errorResponse };
  return { client: auth.serviceClient, error: null };
}
