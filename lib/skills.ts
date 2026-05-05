export type SkillCategory = 'formation' | 'operationnel' | 'conduite' | 'accso' | 'sps' | 'complements' | 'vss';

export type SheetSkillStatus = 'valide' | 'a_faire' | 'interesse' | 'exempte';

export type SkillCode =
  // Legacy (kept for backward compat with existing DB data)
  | 'aide-formateur'
  | 'formateur-psc'
  | 'formateur-ps'
  | 'psc'
  | 'conducteur-vl'
  | 'conducteur-vps'
  // Opérationnel
  | 'pse1'
  | 'pse2'
  | 'fc-pse'
  | 'ce'
  | 'cp'
  | 'ceps'
  | 'ars'
  | 'bnssa'
  | 'ssa'
  | 'bord-terrain'
  // ACCSO
  | '3s'
  | 'ce2s'
  | 'fc-ce2s'
  | 'aep1'
  | 'aep2'
  // Formation
  | 'pic-f'
  | 'f-psc'
  | 'f-ps'
  | 'f-f-psc-ps'
  | 'fc-f-psc-ps'
  // SPS
  | 'osps'
  | 'tsps'
  | 'tronconnage'
  | 'travail-hauteur'
  // Conduite
  | 'ch-vps'
  | 'ch-vtp'
  | 'ch-pl'
  // Compléments
  | 'epi'
  | 'ecg'
  | 'argos-efibi'
  | 'radio'
  | 'cardiopompe'
  | 'portage'
  // VSS
  | 'sensibilisation-vss';

type SkillDefinition = {
  code: SkillCode;
  label: string;
  aliases: string[];
};

type SkillCategoryDefinition = {
  category: SkillCategory;
  label: string;
  orderedSkills: SkillDefinition[];
};

export const SKILL_REFERENTIAL: SkillCategoryDefinition[] = [
  {
    category: 'operationnel',
    label: 'Opérationnel',
    orderedSkills: [
      { code: 'psc', label: 'PSC1', aliases: ['psc'] },
      { code: 'pse1', label: 'PSE1', aliases: [] },
      { code: 'pse2', label: 'PSE2', aliases: [] },
      { code: 'fc-pse', label: 'FC PSE', aliases: ['fc pse'] },
      { code: 'ce', label: 'CE', aliases: [] },
      { code: 'cp', label: 'CP', aliases: [] },
      { code: 'ceps', label: 'CEPS', aliases: [] },
      { code: 'ars', label: 'ARS', aliases: [] },
      { code: 'bnssa', label: 'BNSSA', aliases: [] },
      { code: 'ssa', label: 'SSA', aliases: [] },
      { code: 'bord-terrain', label: 'BORD DE TERRAIN', aliases: ['bord de terrain'] }
    ]
  },
  {
    category: 'accso',
    label: 'ACCSO',
    orderedSkills: [
      { code: '3s', label: '3S', aliases: [] },
      { code: 'ce2s', label: 'CE2S', aliases: ['ces2'] },
      { code: 'fc-ce2s', label: 'FC CE2S', aliases: ['fc ce2s'] },
      { code: 'aep1', label: 'AEP1', aliases: [] },
      { code: 'aep2', label: 'AEP2', aliases: [] }
    ]
  },
  {
    category: 'formation',
    label: 'Formation',
    orderedSkills: [
      { code: 'aide-formateur', label: 'aide-formateur', aliases: ['aide formateur', 'aide_formateur'] },
      { code: 'pic-f', label: 'PIC F', aliases: ['pic f'] },
      { code: 'formateur-psc', label: 'formateur PSC1', aliases: ['formateur psc', 'formateur psc1', 'formateur_psc'] },
      { code: 'f-psc', label: 'F PSC', aliases: ['f psc'] },
      { code: 'formateur-ps', label: 'formateur PS', aliases: ['formateur ps', 'formateur_ps'] },
      { code: 'f-ps', label: 'F PS', aliases: ['f ps'] },
      { code: 'f-f-psc-ps', label: 'F F PSC/PS', aliases: ['f f psc ps', 'f f psc/ps'] },
      { code: 'fc-f-psc-ps', label: 'FC F PSC/PS', aliases: ['fc f psc ps', 'fc f psc/ps'] }
    ]
  },
  {
    category: 'sps',
    label: 'SPS',
    orderedSkills: [
      { code: 'osps', label: 'OSPS', aliases: [] },
      { code: 'tsps', label: 'TSPS', aliases: [] },
      { code: 'tronconnage', label: 'TRONCONNAGE', aliases: [] },
      { code: 'travail-hauteur', label: 'TRAVAIL EN HAUTEUR', aliases: ['travail en hauteur'] }
    ]
  },
  {
    category: 'conduite',
    label: 'Conduite',
    orderedSkills: [
      { code: 'conducteur-vl', label: 'chauffeur VL', aliases: ['conducteur vl', 'conducteur_vl', 'chauffeur vl'] },
      { code: 'conducteur-vps', label: 'conducteur VPS', aliases: ['conducteur cps', 'conducteur_cps', 'chauffeur cps', 'chauffeur vps', 'conducteur vps', 'conducteur_vps', 'chauffeur vl/vps'] },
      { code: 'ch-vps', label: 'CH VPS', aliases: ['ch vps'] },
      { code: 'ch-vtp', label: 'CH VTP', aliases: ['ch vtp'] },
      { code: 'ch-pl', label: 'CH PL', aliases: ['ch pl'] }
    ]
  },
  {
    category: 'complements',
    label: 'Compléments',
    orderedSkills: [
      { code: 'epi', label: 'EPI', aliases: [] },
      { code: 'ecg', label: 'ECG', aliases: [] },
      { code: 'argos-efibi', label: 'Argos / eFIBI', aliases: ['argos efibi', 'argos/efibi'] },
      { code: 'radio', label: 'Radio', aliases: [] },
      { code: 'cardiopompe', label: 'CardioPompe', aliases: ['cardiopompe'] },
      { code: 'portage', label: 'PORTAGE', aliases: [] }
    ]
  },
  {
    category: 'vss',
    label: 'VSS',
    orderedSkills: [
      { code: 'sensibilisation-vss', label: 'Sensibilisation VSS', aliases: ['sensibilisation vss'] }
    ]
  }
];

