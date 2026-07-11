'use client';

import { useMemo, useState } from 'react';
import type { MissionVolunteerCandidate } from '@/lib/mission-board';
import { getProposalResponseLabel } from '@/lib/missions';
import { Avatar } from '@/components/ope/atoms';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/cn';

const RESPONSE_PILL_CLASS: Record<MissionVolunteerCandidate['response'], string> = {
  available: 'bg-ok-soft text-ok-text',
  unavailable: 'bg-bad-soft text-bad',
  no_response: 'bg-surface-sub text-ink-2',
};

const RESPONSE_PRIORITY: Record<MissionVolunteerCandidate['response'], number> = {
  available: 0,
  unavailable: 1,
  no_response: 2,
};

// Recherche plein répertoire (pas seulement dispo/engagés ce jour-là),
// restreinte à la compétence du créneau — pour retrouver un bénévole absent
// des groupes usuels du picker et, le cas échéant, le rendre disponible sur
// cette mission avant de l'affecter (cf. placeVolunteer côté page, qui gère
// la confirmation).
export function AllVolunteersSearchModal({
  roleName,
  skillId,
  candidates,
  loading,
  error,
  onClose,
  onPick,
}: {
  roleName: string;
  skillId: string | null;
  candidates: MissionVolunteerCandidate[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onPick: (volunteerId: string, label: string) => void;
}) {
  const [search, setSearch] = useState('');

  const rows = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('fr-FR');
    return candidates
      .filter((c) => !skillId || c.validatedSkillIds.includes(skillId))
      .filter((c) => !normalizedSearch || (c.full_name ?? '').toLocaleLowerCase('fr-FR').includes(normalizedSearch))
      .sort((a, b) => {
        if (RESPONSE_PRIORITY[a.response] !== RESPONSE_PRIORITY[b.response]) {
          return RESPONSE_PRIORITY[a.response] - RESPONSE_PRIORITY[b.response];
        }
        return (a.full_name ?? '').localeCompare(b.full_name ?? '', 'fr', { sensitivity: 'base' });
      });
  }, [candidates, skillId, search]);

  return (
    <Modal onClose={onClose} title={`Chercher parmi tous les bénévoles — ${roleName}`} maxWidth={480}>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rechercher un bénévole"
        autoFocus
        className="mb-3 w-full rounded-full border border-line-field bg-surface-sub px-4 py-2.5 text-[13.5px] text-ink-2 outline-none focus:border-accent"
      />

      {error ? <p className="py-3 text-[13px] text-bad">{error}</p> : null}

      {loading ? (
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[52px] animate-pulse rounded-xl bg-surface-sub" />
          ))}
        </div>
      ) : !error && rows.length === 0 ? (
        <p className="py-3 text-[13px] text-ink-3">
          {skillId ? 'Aucun bénévole avec cette compétence ne correspond.' : 'Aucun bénévole ne correspond.'}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {rows.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onPick(c.id, c.full_name ?? 'Bénévole')}
              className="flex items-center gap-2.5 rounded-xl border border-line-field bg-surface-sub px-3 py-2 text-left transition hover:bg-line-row"
            >
              <Avatar name={c.full_name} avatarUrl={c.avatar_url} />
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink">{c.full_name ?? 'Bénévole'}</span>
              <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold', RESPONSE_PILL_CLASS[c.response])}>
                {getProposalResponseLabel(c.response)}
              </span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
