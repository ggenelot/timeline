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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();

  const missionBlocksResponse = ['cancelled', 'closed', 'confirmed'].includes(missionStatus);

  async function upsertResponse(response: MissionProposalResponse) {
    setLoading(true);
    setError(null);
    setSuccess(null);

    const { error: upsertError } = await supabase.from('mission_proposals').upsert(
      {
        mission_id: missionId,
        volunteer_id: volunteerId,
        proposed_by: volunteerId,
        response,
        status: 'pending'
      },
      { onConflict: 'mission_id,volunteer_id' }
    );

    if (upsertError) {
      setError(upsertError.message);
      setLoading(false);
      return;
    }

    setSuccess('Réponse enregistrée.');
    setLoading(false);
    router.refresh();
  }

  if (missionBlocksResponse) {
    return <p className="text-sm text-slate-600">Cette mission ne prend plus de réponses.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {responseOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={disabled || loading}
            onClick={() => upsertResponse(option.value)}
            className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading && currentResponse !== option.value ? 'Envoi...' : option.label}
          </button>
        ))}
      </div>
      {currentResponse ? <p className="text-xs text-slate-600">Réponse actuelle : {currentResponse}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}
    </div>
  );
}
