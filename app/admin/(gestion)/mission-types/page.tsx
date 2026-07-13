'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import {
  MissionType,
  MissionTypeRequiredSkill,
  Skill,
} from '@/lib/types';
import { usePermissions } from '@/lib/permissions/permissions-context';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';

type SkillRow = { skill_id: string; quantity: number };

function formatTime(time: string | null): string {
  if (!time) return '—';
  return time.slice(0, 5);
}

function SkillsEditor({
  rows,
  allSkills,
  onChange,
}: {
  rows: SkillRow[];
  allSkills: Skill[];
  onChange: (rows: SkillRow[]) => void;
}) {
  function addSkill() {
    const firstUnused = allSkills.find((s) => !rows.some((r) => r.skill_id === s.id));
    if (!firstUnused) return;
    onChange([...rows, { skill_id: firstUnused.id, quantity: 1 }]);
  }

  function updateRow(idx: number, patch: Partial<SkillRow>) {
    onChange(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function removeRow(idx: number) {
    onChange(rows.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-2">
      {rows.map((row, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <select
            value={row.skill_id}
            onChange={(e) => updateRow(idx, { skill_id: e.target.value })}
            className="flex-1 rounded-lg border border-line-field bg-surface-sub px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
          >
            {allSkills.map((s) => (
              <option key={s.id} value={s.id} disabled={rows.some((r, i) => i !== idx && r.skill_id === s.id)}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            value={row.quantity}
            onChange={(e) => updateRow(idx, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })}
            className="w-16 rounded-lg border border-line-field bg-surface-sub px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
          <button
            type="button"
            onClick={() => removeRow(idx)}
            className="rounded-md border border-bad/30 px-2 py-1 text-xs text-bad hover:bg-bad-soft"
          >
            <Icon name="close" size={13} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addSkill}
        disabled={rows.length >= allSkills.length}
        className="text-xs text-ink-2 hover:text-ink disabled:opacity-40"
      >
        + Ajouter une compétence
      </button>
    </div>
  );
}

function MissionTypeForm({
  initialName = '',
  initialDescription = '',
  initialRequiredVolunteers = 1,
  initialStartTime = '',
  initialEndTime = '',
  initialSkills = [] as SkillRow[],
  allSkills,
  onSubmit,
  onCancel,
  submitting,
  submitLabel,
}: {
  initialName?: string;
  initialDescription?: string;
  initialRequiredVolunteers?: number;
  initialStartTime?: string;
  initialEndTime?: string;
  initialSkills?: SkillRow[];
  allSkills: Skill[];
  onSubmit: (data: {
    name: string;
    description: string;
    default_required_volunteers: number;
    default_start_time: string;
    default_end_time: string;
    required_skills: SkillRow[];
  }) => void;
  onCancel?: () => void;
  submitting: boolean;
  submitLabel: string;
}) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [requiredVolunteers, setRequiredVolunteers] = useState(initialRequiredVolunteers);
  const [startTime, setStartTime] = useState(initialStartTime);
  const [endTime, setEndTime] = useState(initialEndTime);
  const [skills, setSkills] = useState<SkillRow[]>(initialSkills);

  function handleSubmit() {
    if (!name.trim()) return;
    onSubmit({ name, description, default_required_volunteers: requiredVolunteers, default_start_time: startTime, default_end_time: endTime, required_skills: skills });
  }

  return (
    <div className="rounded-xl border border-line bg-surface-card p-4 shadow-card">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-ink-2">Nom *</label>
          <input
            type="text"
            placeholder="Ex. : Maraude nocturne, DPS foot, Formation PSE1…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-line-field bg-surface-sub px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-ink-2">Description</label>
          <input
            type="text"
            placeholder="Description courte (optionnel)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border border-line-field bg-surface-sub px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-2">Secouristes requis par défaut</label>
          <input
            type="number"
            min={1}
            value={requiredVolunteers}
            onChange={(e) => setRequiredVolunteers(Math.max(1, parseInt(e.target.value, 10) || 1))}
            className="w-full rounded-lg border border-line-field bg-surface-sub px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-2">Heure de début par défaut</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full rounded-lg border border-line-field bg-surface-sub px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-2">Heure de fin par défaut</label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="w-full rounded-lg border border-line-field bg-surface-sub px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </div>
        {allSkills.length > 0 && (
          <div className="sm:col-span-2">
            <label className="mb-2 block text-xs font-medium text-ink-2">Compétences requises par défaut</label>
            <SkillsEditor rows={skills} allSkills={allSkills} onChange={setSkills} />
          </div>
        )}
      </div>
      <div className="mt-4 flex gap-2 justify-end">
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
          >
            Annuler
          </Button>
        )}
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!name.trim() || submitting}
        >
          {submitting ? 'Enregistrement...' : submitLabel}
        </Button>
      </div>
    </div>
  );
}

export default function AdminMissionTypesPage() {
  const router = useRouter();
  const { loading: permissionsLoading, can } = usePermissions();
  const canManage = can('mission_type', 'can_manage');
  const [loading, setLoading] = useState(true);
  const [missionTypes, setMissionTypes] = useState<MissionType[]>([]);
  const [allSkills, setAllSkills] = useState<Skill[]>([]);
  const [token, setToken] = useState<string>('');

  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchData = useCallback(async (tok: string) => {
    const [typesRes, skillsRes] = await Promise.all([
      fetch('/api/admin/mission-types', { headers: { Authorization: `Bearer ${tok}` } }),
      supabase.from('skills').select('id,name,category_id,display_order,created_at').order('name', { ascending: true }),
    ]);
    if (typesRes.ok) {
      const json = (await typesRes.json()) as { missionTypes: MissionType[] };
      setMissionTypes(json.missionTypes);
      setError(null);
    } else {
      const json = (await typesRes.json().catch(() => ({}))) as { error?: string };
      setError(json.error ?? 'Impossible de charger les types de mission.');
    }
    if (!skillsRes.error && skillsRes.data) {
      setAllSkills(skillsRes.data as Skill[]);
    }
  }, []);

  useEffect(() => {
    if (permissionsLoading) return;
    async function init() {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { router.replace('/login'); return; }

      if (!canManage) { setLoading(false); return; }

      const { data: sessionData } = await supabase.auth.getSession();
      const tok = sessionData.session?.access_token ?? '';
      setToken(tok);
      await fetchData(tok);
      setLoading(false);
    }
    void init();
  }, [router, fetchData, permissionsLoading, canManage]);

  function flash(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  }

  async function handleCreate(data: {
    name: string;
    description: string;
    default_required_volunteers: number;
    default_start_time: string;
    default_end_time: string;
    required_skills: SkillRow[];
  }) {
    setCreating(true);
    setError(null);
    const res = await fetch('/api/admin/mission-types', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: data.name.trim(),
        description: data.description.trim() || null,
        default_required_volunteers: data.default_required_volunteers,
        default_start_time: data.default_start_time || null,
        default_end_time: data.default_end_time || null,
        required_skills: data.required_skills,
      }),
    });
    if (res.ok) {
      await fetchData(token);
      flash('Type de mission créé.');
    } else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Erreur lors de la création.');
    }
    setCreating(false);
  }

  async function handleSaveEdit(
    id: string,
    data: {
      name: string;
      description: string;
      default_required_volunteers: number;
      default_start_time: string;
      default_end_time: string;
      required_skills: SkillRow[];
    },
  ) {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/admin/mission-types/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: data.name.trim(),
        description: data.description.trim() || null,
        default_required_volunteers: data.default_required_volunteers,
        default_start_time: data.default_start_time || null,
        default_end_time: data.default_end_time || null,
        required_skills: data.required_skills,
      }),
    });
    if (res.ok) {
      setEditingId(null);
      await fetchData(token);
      flash('Type de mission mis à jour.');
    } else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Erreur lors de la mise à jour.');
    }
    setSaving(false);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Supprimer le type de mission "${name}" ? Cette action est irréversible.`)) return;
    setError(null);
    const res = await fetch(`/api/admin/mission-types/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      await fetchData(token);
      flash('Type de mission supprimé.');
    } else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Erreur lors de la suppression.');
    }
  }

  if (loading || permissionsLoading) return <p className="text-sm text-ink-2">Chargement...</p>;

  if (!canManage) {
    return (
      <div className="rounded-xl border border-bad/30 bg-bad-soft p-4 text-sm text-bad">
        Accès refusé : vous n&apos;avez pas la permission de gérer les types de mission.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Missions"
        subtitle="Définissez les types de missions proposés par l'antenne — maraudes, postes de secours, formations, etc. — et renseignez leurs paramètres par défaut : catégorie, nombre de secouristes, horaires habituels et compétences requises."
      />

      {error ? <div className="rounded-xl border border-bad/30 bg-bad-soft p-3 text-sm text-bad">{error}</div> : null}
      {successMsg ? <div className="rounded-xl border border-ok-line bg-ok-soft p-3 text-sm text-ok-text">{successMsg}</div> : null}

      <section className="rounded-2xl border border-line bg-surface-card p-5 shadow-card md:p-6">
        <h2 className="mb-4 text-lg font-semibold text-ink">Nouveau type de mission</h2>
        <MissionTypeForm
          allSkills={allSkills}
          onSubmit={handleCreate}
          submitting={creating}
          submitLabel="Créer"
        />
      </section>

      <section className="rounded-2xl border border-line bg-surface-card p-5 shadow-card md:p-6">
        <h2 className="mb-4 text-lg font-semibold text-ink">Types existants</h2>

        {missionTypes.length === 0 ? (
          <p className="text-sm text-ink-3">Aucun type de mission défini.</p>
        ) : (
          <div className="divide-y divide-line-row overflow-hidden rounded-xl border border-line bg-surface-card">
            {missionTypes.map((mt) => {
              const isEditing = editingId === mt.id;
              const skills: SkillRow[] = (mt.required_skills ?? []).map((s: MissionTypeRequiredSkill) => ({
                skill_id: s.skill_id,
                quantity: s.quantity,
              }));

              return (
                <div key={mt.id} className="p-4">
                  {isEditing ? (
                    <MissionTypeForm
                      initialName={mt.name}
                      initialDescription={mt.description ?? ''}
                      initialRequiredVolunteers={mt.default_required_volunteers}
                      initialStartTime={mt.default_start_time?.slice(0, 5) ?? ''}
                      initialEndTime={mt.default_end_time?.slice(0, 5) ?? ''}
                      initialSkills={skills}
                      allSkills={allSkills}
                      onSubmit={(data) => handleSaveEdit(mt.id, data)}
                      onCancel={() => setEditingId(null)}
                      submitting={saving}
                      submitLabel="Enregistrer"
                    />
                  ) : (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1.5">
                        <p className="font-medium text-ink">{mt.name}</p>
                        {mt.description ? <p className="text-sm text-ink-2">{mt.description}</p> : null}
                        <div className="flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full border border-accent-ring bg-accent-soft px-2 py-0.5 text-accent-text">
                            {mt.default_required_volunteers} secouriste{mt.default_required_volunteers > 1 ? 's' : ''}
                          </span>
                          {mt.default_start_time || mt.default_end_time ? (
                            <span className="rounded-full border border-warn-line bg-warn-soft px-2 py-0.5 text-warn-text">
                              {formatTime(mt.default_start_time)} – {formatTime(mt.default_end_time)}
                            </span>
                          ) : null}
                          {(mt.required_skills ?? []).map((s: MissionTypeRequiredSkill) => (
                            <span key={s.id} className="rounded-full border border-[#E9C9E4] bg-acsso-soft px-2 py-0.5 text-acsso-text">
                              {s.skill?.name ?? '—'}{s.quantity > 1 ? ` ×${s.quantity}` : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingId(mt.id)}
                          className="rounded-md border border-line px-2.5 py-1 text-xs text-ink-2 hover:bg-surface-sub"
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(mt.id, mt.name)}
                          className="rounded-md border border-bad/30 px-2.5 py-1 text-xs text-bad hover:bg-bad-soft"
                        >
                          Supprimer
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
