'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { getMissionCategory, MISSION_CATEGORY_LABELS, MISSION_TYPE_OPTIONS, Profile } from '@/lib/types';
import { SearchableSelect } from '@/components/ui/searchable-select';

type Aptitude = {
  id: string;
  name: string;
  description: string | null;
  allowed_mission_type_ids: string[];
  created_at: string;
};

type VolunteerProfile = {
  id: string;
  full_name: string | null;
  email: string;
};

type ProfileAptitudeRow = {
  id: string;
  profile_id: string;
  aptitude_id: string;
  created_at: string;
  profile: VolunteerProfile | VolunteerProfile[] | null;
};

type ApiData = {
  aptitudes: Aptitude[];
  profileAptitudes: ProfileAptitudeRow[];
};

function resolveProfile(profile: VolunteerProfile | VolunteerProfile[] | null): VolunteerProfile | null {
  if (!profile) return null;
  return Array.isArray(profile) ? (profile[0] ?? null) : profile;
}


export default function AdminAptitudesPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ApiData>({ aptitudes: [], profileAptitudes: [] });
  const [volunteers, setVolunteers] = useState<VolunteerProfile[]>([]);
  const [token, setToken] = useState<string>('');

  // Create form
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newMissionTypeIds, setNewMissionTypeIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editMissionTypeIds, setEditMissionTypeIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Volunteer assignment
  const [assignAptitudeId, setAssignAptitudeId] = useState('');
  const [assignProfileId, setAssignProfileId] = useState('');
  const [assigning, setAssigning] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchData = useCallback(async (tok: string) => {
    const res = await fetch('/api/admin/aptitudes', {
      headers: { Authorization: `Bearer ${tok}` }
    });
    if (res.ok) {
      const json = (await res.json()) as ApiData;
      setData(json);
    }
  }, []);

  useEffect(() => {
    async function init() {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { router.replace('/login'); return; }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('id,full_name,email,role,sector,created_at')
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

      const [, volunteersRes] = await Promise.all([
        fetchData(tok),
        supabase.from('profiles').select('id,full_name,email').order('full_name', { ascending: true })
      ]);

      setVolunteers((volunteersRes.data ?? []) as VolunteerProfile[]);
      setLoading(false);
    }
    void init();
  }, [router, fetchData]);

  function flash(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  }

  function toggleMissionTypeId(id: string, selected: string[], set: (v: string[]) => void) {
    set(selected.includes(id) ? selected.filter((c) => c !== id) : [...selected, id]);
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    const res = await fetch('/api/admin/aptitudes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), description: newDescription.trim() || null, allowed_mission_type_ids: newMissionTypeIds })
    });
    if (res.ok) {
      setNewName(''); setNewDescription(''); setNewMissionTypeIds([]);
      await fetchData(token);
      flash('Aptitude créée.');
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
    const res = await fetch(`/api/admin/aptitudes/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName.trim(), description: editDescription.trim() || null, allowed_mission_type_ids: editMissionTypeIds })
    });
    if (res.ok) {
      setEditingId(null);
      await fetchData(token);
      flash('Aptitude mise à jour.');
    } else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Erreur lors de la mise à jour.');
    }
    setSaving(false);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Supprimer l'aptitude "${name}" ? Cette action est irréversible.`)) return;
    setError(null);
    const res = await fetch(`/api/admin/aptitudes/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) { await fetchData(token); flash('Aptitude supprimée.'); }
    else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Erreur lors de la suppression.');
    }
  }

  async function handleAssignVolunteer() {
    if (!assignAptitudeId || !assignProfileId) return;
    setAssigning(true);
    setError(null);
    const res = await fetch(`/api/admin/aptitudes/${assignAptitudeId}/volunteers`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile_id: assignProfileId })
    });
    if (res.ok) {
      setAssignProfileId('');
      await fetchData(token);
      flash('Bénévole ajouté à l\'aptitude.');
    } else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Erreur lors de l\'ajout.');
    }
    setAssigning(false);
  }

  async function handleRemoveVolunteer(aptitudeId: string, profileId: string) {
    setError(null);
    const res = await fetch(`/api/admin/aptitudes/${aptitudeId}/volunteers`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile_id: profileId })
    });
    if (res.ok) { await fetchData(token); flash('Bénévole retiré de l\'aptitude.'); }
    else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Erreur lors du retrait.');
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

  // Group profile_aptitudes by aptitude
  const holdersByAptitudeId = new Map<string, VolunteerProfile[]>();
  for (const pa of data.profileAptitudes) {
    const p = resolveProfile(pa.profile);
    if (!p) continue;
    const list = holdersByAptitudeId.get(pa.aptitude_id) ?? [];
    list.push(p);
    holdersByAptitudeId.set(pa.aptitude_id, list);
  }

  // Volunteers already holding a given aptitude (for the assign form)
  const assignedProfileIds = new Set(
    data.profileAptitudes
      .filter((pa) => pa.aptitude_id === assignAptitudeId)
      .map((pa) => pa.profile_id)
  );

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Aptitudes</h1>
        <p className="mt-1 text-sm text-slate-500">
          Définissez les aptitudes qui permettent aux bénévoles de créer des missions en brouillon. Chaque aptitude
          autorise la création d&apos;un ou plusieurs types d&apos;événements. Les aptitudes sont cumulables.
        </p>
      </header>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {successMsg ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{successMsg}</div> : null}

      {/* ── Section 1 : Créer une aptitude ── */}
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/40 p-5 shadow-sm md:p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">1. Aptitudes</h2>

        {/* Create form */}
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm font-medium text-slate-700">Nouvelle aptitude</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              placeholder="Nom (ex : Formateur PSC1)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
            <input
              type="text"
              placeholder="Description (optionnel)"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-medium text-slate-600">Types d&apos;événements autorisés</p>
            <div className="flex flex-wrap gap-2">
              {MISSION_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleMissionTypeId(opt.value, newMissionTypeIds, setNewMissionTypeIds)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    newMissionTypeIds.includes(opt.value)
                      ? 'border-emerald-400 bg-emerald-100 text-emerald-800'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={handleCreate}
              disabled={!newName.trim() || newMissionTypeIds.length === 0 || creating}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? 'Création...' : 'Créer'}
            </button>
          </div>
        </div>

        {/* List */}
        {data.aptitudes.length === 0 ? (
          <p className="text-sm text-slate-400">Aucune aptitude définie.</p>
        ) : (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {data.aptitudes.map((apt) => {
              const holders = holdersByAptitudeId.get(apt.id) ?? [];
              const isEditing = editingId === apt.id;
              return (
                <div key={apt.id} className="p-4">
                  {isEditing ? (
                    <div className="space-y-3">
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
                        />
                        <input
                          type="text"
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          placeholder="Description (optionnel)"
                          className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
                        />
                      </div>
                      <div>
                        <p className="mb-1.5 text-xs font-medium text-slate-600">Types d&apos;événements autorisés</p>
                        <div className="flex flex-wrap gap-2">
                          {MISSION_TYPE_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => toggleMissionTypeId(opt.value, editMissionTypeIds, setEditMissionTypeIds)}
                              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                                editMissionTypeIds.includes(opt.value)
                                  ? 'border-emerald-400 bg-emerald-100 text-emerald-800'
                                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(apt.id)}
                          disabled={!editName.trim() || editMissionTypeIds.length === 0 || saving}
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
                    <div className="space-y-2">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800">{apt.name}</p>
                          {apt.description ? <p className="text-sm text-slate-500">{apt.description}</p> : null}
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {apt.allowed_mission_type_ids.length === 0 ? (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">Aucune catégorie</span>
                            ) : apt.allowed_mission_type_ids.map((id) => (
                              <span key={id} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                                {MISSION_CATEGORY_LABELS[getMissionCategory(id)]}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(apt.id);
                              setEditName(apt.name);
                              setEditDescription(apt.description ?? '');
                              setEditMissionTypeIds([...apt.allowed_mission_type_ids]);
                            }}
                            className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
                          >
                            Modifier
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(apt.id, apt.name)}
                            className="rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50"
                          >
                            Supprimer
                          </button>
                        </div>
                      </div>

                      {/* Holders list */}
                      {holders.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {holders.map((h) => (
                            <span key={h.id} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 pl-2.5 pr-1 py-0.5 text-xs font-medium text-emerald-800">
                              {h.full_name ?? h.email}
                              <button
                                type="button"
                                onClick={() => handleRemoveVolunteer(apt.id, h.id)}
                                className="ml-0.5 flex items-center rounded-full p-0.5 hover:bg-emerald-200"
                                aria-label={`Retirer ${h.full_name ?? h.email}`}
                              >
                                ✕
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400">Aucun bénévole avec cette aptitude.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Section 2 : Attribuer une aptitude ── */}
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/40 p-5 shadow-sm md:p-6">
        <h2 className="mb-1 text-lg font-semibold text-slate-800">2. Attribuer une aptitude à un bénévole</h2>
        <p className="mb-5 text-sm text-slate-500">
          Les aptitudes sont cumulables : un bénévole peut en avoir plusieurs.
        </p>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row">
            <SearchableSelect
              value={assignAptitudeId}
              options={data.aptitudes.map((apt) => ({ value: apt.id, label: apt.name }))}
              onChange={(val) => { setAssignAptitudeId(val); setAssignProfileId(''); }}
              emptyLabel="— Choisir une aptitude —"
              className="flex-1"
            />
            <SearchableSelect
              value={assignProfileId}
              options={volunteers
                .filter((v) => !assignedProfileIds.has(v.id))
                .map((v) => ({ value: v.id, label: v.full_name ?? v.email }))}
              onChange={setAssignProfileId}
              emptyLabel="— Choisir un bénévole —"
              disabled={!assignAptitudeId}
              className="flex-1"
            />
            <button
              type="button"
              onClick={handleAssignVolunteer}
              disabled={!assignAptitudeId || !assignProfileId || assigning}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {assigning ? 'Ajout...' : 'Attribuer'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
