'use client';

import { SearchableSelect } from '@/components/ui/searchable-select';
import type { OpeVolunteerRef } from '@/lib/types';

// Recherche accessoire (coin de la toolbar) pour suivre les activités d'un secouriste.
export function PersonSearch({
  volunteers,
  value,
  onSelect,
}: {
  volunteers: OpeVolunteerRef[];
  value: string;
  onSelect: (volunteerId: string) => void;
}) {
  const options = volunteers.map((v) => ({ value: v.id, label: v.full_name ?? 'Sans nom' }));
  return (
    <div className="w-full sm:w-60">
      <SearchableSelect
        options={options}
        value={value}
        onChange={onSelect}
        placeholder="Suivre une personne…"
      />
    </div>
  );
}
