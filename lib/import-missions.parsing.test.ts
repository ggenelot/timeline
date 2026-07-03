import {
  buildMissionDedupKey,
  buildMissionsPreview,
  inferMaterielNeedsFromNotes,
  inferSkillNeedsFromNotes,
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
  const importedMissionTypeId = categoryPreview.items[0]?.normalized?.mission_type_id;
  assert(importedMissionTypeId === 'aaaaaaaa-0000-0000-0000-000000000005', 'Le type DPS doit être importé en poste_de_secours (UUID).');

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

  const tourAutoCsv = `Etat DO;;RETENUE;NOUVEAU
Intitulé;;Tour Auto;Mission B
Date;;30/04/26;01/05/26
Horaires;;08h00 - 18h00;09h00 - 12h00
Lieu;;Grand Palais - 75008;Paris
Nombre de secouristes;;"4 SR
dont 1 CP";2
Matériel spécifique;;1 lot A;-
Réversion;;1194;100
Réversion réelle;;955,2;80
Type;;Soirée/Weekend;DPS
Validation;;14/04/2026;15/04/2026`;

  const tourAutoPreview = buildMissionsPreview(parseCsvContent(tourAutoCsv));
  const tourAuto = tourAutoPreview.items.find((item) => item.normalized?.title === 'Tour Auto')?.normalized;
  assert(Boolean(tourAuto), 'La mission Tour Auto doit être détectée.');
  assert(tourAuto?.do_status === 'RETENUE', 'Tour Auto: Etat DO doit être RETENUE.');
  assert(tourAuto?.location === 'Grand Palais - 75008', 'Tour Auto: lieu importé incorrect.');
  assert(tourAuto?.requirements_notes === '4 SR dont 1 CP', 'Tour Auto: nombre de secouristes doit conserver le retour ligne.');
  assert(tourAuto?.equipment_notes === '1 lot A', 'Tour Auto: matériel spécifique importé incorrect.');
  assert(tourAuto?.reversion_expected === 1194, 'Tour Auto: réversion attendue importée incorrectement.');
  assert(tourAuto?.reversion_actual === 955.2, 'Tour Auto: réversion réelle importée incorrectement.');
  assert(tourAuto?.source_type_label === 'Soirée/Weekend', 'Tour Auto: type source importé incorrect.');
  assert(tourAuto?.validation_date === '2026-04-14', 'Tour Auto: date de validation importée incorrectement.');

  const cpSkill = { id: 'skill-cp', name: 'CP', code: 'CP' };
  const pse1Skill = { id: 'skill-pse1', name: 'PSE1', code: 'PSE1' };
  const availableSkills = [cpSkill, pse1Skill];

  const needsSimple = inferSkillNeedsFromNotes('2 SR dont 1 CP', availableSkills);
  assert(needsSimple[cpSkill.id] === 1, 'Le besoin "2 SR dont 1 CP" doit reconnaître 1 CP.');
  assert(needsSimple[''] === 1, 'Le reliquat générique doit valoir 1 (2 - 1 CP).');

  const needsPse1 = inferSkillNeedsFromNotes('2 PSE1', availableSkills);
  assert(needsPse1[pse1Skill.id] === 2, 'Le besoin "2 PSE1" doit reconnaître 2 PSE1.');
  assert(!(('' in needsPse1) && needsPse1[''] > 0), 'Aucun reliquat générique attendu quand tout est reconnu.');

  const needsEmpty = inferSkillNeedsFromNotes('', availableSkills);
  assert(Object.keys(needsEmpty).length === 0, 'Une note vide ne doit produire aucun besoin.');

  const needsUnrecognized = inferSkillNeedsFromNotes('3 bénévoles', availableSkills);
  assert(needsUnrecognized[''] === 3, 'Une note non reconnue doit tomber entièrement dans le générique.');

  const materielCategories = [{ id: 'cat-lot-c', name: 'Lot de secours C' }];
  const materielNeeds = inferMaterielNeedsFromNotes('1 lot de secours C', materielCategories);
  assert(materielNeeds['cat-lot-c'] === 1, 'Le matériel "1 lot de secours C" doit être reconnu.');

  const materielNoMatch = inferMaterielNeedsFromNotes('1 lot C', materielCategories);
  assert(Object.keys(materielNoMatch).length === 0, 'Une note matériel non reconnue ne doit rien pré-remplir (pas de repli générique).');
}
