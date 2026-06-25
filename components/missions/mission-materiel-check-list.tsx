'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { MaterielType, MissionMaterielCheck, MissionRequiredMateriel } from '@/lib/types';
import { AdminSectionLabel } from '@/components/admin/ui';

type RequirementWithMateriel = MissionRequiredMateriel & {
  materiel_type?: Pick<MaterielType, 'id' | 'name' | 'code'> | null;
};

type MissionMaterielCheckListProps = {
  requirements: RequirementWithMateriel[];
  checks: MissionMaterielCheck[];
  currentUserId: string;
};

function formatCheckedAt(dateIso: string): string {
  return new Date(dateIso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function MissionMaterielCheckList({ requirements, checks, currentUserId }: MissionMaterielCheckListProps) {
  const [checksState, setChecksState] = useState<MissionMaterielCheck[]>(checks);
  const [savingCheckId, setSavingCheckId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openCommentCheckId, setOpenCommentCheckId] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  async function saveCheck(checkId: string, patch: { is_present: boolean; comment?: string | null }) {
    setSavingCheckId(checkId);
    setError(null);

    const checkedAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('mission_materiel_checks')
      .update({ ...patch, checked_by: currentUserId, checked_at: checkedAt })
      .eq('id', checkId);

    if (updateError) {
      setError(updateError.message);
      setSavingCheckId(null);
      return;
    }

    setChecksState((current) =>
      current.map((check) => (check.id === checkId ? { ...check, ...patch, checked_by: currentUserId, checked_at: checkedAt } : check))
    );
    setSavingCheckId(null);
  }

  function toggleCheck(check: MissionMaterielCheck) {
    saveCheck(check.id, { is_present: !check.is_present, comment: check.comment });
  }

  function submitComment(check: MissionMaterielCheck) {
    const draft = commentDrafts[check.id] ?? check.comment ?? '';
    saveCheck(check.id, { is_present: check.is_present, comment: draft.trim() === '' ? null : draft });
    setOpenCommentCheckId(null);
  }

  if (requirements.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <AdminSectionLabel>Vérification du matériel</AdminSectionLabel>
        <p className="mt-1 text-xs text-[#94a3b8]">Cochez les items présents dans le matériel engagé pour cette mission.</p>
      </div>

      {error ? <p className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</p> : null}

      <div className="space-y-4">
        {requirements.map((requirement) => {
          const itemsForRequirement = checksState.filter((check) => check.mission_required_materiel_id === requirement.id);

          return (
            <div key={requirement.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-800">
                {requirement.materiel_type?.name ?? 'Matériel'} {requirement.quantity > 1 ? `×${requirement.quantity}` : ''}
              </p>

              {itemsForRequirement.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">Aucun item composant ce contenant.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {itemsForRequirement.map((check) => {
                    const isSaving = savingCheckId === check.id;
                    const isCommentOpen = openCommentCheckId === check.id;

                    return (
                      <li key={check.id} className="rounded border border-slate-200 bg-white p-2">
                        <div className="flex items-center justify-between gap-2">
                          <label className="flex items-center gap-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={check.is_present}
                              disabled={isSaving}
                              onChange={() => toggleCheck(check)}
                              className="h-4 w-4"
                            />
                            <span>
                              {check.item_type?.name ?? 'Item'} {check.expected_quantity > 1 ? `×${check.expected_quantity}` : ''}
                            </span>
                            <span className={`text-xs font-medium ${check.is_present ? 'text-emerald-600' : 'text-slate-400'}`}>
                              {check.is_present ? 'Présent' : 'Manquant'}
                            </span>
                          </label>
                          <button
                            type="button"
                            onClick={() => setOpenCommentCheckId(isCommentOpen ? null : check.id)}
                            className="text-xs text-slate-500 underline hover:text-slate-700"
                          >
                            {check.comment ? 'Commentaire' : 'Ajouter un commentaire'}
                          </button>
                        </div>

                        {isCommentOpen ? (
                          <div className="mt-2 flex items-center gap-2">
                            <input
                              type="text"
                              value={commentDrafts[check.id] ?? check.comment ?? ''}
                              onChange={(event) => setCommentDrafts((current) => ({ ...current, [check.id]: event.target.value }))}
                              placeholder="Préciser le problème..."
                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => submitComment(check)}
                              disabled={isSaving}
                              className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              Enregistrer
                            </button>
                          </div>
                        ) : check.comment ? (
                          <p className="mt-1 text-xs text-slate-500">{check.comment}</p>
                        ) : null}

                        {check.checked_by ? (
                          <p className="mt-1 text-xs text-slate-400">
                            Vérifié par {check.checked_by_profile?.full_name ?? 'un volontaire'} à {formatCheckedAt(check.checked_at)}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
