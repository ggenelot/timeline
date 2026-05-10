'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { MissionCategory, MISSION_CATEGORY_LABELS, MISSION_CATEGORY_OPTIONS, MissionType, Profile } from '@/lib/types';

const CATEGORY_OPTIONS = MISSION_CATEGORY_OPTIONS;

function formatTime(time: string | null): string {
  if (!time) return '—';
  return time.slice(0, 5);
}

export default function AdminMissionTypesPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [missionTypes, setMissionTypes] = useState<MissionType[]>([]);
  const [token, setToken] = useState<string>('');

  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState<MissionCategory | ''>('');
  const [newRequiredVolunteers, setNewRequiredVolunteers] = useState(1);
  const [newStartTime, setNewStartTime] = useState('');
  const [newEndTime, setNewEndTime] = useState('');
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState<MissionCategory | ''>('');
  const [editRequiredVolunteers, setEditRequiredVolunteers] = useState(1);
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchData = useCallback(async (tok: string) => {
    const res = await fetch('/api/admin/mission-types', {
      headers: { Authorization: `Bearer ${tok}` },
    });
    if (res.ok) {
      const json = (await res.json()) as { missionTypes: MissionType[] };
      setMissionTypes(json.missionTypes);
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

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    const res = await fetch('/api/admin/mission-types', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newName.trim(),
        description: newDescription.trim() || null,
        category: newCategory || null,
        default_required_volunteers: newRequiredVolunteers,
        default_start_time: newStartTime || null,
        default_end_time: newEndTime || null,
      }),
    });
    if (res.ok) {
      setNewName('');
      setNewDescription('');
      setNewCategory('');
      setNewRequiredVolunteers(1);
      setNewStartTime('');
      setNewEndTime('');
      await fetchData(token);
      flash('Type de mission créé.');
    } else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Erreur lors de la création.');
    }
    setCreating(false);
  }

  async function handleSaveEdit(id: string) {
    if (!editName.trim()) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/admin/mission-types/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editName.trim(),
        description: editDescription.trim() || null,
        category: editCategory || null,
        default_required_volunteers: editRequiredVolunteers,
        default_start_time: editStartTime || null,
        default_end_time: editEndTime || null,
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

  function startEdit(mt: MissionType) {
    setEditingId(mt.id);
    setEditName(mt.name);
    setEditDescription(mt.description ?? '');
    setEditCategory(mt.category ?? '');
    setEditRequiredVolunteers(mt.default_required_volunteers);
    setEditStartTime(mt.default_start_time?.slice(0, 5) ?? '');
    setEditEndTime(mt.default_end_time?.slice(0, 5) ?? '');
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
          Définissez les types de missions récurrentes avec leurs caractéristiques par défaut : nombre de secouristes,
          horaires habituels et catégorie. Ces valeurs servent de point de départ lors de la création d&apos;une mission.
        </p>
      </header>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {successMsg ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{successMsg}</div> : null}

      <section className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/40 p-5 shadow-sm md:p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Nouveau type de mission</h2>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-600">Nom *</label>
              <input
                type="text"
                placeholder="Ex : Maraude hebdomadaire"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-600">Description</label>
              <input
                type="text"
                placeholder="Description courte (optionnel)"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Catégorie par défaut</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as MissionCategory | '')}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
              >
                <option value="">— Aucune —</option>
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Secouristes requis par défaut</label>
              <input
                type="number"
                min={1}
                value={newRequiredVolunteers}
                onChange={(e) => setNewRequiredVolunteers(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Heure de début par défaut</label>
              <input
                type="time"
                value={newStartTime}
                onChange={(e) => setNewStartTime(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Heure de fin par défaut</label>
              <input
                type="time"
                value={newEndTime}
                onChange={(e) => setNewEndTime(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={handleCreate}
              disabled={!newName.trim() || creating}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? 'Création...' : 'Créer'}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/40 p-5 shadow-sm md:p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Types existants</h2>

        {missionTypes.length === 0 ? (
          <p className="text-sm text-slate-400">Aucun type de mission défini.</p>
        ) : (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {missionTypes.map((mt) => {
              const isEditing = editingId === mt.id;
              return (
                <div key={mt.id} className="p-4">
                  {isEditing ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <label className="mb-1 block text-xs font-medium text-slate-600">Nom *</label>
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="mb-1 block text-xs font-medium text-slate-600">Description</label>
                          <input
                            type="text"
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            placeholder="Description courte (optionnel)"
                            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-600">Catégorie par défaut</label>
                          <select
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value as MissionCategory | '')}
                            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
                          >
                            <option value="">— Aucune —</option>
                            {CATEGORY_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-600">Secouristes requis par défaut</label>
                          <input
                            type="number"
                            min={1}
                            value={editRequiredVolunteers}
                            onChange={(e) => setEditRequiredVolunteers(Math.max(1, parseInt(e.target.value, 10) || 1))}
                            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-600">Heure de début par défaut</label>
                          <input
                            type="time"
                            value={editStartTime}
                            onChange={(e) => setEditStartTime(e.target.value)}
                            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-600">Heure de fin par défaut</label>
                          <input
                            type="time"
                            value={editEndTime}
                            onChange={(e) => setEditEndTime(e.target.value)}
                            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(mt.id)}
                          disabled={!editName.trim() || saving}
                          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                        >
                          {saving ? 'Enregistrement...' : 'Enregistrer'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
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
                          {(mt.default_start_time || mt.default_end_time) ? (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">
                              {formatTime(mt.default_start_time)} – {formatTime(mt.default_end_time)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(mt)}
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
