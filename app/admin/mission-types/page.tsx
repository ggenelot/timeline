'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import {
  MissionCategory,
  MISSION_CATEGORY_LABELS,
  MISSION_CATEGORY_OPTIONS,
  MissionType,
  MissionTypeRequiredSkill,
  Profile,
  Skill,
} from '@/lib/types';

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
            className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
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
            className="w-16 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
          <button
            type="button"
            onClick={() => removeRow(idx)}
            className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-500 hover:bg-red-50"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addSkill}
        disabled={rows.length >= allSkills.length}
        className="text-xs text-slate-500 hover:text-slate-700 disabled:opacity-40"
      >
        + Ajouter une compétence
      </button>
    </div>
  );
}

function MissionTypeForm({
  initialName = '',
  initialDescription = '',
  initialCategory = '' as MissionCategory | '',
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
  initialCategory?: MissionCategory | '';
  initialRequiredVolunteers?: number;
  initialStartTime?: string;
  initialEndTime?: string;
  initialSkills?: SkillRow[];
  allSkills: Skill[];
  onSubmit: (data: {
    name: string;
    description: string;
    category: MissionCategory | '';
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
  const [category, setCategory] = useState<MissionCategory | ''>(initialCategory);
  const [requiredVolunteers, setRequiredVolunteers] = useState(initialRequiredVolunteers);
  const [startTime, setStartTime] = useState(initialStartTime);
  const [endTime, setEndTime] = useState(initialEndTime);
  const [skills, setSkills] = useState<SkillRow[]>(initialSkills);

  function handleSubmit() {
    if (!name.trim()) return;
    onSubmit({ name, description, category, default_required_volunteers: requiredVolunteers, default_start_time: startTime, default_end_time: endTime, required_skills: skills });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-slate-600">Nom *</label>
          <input
            type="text"
            placeholder="Ex. : Maraude nocturne, DPS foot, Formation PSE1…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-slate-600">Description</label>
          <input
            type="text"
            placeholder="Description courte (optionnel)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Catégorie</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as MissionCategory | '')}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            <option value="">— Aucune —</option>
            {MISSION_CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Secouristes requis par défaut</label>
          <input
            type="number"
            min={1}
            value={requiredVolunteers}
            onChange={(e) => setRequiredVolunteers(Math.max(1, parseInt(e.target.value, 10) || 1))}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Heure de début par défaut</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Heure de fin par défaut</label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>
        {allSkills.length > 0 && (
          <div className="sm:col-span-2">
            <label className="mb-2 block text-xs font-medium text-slate-600">Compétences requises par défaut</label>
            <SkillsEditor rows={skills} allSkills={allSkills} onChange={setSkills} />
          </div>
        )}
      </div>
      <div className="mt-4 flex gap-2 justify-end">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Annuler
          </button>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!name.trim() || submitting}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Enregistrement...' : submitLabel}
        </button>
      </div>
    </div>
  );
}

export default function AdminMissionTypesPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
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
      supabase.from('skills').select('id,name,category,level,created_at').order('name', { ascending: true }),
    ]);
    if (typesRes.ok) {
      const json = (await typesRes.json()) as { missionTypes: MissionType[] };
      setMissionTypes(json.missionTypes);
    }
    if (!skillsRes.error && skillsRes.data) {
      setAllSkills(skillsRes.data as Skill[]);
    }
  }, []);

  useEffect(() => {
    async function init() {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { router.replace('/login'); return; }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('id,full_name,email,phone,role,sector,created_at')
        .eq('id', authData.user.id)
        .single();

      if (!profileData || profileData.role !== 'admin') {
        setLoading(false);
        setProfile(profileData ?? null);
        return;
      }

      setProfile(profileData);
      const { data: sessionData } = await supabase.auth.getSession();
      const tok = sessionData.session?.access_token ?? '';
      setToken(tok);
      await fetchData(tok);
      setLoading(false);
    }
    void init();
  }, [router, fetchData]);

  function flash(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  }

  async function handleCreate(data: {
    name: string;
    description: string;
    category: MissionCategory | '';
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
        category: data.category || null,
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
      category: MissionCategory | '';
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
        category: data.category || null,
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

  if (loading) return <p className="text-sm text-slate-600">Chargement...</p>;

  if (!profile || profile.role !== 'admin') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Accès refusé : page réservée aux administrateurs.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Types de missions</h1>
        <p className="mt-1 text-sm text-slate-500">
          Définissez les types de missions proposés par l&apos;antenne — maraudes, postes de secours, formations, etc. —
          et renseignez leurs paramètres par défaut : catégorie, nombre de secouristes, horaires habituels et
          compétences requises.
        </p>
      </header>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {successMsg ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{successMsg}</div> : null}

      <section className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/40 p-5 shadow-sm md:p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Nouveau type de mission</h2>
        <MissionTypeForm
          allSkills={allSkills}
          onSubmit={handleCreate}
          submitting={creating}
          submitLabel="Créer"
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/40 p-5 shadow-sm md:p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Types existants</h2>

        {missionTypes.length === 0 ? (
          <p className="text-sm text-slate-400">Aucun type de mission défini.</p>
        ) : (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
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
                      initialCategory={mt.category ?? ''}
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
                        <p className="font-medium text-slate-800">{mt.name}</p>
                        {mt.description ? <p className="text-sm text-slate-500">{mt.description}</p> : null}
                        <div className="flex flex-wrap gap-2 text-xs">
                          {mt.category ? (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                              {MISSION_CATEGORY_LABELS[mt.category]}
                            </span>
                          ) : (
                            <span className="rounded-full bg-slate-50 px-2 py-0.5 text-slate-400">Toutes catégories</span>
                          )}
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">
                            {mt.default_required_volunteers} secouriste{mt.default_required_volunteers > 1 ? 's' : ''}
                          </span>
                          {mt.default_start_time || mt.default_end_time ? (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">
                              {formatTime(mt.default_start_time)} – {formatTime(mt.default_end_time)}
                            </span>
                          ) : null}
                          {(mt.required_skills ?? []).map((s: MissionTypeRequiredSkill) => (
                            <span key={s.id} className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-700">
                              {s.skill?.name ?? '—'}{s.quantity > 1 ? ` ×${s.quantity}` : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingId(mt.id)}
                          className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(mt.id, mt.name)}
                          className="rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50"
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
