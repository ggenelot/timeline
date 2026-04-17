'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

type ProposalButtonProps = {
  missionId: string;
  volunteerId: string;
  disabled: boolean;
};

export function ProposalButton({ missionId, volunteerId, disabled }: ProposalButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();

  async function handlePropose() {
    setLoading(true);
    setError(null);
    setSuccess(null);

    const { error: insertError } = await supabase.from('mission_proposals').insert({
      mission_id: missionId,
      volunteer_id: volunteerId,
      proposed_by: volunteerId,
      status: 'pending'
    });

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    setSuccess('Proposition envoyée.');
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={disabled || loading}
        onClick={handlePropose}
        className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Envoi...' : disabled ? 'Déjà proposé' : 'Je me propose'}
      </button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}
    </div>
  );
}
