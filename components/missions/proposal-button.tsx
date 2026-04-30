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
  { label: "S'engager", value: 'available' },
  { label: 'Non disponible', value: 'unavailable' }
];

export function ProposalButton({ missionId, volunteerId, disabled, missionStatus, currentResponse }: ProposalButtonProps) {
  const [loadingResponse, setLoadingResponse] = useState<MissionProposalResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();

  const missionBlocksResponse = ['cancelled', 'closed', 'confirmed'].includes(missionStatus);

  function mapProposalError(message: string) {
    const normalized = message.toLowerCase();

    if (normalized.includes('row-level security')) {
      return 'Impossible d’enregistrer votre réponse : vous n’êtes pas autorisé à proposer pour ce profil ou cette mission.';
    }

    if (normalized.includes('duplicate key value')) {
      return 'Votre réponse existe déjà. Réessayez dans quelques secondes.';
    }

    return message;
  }

  async function upsertResponse(response: MissionProposalResponse) {
    setLoadingResponse(response);
    setError(null);
    setSuccess(null);

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      setError('Session invalide. Reconnectez-vous pour répondre à la mission.');
      setLoadingResponse(null);
      return;
    }

    if (user.id !== volunteerId) {
      setError('Action refusée : votre session ne correspond pas au profil bénévole affiché.');
      setLoadingResponse(null);
      return;
    }

    const { data: existingProposals, error: existingProposalError } = await supabase
      .from('mission_proposals')
      .select('id')
      .eq('mission_id', missionId)
      .eq('volunteer_id', user.id)
      .limit(1);

    const existingProposal = existingProposals?.[0] ?? null;

    if (existingProposalError) {
      setError(mapProposalError(existingProposalError.message));
      setLoadingResponse(null);
      return;
    }

    if (!existingProposal) {
      const { error: insertError } = await supabase.from('mission_proposals').insert({
        mission_id: missionId,
        volunteer_id: user.id,
        proposed_by: user.id,
        response,
        status: 'pending',
        updated_by_admin: false,
        updated_by: null,
        source: 'volunteer',
        updated_at: new Date().toISOString()
      });

      if (insertError) {
        setError(mapProposalError(insertError.message));
        setLoadingResponse(null);
        return;
      }

      setSuccess('Réponse enregistrée.');
      setLoadingResponse(null);
      router.refresh();
      return;
    }

    const { error: updateError } = await supabase
      .from('mission_proposals')
      .update({
        response,
        status: 'pending',
        updated_by_admin: false,
        updated_by: null,
        source: 'volunteer',
        updated_at: new Date().toISOString()
      })
      .eq('id', existingProposal.id);

    if (updateError) {
      setError(mapProposalError(updateError.message));
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
      <div className="flex flex-wrap items-center justify-end gap-3">
        {currentResponse ? (
          <div className="mr-auto flex items-center gap-2 text-sm text-slate-700">
            <p className="text-slate-500">Etat actuel</p>
            <p className="font-semibold text-slate-900">{currentResponse === 'available' ? '✓ Engagé' : 'Non disponible'}</p>
          </div>
        ) : null}
        {(currentResponse
          ? responseOptions.filter((option) => (currentResponse === 'available' ? option.value === 'unavailable' : option.value === 'available'))
          : responseOptions
        ).map((option) => {
          const isSaving = loadingResponse === option.value;
          const isAvailableOption = option.value === 'available';
          const isDisengageAction = currentResponse === 'available' && option.value === 'unavailable';

          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled || loadingResponse !== null}
              onClick={() => upsertResponse(option.value)}
              className={`rounded-md border px-3 py-1 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
                isDisengageAction
                  ? 'border-rose-500 bg-rose-500 text-white hover:bg-rose-400'
                  : isAvailableOption
                    ? 'border-emerald-400 bg-emerald-400 text-slate-900 hover:bg-emerald-300'
                    : 'border-slate-300 bg-white text-slate-900 hover:bg-slate-100'
              }`}
            >
              {isSaving ? 'Envoi...' : isDisengageAction ? 'Se désengager' : option.label}
            </button>
          );
        })}
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}
    </div>
  );
}
