import {
  buildMissionDedupKey,
  buildMissionsPreview,
  parseCsvContent,
  parseParisLocalToUtcIso,
  utcIsoToParisParts
} from '@/lib/import-missions';

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

  const dedupKeyA = buildMissionDedupKey({ title: '  Soirée   T7 ', missionDate: '2026-04-30' });
  const dedupKeyB = buildMissionDedupKey({ title: 'soirée t7', missionDate: '2026-04-30' });
  assert(dedupKeyA === dedupKeyB, 'La clé de déduplication doit ignorer casse et espaces superflus.');

  const categoryCsv = `Intitulé;Date;Horaires;Type\nDPS Test;30/04/26;08h00 - 12h00;DPS`;
  const categoryPreview = buildMissionsPreview(parseCsvContent(categoryCsv));
  const importedCategory = categoryPreview.items[0]?.normalized?.category;
  assert(importedCategory === 'poste_de_secours', 'Le type DPS doit être importé en catégorie poste_de_secours.');

  const quotedCommaCsv = `Intitulé,Date,Horaires,Lieu\n"Mission, test",30/04/26,09h00 - 10h00,"Paris, 15e"`;
  const quotedPreview = buildMissionsPreview(parseCsvContent(quotedCommaCsv));
  assert(quotedPreview.totalValid === 1, 'Le parser CSV doit préserver les champs quotés avec virgules.');
  assert(
    quotedPreview.items[0]?.normalized?.title === 'Mission, test',
    'Le titre contenant une virgule doit être importé sans être tronqué.'
  );

  const overnightCsv = `Intitulé;Date;Horaires\nNuit test;30/04/26;23h30 - 01h15`;
  const overnightPreview = buildMissionsPreview(parseCsvContent(overnightCsv));
  const overnight = overnightPreview.items[0]?.normalized;
  assert(Boolean(overnight), 'Une mission de nuit doit être normalisée.');
  const overnightStart = overnight ? new Date(overnight.starts_at).getTime() : 0;
  const overnightEnd = overnight ? new Date(overnight.ends_at).getTime() : 0;
  assert(overnightEnd > overnightStart, "L'heure de fin d'une mission de nuit doit être au jour suivant.");

  const warningOnlyCsv = `Intitulé;Date;Horaires;Validation;Réversion\nMission warning;30/04/26;08h00 - 10h00;date invalide;abc`;
  const warningPreview = buildMissionsPreview(parseCsvContent(warningOnlyCsv));
  assert(warningPreview.totalValid === 1, 'Les warnings ne doivent pas invalider une mission importable.');
  const warningCodes = warningPreview.items[0]?.issues.map((issue) => issue.code) ?? [];
  assert(warningCodes.includes('invalid_validation_date'), 'La validation invalide doit remonter un warning dédié.');
  assert(warningCodes.includes('invalid_reversion_expected'), 'La réversion invalide doit remonter un warning dédié.');
}
