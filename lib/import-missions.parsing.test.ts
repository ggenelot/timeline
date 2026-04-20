import { buildMissionsPreview, parseCsvContent, parseParisLocalToUtcIso, utcIsoToParisParts } from '@/lib/import-missions';

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(`[import-missions.parsing.test] ${message}`);
  }
}

export function runImportMissionsParsingTests() {
  const csv = `Etat DO,,RETENUE,NOUVEAU\nIntitulé,,Soirée T7,RANDO ROLLER\nDate,,30/04/26,01/05/26\nHoraires,,23h00 - 06h00,21h15 - 00h30\nLieu,,Porte de Versailles,Paris\nValidation,,06/04/26,07/04/26`;

  const preview = buildMissionsPreview(parseCsvContent(csv));
  assert(preview.totalDetected === 2, 'Le parser columnar doit détecter 2 lignes.');
  assert(preview.totalValid === 2, 'Les 2 lignes de test doivent être valides.');

  const first = preview.items[0]?.normalized;
  assert(Boolean(first), 'La première ligne doit être normalisée.');

  const firstStartParis = first ? utcIsoToParisParts(first.starts_at) : null;
  const firstEndParis = first ? utcIsoToParisParts(first.ends_at) : null;

  assert(firstStartParis?.time === '23:00', 'Heure de début Paris attendue à 23:00.');
  assert(firstEndParis?.time === '06:00', 'Heure de fin Paris attendue à 06:00.');

  const dstStartIso = parseParisLocalToUtcIso({ year: 2026, month: 3, day: 29, hour: 3, minute: 30 });
  assert(Boolean(dstStartIso), 'Conversion heure locale Paris vers UTC (changement heure été) doit réussir.');

  const dstWinterIso = parseParisLocalToUtcIso({ year: 2026, month: 10, day: 25, hour: 2, minute: 30 });
  assert(Boolean(dstWinterIso), 'Conversion heure locale Paris vers UTC (changement heure hiver) doit réussir.');
}
