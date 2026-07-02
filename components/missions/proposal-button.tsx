'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { MissionProposalResponse, MissionStatus } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';

type ProposalButtonProps = {
  missionId: string;
  volunteerId: string;
  disabled: boolean;
  missionStatus: MissionStatus;
  currentResponse: MissionProposalResponse | null;
  onResponse?: () => void;
};

const responseOptions: Array<{ label: string; value: MissionProposalResponse }> = [
  { label: "S'engager", value: 'available' },
  { label: 'Non disponible', value: 'unavailable' }
];

export function ProposalButton({ missionId, volunteerId, disabled, missionStatus, currentResponse, onResponse }: ProposalButtonProps) {
  const [loadingResponse, setLoadingResponse] = useState<MissionProposalResponse | null>(null);
  const [localResponse, setLocalResponse] = useState<MissionProposalResponse | null>(currentResponse);
  const [error, setError] = useState<string | null>(null);

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

      setLocalResponse(response);
      setLoadingResponse(null);
      onResponse?.();
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

    setLocalResponse(response);
    setLoadingResponse(null);
    onResponse?.();
  }

  if (missionBlocksResponse) {
    return <p className="text-sm text-ink-2">Cette mission n&apos;accepte plus de réponses bénévoles.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-3">
        {localResponse ? (
          <div className="mr-auto flex items-center gap-2 text-sm text-ink-2">
            <p className="text-ink-3">Etat actuel</p>
            <p className="inline-flex items-center gap-1 font-semibold text-ink">
              {localResponse === 'available' ? <><Icon name="check" size={16} />Engagé</> : 'Non disponible'}
            </p>
          </div>
        ) : null}
        {(localResponse
          ? responseOptions.filter((option) => (localResponse === 'available' ? option.value === 'unavailable' : option.value === 'available'))
          : responseOptions
        ).map((option) => {
          const isSaving = loadingResponse === option.value;
          const isAvailableOption = option.value === 'available';
          const isDisengageAction = localResponse === 'available' && option.value === 'unavailable';

          return (
            <Button
              key={option.value}
              variant={isDisengageAction ? 'danger' : isAvailableOption ? 'engage' : 'ghost'}
              disabled={disabled || loadingResponse !== null}
              onClick={() => upsertResponse(option.value)}
            >
              {isSaving ? 'Envoi...' : isDisengageAction ? 'Se désengager' : option.label}
            </Button>
          );
        })}
      </div>
      {error ? <p className="text-sm text-bad">{error}</p> : null}
    </div>
  );
}
