import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, requirePermission } from '@/lib/api/permissions';
import { EOPE_INTEGRATION_KEY } from '@/lib/eope/config';
import { getIntegrationDefinition } from '@/lib/integrations/registry';
import {
  isIntegrationConfigured,
  loadIntegrationSettings,
  maskIntegrationSettings,
  saveIntegrationSettings
} from '@/lib/integrations/settings';

export const dynamic = 'force-dynamic';

// Configuration de l'intégration eOPE, éditée depuis /admin/integrations/eope.
// Les secrets sont en écriture seule : jamais renvoyés (seulement « défini »),
// une clé absente du PATCH est conservée, une chaîne vide efface.

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'settings', 'can_manage');
  if (auth.errorResponse) return auth.errorResponse;

  const definition = getIntegrationDefinition(EOPE_INTEGRATION_KEY);
  if (!definition) return NextResponse.json({ error: 'Intégration inconnue.' }, { status: 404 });

  const settings = await loadIntegrationSettings(auth.serviceClient, definition.key);
  const { values, secretsSet } = maskIntegrationSettings(definition, settings);

  return NextResponse.json({
    definition: {
      key: definition.key,
      name: definition.name,
      description: definition.description,
      fields: definition.fields
    },
    values,
    secretsSet,
    configured: isIntegrationConfigured(definition, settings)
  });
}

export async function PATCH(request: NextRequest) {
  // Écriture de secrets d'intégration : réservé aux administrateurs.
  const auth = await requireAdmin(request);
  if (auth.errorResponse) return auth.errorResponse;

  const definition = getIntegrationDefinition(EOPE_INTEGRATION_KEY);
  if (!definition) return NextResponse.json({ error: 'Intégration inconnue.' }, { status: 404 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Le corps de la requête est invalide.' }, { status: 400 });
  }

  try {
    const next = await saveIntegrationSettings(
      auth.serviceClient,
      definition,
      body as Record<string, unknown>,
      auth.user.id
    );
    const { values, secretsSet } = maskIntegrationSettings(definition, next);
    return NextResponse.json({
      values,
      secretsSet,
      configured: isIntegrationConfigured(definition, next)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Échec de l'enregistrement.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
