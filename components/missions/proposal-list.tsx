'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { MissionProposalStatus } from '@/lib/types';
import { StatusBadge } from '@/components/missions/status-badge';

export type ProposalListItem = {
  id: string;
  mission_id: string;
  status: MissionProposalStatus;
  created_at: string;
  mission: {
    id: string;
    title: string;
    starts_at: string;
    location: string | null;
    sector: string | null;
  } | null;
  volunteer: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
};

type ProposalListProps = {
  proposals: ProposalListItem[];
  managerId: string;
};

export function ProposalList({ proposals, managerId }: ProposalListProps) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function updateProposalStatus(proposalId: string, status: 'accepted' | 'refused') {
    setSavingId(proposalId);
    setError(null);

    const { error: updateError } = await supabase
      .from('mission_proposals')
      .update({
        status,
        decided_at: new Date().toISOString(),
        decided_by: managerId
      })
      .eq('id', proposalId);

    if (updateError) {
      setError(updateError.message);
      setSavingId(null);
      return;
    }

    setSavingId(null);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      {proposals.map((proposal) => {
        const isPending = proposal.status === 'pending';
        const isSaving = savingId === proposal.id;

        return (
          <article key={proposal.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">{proposal.mission?.title ?? 'Mission supprimée'}</h2>
              <StatusBadge status={proposal.status} />
            </div>

            <dl className="mt-3 grid gap-1 text-sm text-slate-600 md:grid-cols-2">
              <div>
                <dt className="inline font-medium text-slate-700">Bénévole :</dt>{' '}
                {proposal.volunteer?.full_name ?? proposal.volunteer?.email ?? proposal.volunteer?.id ?? 'N/A'}
              </div>
              <div>
                <dt className="inline font-medium text-slate-700">Mission le :</dt>{' '}
                {proposal.mission ? new Date(proposal.mission.starts_at).toLocaleString('fr-FR') : 'N/A'}
              </div>
              <div>
                <dt className="inline font-medium text-slate-700">Lieu :</dt> {proposal.mission?.location ?? 'Non défini'}
              </div>
              <div>
                <dt className="inline font-medium text-slate-700">Secteur :</dt> {proposal.mission?.sector ?? 'Non défini'}
              </div>
              <div>
                <dt className="inline font-medium text-slate-700">Soumise le :</dt> {new Date(proposal.created_at).toLocaleString('fr-FR')}
              </div>
            </dl>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={!isPending || isSaving}
                onClick={() => updateProposalStatus(proposal.id, 'accepted')}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving ? 'Mise à jour...' : 'Accepter'}
              </button>
              <button
                type="button"
                disabled={!isPending || isSaving}
                onClick={() => updateProposalStatus(proposal.id, 'refused')}
                className="rounded-md bg-rose-600 px-3 py-1.5 text-sm text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving ? 'Mise à jour...' : 'Refuser'}
              </button>
            </div>
          </article>
        );
      })}

      {proposals.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          Aucune proposition disponible.
        </div>
      ) : null}
    </div>
  );
}
