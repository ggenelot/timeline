import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api/permissions';
import { INTEGRATIONS } from '@/lib/integrations/registry';
import { isIntegrationConfigured, loadIntegrationSettings } from '@/lib/integrations/settings';

export const dynamic = 'force-dynamic';

// Liste des intégrations disponibles avec leur état de configuration, pour la
// page /admin/integrations. Jamais de secrets dans la réponse.
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'settings', 'can_manage');
  if (auth.errorResponse) return auth.errorResponse;

  const integrations = await Promise.all(
    INTEGRATIONS.map(async (definition) => {
      const settings = await loadIntegrationSettings(auth.serviceClient, definition.key);
      return {
        key: definition.key,
        name: definition.name,
        description: definition.description,
        configured: isIntegrationConfigured(definition, settings)
      };
    })
  );

  return NextResponse.json({ integrations });
}