const CODE_TO_LABEL = new Map<SkillCode, string>();
const CODE_TO_CATEGORY_INDEX = new Map<SkillCode, { category: SkillCategory; index: number }>();
const TOKEN_TO_CODE = new Map<string, SkillCode>();

function normalizeSkillToken(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

for (const categoryDefinition of SKILL_REFERENTIAL) {
  categoryDefinition.orderedSkills.forEach((skill, index) => {
    CODE_TO_LABEL.set(skill.code, skill.label);
    CODE_TO_CATEGORY_INDEX.set(skill.code, { category: categoryDefinition.category, index });

    const tokens = new Set([skill.code, skill.label, ...skill.aliases]);
    tokens.forEach((token) => {
      TOKEN_TO_CODE.set(normalizeSkillToken(token), skill.code);
    });
  });
}

export function resolveSkillCode(skillName: string): SkillCode | null {
  return TOKEN_TO_CODE.get(normalizeSkillToken(skillName)) ?? null;
}

export function getSkillLabel(skillCode: SkillCode): string {
  return CODE_TO_LABEL.get(skillCode) ?? skillCode;
}

export function compareSkillCodes(a: SkillCode, b: SkillCode): number {
  const aMeta = CODE_TO_CATEGORY_INDEX.get(a);
  const bMeta = CODE_TO_CATEGORY_INDEX.get(b);

  if (!aMeta || !bMeta) {
    return a.localeCompare(b, 'fr');
  }

  const categoryOrder = SKILL_REFERENTIAL.map((category) => category.category);
  const categoryDelta = categoryOrder.indexOf(aMeta.category) - categoryOrder.indexOf(bMeta.category);

  if (categoryDelta !== 0) {
    return categoryDelta;
  }

  return aMeta.index - bMeta.index;
}

export function expandSkills(selectedSkillCodes: Iterable<SkillCode>): SkillCode[] {
  const expanded = new Set<SkillCode>();

  for (const skillCode of selectedSkillCodes) {
    const meta = CODE_TO_CATEGORY_INDEX.get(skillCode);
    if (!meta) {
      continue;
    }

    const category = SKILL_REFERENTIAL.find((definition) => definition.category === meta.category);
    if (!category) {
      continue;
    }

    for (let index = 0; index <= meta.index; index += 1) {
      expanded.add(category.orderedSkills[index].code);
    }
  }

  return Array.from(expanded).sort(compareSkillCodes);
}

export function expandSkillNames(skillNames: string[]): string[] {
  const explicitCodes = skillNames
    .map((skillName) => resolveSkillCode(skillName))
    .filter((skillCode): skillCode is SkillCode => skillCode !== null);

  return expandSkills(explicitCodes).map((skillCode) => getSkillLabel(skillCode));
}

export function buildExpandedSkillSet(skillNames: string[]): Set<SkillCode> {
  return new Set(
    expandSkills(
      skillNames
        .map((skillName) => resolveSkillCode(skillName))
        .filter((skillCode): skillCode is SkillCode => skillCode !== null)
    )
  );
}
