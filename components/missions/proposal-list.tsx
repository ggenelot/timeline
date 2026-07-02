'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { MissionProposalStatus, MissionStatus } from '@/lib/types';
import { MissionStatusBadge } from '@/components/missions/mission-status-badge';
import { StatusBadge } from '@/components/missions/status-badge';
import { Button } from '@/components/ui/button';

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
    
    status: MissionStatus;
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
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();

  async function updateProposalStatus(proposalId: string, status: 'accepted' | 'refused') {
    setSavingId(proposalId);
    setError(null);
    setSuccess(null);

    const { error: updateError } = await supabase
      .from('mission_proposals')
      .update({
        status,
        decided_at: new Date().toISOString(),
        decided_by: managerId
      })
      .eq('id', proposalId);

    if (updateError) {
      setError(`Impossible de mettre à jour la proposition : ${updateError.message}`);
      setSavingId(null);
      return;
    }

    setSuccess(`Proposition ${status === 'accepted' ? 'acceptée' : 'refusée'}.`);
    setSavingId(null);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error ? <div className="rounded-lg border border-bad/30 bg-bad-soft p-3 text-sm text-bad">{error}</div> : null}
      {success ? <div className="rounded-lg border border-ok-line bg-ok-soft p-3 text-sm text-ok-text">{success}</div> : null}

      {proposals.map((proposal) => {
        const isPending = proposal.status === 'pending';
        const missionAllowsDecision = proposal.mission?.status === 'proposed';
        const isSaving = savingId === proposal.id;

        return (
          <article key={proposal.id} className="rounded-2xl border border-line bg-surface-card p-4 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-ink">{proposal.mission?.title ?? 'Mission supprimée'}</h2>
              <StatusBadge status={proposal.status} />
            </div>

            <dl className="mt-3 grid gap-1 text-sm text-ink-2 md:grid-cols-2">
              <div>
                <dt className="inline font-medium text-ink">Bénévole :</dt>{' '}
                {proposal.volunteer?.full_name ?? proposal.volunteer?.email ?? proposal.volunteer?.id ?? 'N/A'}
              </div>
              <div>
                <dt className="inline font-medium text-ink">Mission le :</dt>{' '}
                {proposal.mission ? new Date(proposal.mission.starts_at).toLocaleString('fr-FR') : 'N/A'}
              </div>
              <div>
                <dt className="inline font-medium text-ink">Lieu :</dt> {proposal.mission?.location ?? 'Non défini'}
              </div>
              <div>
              </div>
              <div>
                <dt className="inline font-medium text-ink">Statut mission :</dt>{' '}
                {proposal.mission ? <MissionStatusBadge status={proposal.mission.status} /> : 'N/A'}
              </div>
              <div>
                <dt className="inline font-medium text-ink">Soumise le :</dt> {new Date(proposal.created_at).toLocaleString('fr-FR')}
              </div>
            </dl>

            {!missionAllowsDecision ? (
              <p className="mt-3 text-sm text-ink-2">Cette mission est verrouillée, la décision n&apos;est plus modifiable.</p>
            ) : null}

            <div className="mt-4 flex gap-2">
              <Button
                variant="engage"
                disabled={!isPending || isSaving || !missionAllowsDecision}
                onClick={() => updateProposalStatus(proposal.id, 'accepted')}
              >
                {isSaving ? 'Mise à jour...' : 'Accepter'}
              </Button>
              <Button
                variant="danger"
                disabled={!isPending || isSaving || !missionAllowsDecision}
                onClick={() => updateProposalStatus(proposal.id, 'refused')}
              >
                {isSaving ? 'Mise à jour...' : 'Refuser'}
              </Button>
            </div>
          </article>
        );
      })}

      {proposals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-field bg-surface-card p-6 text-sm text-ink-2">
          Aucune proposition à traiter pour le moment.
        </div>
      ) : null}
    </div>
  );
}
