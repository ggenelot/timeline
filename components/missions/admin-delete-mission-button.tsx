'use client';

import { useState, type CSSProperties } from 'react';
import { supabase } from '@/lib/supabase/client';

type AdminDeleteMissionButtonProps = {
  missionId: string;
  className?: string;
  style?: CSSProperties;
  onDeleted?: () => void;
  onError?: (message: string) => void;
};

export function AdminDeleteMissionButton({ missionId, className, style, onDeleted, onError }: AdminDeleteMissionButtonProps) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    const confirmed = window.confirm('Supprimer définitivement cette mission ? Cette action est irréversible.');
    if (!confirmed) {
      return;
    }

    setDeleting(true);

    const { data, error } = await supabase.from('missions').delete().eq('id', missionId).select('id');

    if (error) {
      const errorMessage = error.message.toLowerCase().includes('row-level security')
        ? "Action refusée par la politique d'accès (RLS). Vérifiez que votre profil est admin."
        : `Impossible de supprimer la mission : ${error.message}`;
      onError?.(errorMessage);
      setDeleting(false);
      return;
    }

    if (!data || data.length === 0) {
      onError?.("La mission n'a pas été supprimée. Vérifiez vos droits d'accès puis actualisez la page.");
      setDeleting(false);
      return;
    }

    onDeleted?.();
    setDeleting(false);
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={deleting}
      style={style ? { ...style, ...(deleting ? { opacity: 0.55, cursor: 'not-allowed' } : null) } : undefined}
      className={style ? undefined : (className ?? 'fixed bottom-6 right-6 z-50 rounded-full bg-bad px-6 py-3 text-sm font-semibold text-white shadow-lift transition hover:bg-[#BC3A3A] disabled:cursor-not-allowed disabled:opacity-60')}
    >
      {deleting ? 'Suppression...' : 'Supprimer la mission'}
    </button>
  );
}
