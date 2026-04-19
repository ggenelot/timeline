'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { MissionProposalResponse, MissionStatus } from '@/lib/types';

type ProposalButtonProps = {
  missionId: string;
  volunteerId: string;
  disabled: boolean;
  missionStatus: MissionStatus;
  currentResponse: MissionProposalResponse | null;
};

const responseOptions: Array<{ label: string; value: MissionProposalResponse }> = [
  { label: 'Disponible', value: 'available' },
  { label: 'Peut-être', value: 'maybe' },
  { label: 'Indisponible', value: 'unavailable' }
];

export function ProposalButton({ missionId, volunteerId, disabled, missionStatus, currentResponse }: ProposalButtonProps) {
  const [loadingResponse, setLoadingResponse] = useState<MissionProposalResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();

  const missionBlocksResponse = ['cancelled', 'closed', 'confirmed'].includes(missionStatus);

  async function upsertResponse(response: MissionProposalResponse) {
    setLoadingResponse(response);
    setError(null);
    setSuccess(null);

    const { data: existingProposal, error: existingProposalError } = await supabase
      .from('mission_proposals')
      .select('id')
      .eq('mission_id', missionId)
      .eq('volunteer_id', volunteerId)
      .maybeSingle();

    if (existingProposalError) {
      setError(existingProposalError.message);
      setLoadingResponse(null);
      return;
    }

    if (!existingProposal) {
      setError('Aucune proposition active pour cette mission.');
      setLoadingResponse(null);
      return;
    }

    const { error: updateError } = await supabase
      .from('mission_proposals')
      .update({
        response,
        status: 'pending'
      })
      .eq('id', existingProposal.id);

    if (updateError) {
      setError(updateError.message);
      setLoadingResponse(null);
      return;
    }

    setSuccess('Réponse enregistrée.');
    setLoadingResponse(null);
    router.refresh();
  }

  if (missionBlocksResponse) {
    return <p className="text-sm text-slate-600">Cette mission n&apos;accepte plus de réponses bénévoles.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {responseOptions.map((option) => {
          const isSaving = loadingResponse === option.value;

          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled || loadingResponse !== null}
              onClick={() => upsertResponse(option.value)}
              className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? 'Envoi...' : option.label}
            </button>
          );
        })}
      </div>
      {currentResponse ? <p className="text-xs text-slate-600">Réponse actuelle : {currentResponse}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}
    </div>
  );
}
