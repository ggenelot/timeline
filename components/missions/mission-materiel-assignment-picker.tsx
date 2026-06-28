import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { MissionRequiredMateriel } from '@/lib/types';

export type CandidateContainer = {
  id: string;
  name: string;
  code: string | null;
  category_id: string | null;
};

type MissionMaterielAssignmentPickerProps = {
  requirements: MissionRequiredMateriel[];
  candidateContainers: CandidateContainer[];
  onChange: () => void;
};

export function MissionMaterielAssignmentPicker({ requirements, candidateContainers, onChange }: MissionMaterielAssignmentPickerProps) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (requirements.length === 0) return null;

  const assignedContainerIds = new Set(requirements.flatMap((requirement) => (requirement.assignments ?? []).map((a) => a.materiel_type_id)));

  async function assign(requirementId: string, containerId: string) {
    setPending(containerId);
    setError(null);
    const { error: insertError } = await supabase
      .from('mission_materiel_assignments')
      .insert({ mission_required_materiel_id: requirementId, materiel_type_id: containerId });
    setPending(null);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    onChange();
  }

  async function unassign(assignmentId: string) {
    setPending(assignmentId);
    setError(null);
    const { error: deleteError } = await supabase.from('mission_materiel_assignments').delete().eq('id', assignmentId);
    setPending(null);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    onChange();
  }

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-semibold text-slate-900">Affectation du matériel</h2>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="space-y-4">
        {requirements.map((requirement) => {
          const assignments = requirement.assignments ?? [];
          const candidates = candidateContainers.filter((c) => c.category_id === requirement.category_id);
          const isComplete = assignments.length >= requirement.quantity;

          return (
            <div key={requirement.id} className="rounded-md border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900">{requirement.category?.name ?? 'Matériel'}</h3>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                    isComplete ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {assignments.length}/{requirement.quantity}
                </span>
              </div>

              {assignments.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {assignments.map((assignment) => (
                    <li key={assignment.id}>
                      <button
                        type="button"
                        onClick={() => void unassign(assignment.id)}
                        disabled={pending === assignment.id}
                        className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm text-emerald-800 ring-1 ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {assignment.materiel_type?.name ?? 'Contenant'}
                        <span aria-hidden="true">✕</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {candidates.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">Aucun contenant disponible pour ce type de matériel.</p>
              ) : (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {candidates
                    .filter((c) => !assignments.some((a) => a.materiel_type_id === c.id))
                    .map((container) => {
                      const usedElsewhere = assignedContainerIds.has(container.id);
                      return (
                        <li key={container.id}>
                          <button
                            type="button"
                            onClick={() => void assign(requirement.id, container.id)}
                            disabled={usedElsewhere || pending === container.id || isComplete}
                            className="inline-flex rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                            title={usedElsewhere ? 'Déjà affecté à un autre besoin de cette mission' : undefined}
                          >
                            {container.name}
                          </button>
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
