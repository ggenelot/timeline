'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import {
  MaterielInstance,
  MissionMaterielAssignment,
  MissionRequiredMateriel
} from '@/lib/types';

type MissionMaterielAssignmentsProps = {
  missionId: string;
};

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export function MissionMaterielAssignments({ missionId }: MissionMaterielAssignmentsProps) {
  const [requiredMateriels, setRequiredMateriels] = useState<MissionRequiredMateriel[]>([]);
  const [assignments, setAssignments] = useState<MissionMaterielAssignment[]>([]);
  const [availableInstances, setAvailableInstances] = useState<MaterielInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const token = await getAccessToken();
    if (!token) return;

    const response = await fetch(`/api/admin/missions/${missionId}/materiels`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const payload = (await response.json()) as {
      requiredMateriels?: MissionRequiredMateriel[];
      assignments?: MissionMaterielAssignment[];
      availableInstances?: MaterielInstance[];
      error?: string;
    };

    if (!response.ok) {
      setError(payload.error ?? 'Impossible de charger le matériel de la mission.');
      setLoading(false);
      return;
    }

    setRequiredMateriels(payload.requiredMateriels ?? []);
    setAssignments(payload.assignments ?? []);
    setAvailableInstances(payload.availableInstances ?? []);
    setLoading(false);
  }, [missionId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (requiredMateriels.length === 0 && !loading) {
    return null;
  }

  async function assignInstance(materielTypeId: string, requiredMaterielId: string, materielInstanceId: string) {
    if (!materielInstanceId) return;
    setActionLoading(requiredMaterielId);
    const token = await getAccessToken();
    if (!token) {
      setActionLoading(null);
      return;
    }

    const response = await fetch(`/api/admin/missions/${missionId}/materiels`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        materiel_instance_id: materielInstanceId,
        mission_required_materiel_id: requiredMaterielId,
        assignment_status: 'selected'
      })
    });
    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(payload.error ?? "Impossible d'affecter le matériel.");
      setActionLoading(null);
      return;
    }

    await load();
    setActionLoading(null);
  }

  async function unassignInstance(materielInstanceId: string) {
    setActionLoading(materielInstanceId);
    const token = await getAccessToken();
    if (!token) {
      setActionLoading(null);
      return;
    }

    const response = await fetch(`/api/admin/missions/${missionId}/materiels?materiel_instance_id=${encodeURIComponent(materielInstanceId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(payload.error ?? "Impossible de retirer l'affectation.");
      setActionLoading(null);
      return;
    }

    await load();
    setActionLoading(null);
  }

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-semibold text-slate-900">Matériel affecté</h2>
      {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-slate-500">Chargement…</p>
      ) : (
        <div className="space-y-3">
          {requiredMateriels.map((requirement) => {
            const requirementAssignments = assignments.filter((a) => a.mission_required_materiel_id === requirement.id);
            const slotsLeft = requirement.quantity - requirementAssignments.length;
            const eligibleInstances = availableInstances.filter((instance) => instance.materiel_type_id === requirement.materiel_type_id);

            return (
              <div key={requirement.id} className="rounded border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-700">
                    {requirement.materiel_type?.name ?? 'Type inconnu'} ({requirementAssignments.length}/{requirement.quantity})
                  </p>
                </div>

                {requirementAssignments.length > 0 ? (
                  <ul className="mt-2 flex flex-wrap gap-1">
                    {requirementAssignments.map((assignment) => (
                      <li key={assignment.id} className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">
                        {assignment.materiel_instance?.label ?? 'Instance'}
                        <button
                          type="button"
                          onClick={() => unassignInstance(assignment.materiel_instance_id)}
                          disabled={actionLoading === assignment.materiel_instance_id}
                          className="text-emerald-700 hover:text-emerald-900 disabled:opacity-50"
                          aria-label="Retirer cette affectation"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {slotsLeft > 0 ? (
                  <div className="mt-2">
                    <select
                      defaultValue=""
                      disabled={actionLoading === requirement.id || eligibleInstances.length === 0}
                      onChange={(event) => {
                        const instanceId = event.target.value;
                        if (instanceId) {
                          void assignInstance(requirement.materiel_type_id, requirement.id, instanceId);
                        }
                      }}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700"
                    >
                      <option value="" disabled>
                        {eligibleInstances.length === 0 ? 'Aucune instance disponible' : 'Affecter une instance...'}
                      </option>
                      {eligibleInstances.map((instance) => (
                        <option key={instance.id} value={instance.id}>
                          {instance.label}
                          {instance.location ? ` (${instance.location})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
