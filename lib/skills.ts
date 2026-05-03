export type SkillCategory = 'formation' | 'operationnel' | 'conduite' | 'accso';

export type SkillCode =
  | 'aide-formateur'
  | 'formateur-psc'
  | 'formateur-ps'
  | 'psc'
  | 'pse1'
  | 'pse2'
  | 'ce'
  | 'cp'
  | 'ceps'
  | 'conducteur-vl'
  | 'conducteur-cps'
  | '3s'
  | 'ces2';

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
    category: 'formation',
    label: 'Formation',
    orderedSkills: [
      { code: 'aide-formateur', label: 'aide-formateur', aliases: ['aide formateur', 'aide_formateur'] },
      { code: 'formateur-psc', label: 'formateur PSC1', aliases: ['formateur psc', 'formateur psc1', 'formateur_psc'] },
      { code: 'formateur-ps', label: 'formateur PS', aliases: ['formateur ps', 'formateur_ps'] }
    ]
  },
  {
    category: 'conduite',
    label: 'Conduite',
    orderedSkills: [
      { code: 'conducteur-vl', label: 'chauffeur VL', aliases: ['conducteur vl', 'conducteur_vl', 'chauffeur vl'] },
      { code: 'conducteur-cps', label: 'chauffeur CPS', aliases: ['conducteur cps', 'conducteur_cps', 'chauffeur cps', 'chauffeur vps'] }
    ]
  },
  {
    category: 'operationnel',
    label: 'Opérationnel',
    orderedSkills: [
      { code: 'psc', label: 'PSC1', aliases: ['psc'] },
      { code: 'pse1', label: 'PSE1', aliases: [] },
      { code: 'pse2', label: 'PSE2', aliases: [] },
      { code: 'ce', label: 'CE', aliases: [] },
      { code: 'cp', label: 'CP', aliases: [] },
      { code: 'ceps', label: 'CEPS', aliases: [] }
    ]
  },
  {
    category: 'accso',
    label: 'Accso',
    orderedSkills: [
      { code: '3s', label: '3S', aliases: [] },
      { code: 'ces2', label: 'CES2', aliases: ['ce2s'] }
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
