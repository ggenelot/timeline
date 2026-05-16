'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { getMissionCategory, MISSION_CATEGORY_LABELS, MISSION_TYPE_OPTIONS, Profile } from '@/lib/types';
import { SearchableSelect } from '@/components/ui/searchable-select';

type Responsibility = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
};

type HolderProfile = {
  id: string;
  full_name: string | null;
  email: string;
  slack_user_id: string | null;
  slack_username: string | null;
};

type HolderRow = {
  id: string;
  responsibility_id: string;
  profile_id: string;
  created_at: string;
  profile: HolderProfile | HolderProfile[] | null;
};

type CategoryMapping = {
  id: string;
  mission_type_id: string;
  responsibility_id: string;
  created_at: string;
};

type ApiData = {
  responsibilities: Responsibility[];
  holders: HolderRow[];
  categoryMappings: CategoryMapping[];
};

type VolunteerOption = {
  id: string;
  full_name: string | null;
  email: string;
};

function resolveProfile(profile: HolderProfile | HolderProfile[] | null): HolderProfile | null {
  if (!profile) return null;
  return Array.isArray(profile) ? (profile[0] ?? null) : profile;
}

export default function AdminResponsabilitesPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ApiData>({ responsibilities: [], holders: [], categoryMappings: [] });
  const [volunteers, setVolunteers] = useState<VolunteerOption[]>([]);
  const [token, setToken] = useState<string>('');

  // Create responsibility form
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);

  // Edit responsibility
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);

  // Category mapping form
  const [mapCategory, setMapCategory] = useState<string>('aaaaaaaa-0000-0000-0000-000000000002');
  const [mapResponsibilityId, setMapResponsibilityId] = useState('');
  const [addingMapping, setAddingMapping] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchData = useCallback(async (tok: string) => {
    const res = await fetch('/api/admin/responsibilities', {
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
      if (!authData.user) {
        router.replace('/login');
        return;
      }

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

      const [, volunteersRes] = await Promise.all([
        fetchData(tok),
        supabase.from('profiles').select('id,full_name,email').order('full_name', { ascending: true })
      ]);

      setVolunteers((volunteersRes.data ?? []) as VolunteerOption[]);
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
    const res = await fetch('/api/admin/responsibilities', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), description: newDescription.trim() || null })
    });
    if (res.ok) {
      setNewName('');
      setNewDescription('');
      await fetchData(token);
      flash('Responsabilité créée.');
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
    const res = await fetch(`/api/admin/responsibilities/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName.trim(), description: editDescription.trim() || null })
    });
    if (res.ok) {
      setEditingId(null);
      await fetchData(token);
      flash('Responsabilité mise à jour.');
    } else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Erreur lors de la mise à jour.');
    }
    setSaving(false);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Supprimer la responsabilité "${name}" ? Cette action est irréversible.`)) return;
    setError(null);
    const res = await fetch(`/api/admin/responsibilities/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      await fetchData(token);
      flash('Responsabilité supprimée.');
    } else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Erreur lors de la suppression.');
    }
  }

  async function handleSetHolder(responsibilityId: string, profileId: string) {
    setError(null);
    const res = await fetch(`/api/admin/responsibilities/${responsibilityId}/holder`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile_id: profileId })
    });
    if (res.ok) {
      await fetchData(token);
      flash('Titulaire mis à jour.');
    } else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Erreur lors de la mise à jour du titulaire.');
    }
  }

  async function handleRemoveHolder(responsibilityId: string) {
    setError(null);
    const res = await fetch(`/api/admin/responsibilities/${responsibilityId}/holder`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      await fetchData(token);
      flash('Titulaire retiré.');
    } else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Erreur lors du retrait du titulaire.');
    }
  }

  async function handleAddMapping() {
    if (!mapResponsibilityId) return;
    setAddingMapping(true);
    setError(null);
    const res = await fetch('/api/admin/category-responsibilities', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mission_type_id: mapCategory, responsibility_id: mapResponsibilityId })
    });
    if (res.ok) {
      await fetchData(token);
      flash('Association ajoutée.');
      setMapResponsibilityId('');
    } else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Erreur lors de l\'ajout.');
    }
    setAddingMapping(false);
  }

  async function handleRemoveMapping(id: string) {
    setError(null);
    const res = await fetch(`/api/admin/category-responsibilities/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      await fetchData(token);
      flash('Association supprimée.');
    } else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Erreur lors de la suppression.');
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-600">Chargement...</p>;
  }

  if (!profile || profile.role !== 'admin') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Accès refusé : page réservée aux administrateurs.
      </div>
    );
  }

  const holderByResponsibilityId = new Map<string, HolderProfile | null>();
  for (const h of data.holders) {
    holderByResponsibilityId.set(h.responsibility_id, resolveProfile(h.profile));
  }

  const mappingsByMissionType = new Map<string, CategoryMapping[]>();
  for (const m of data.categoryMappings) {
    const list = mappingsByMissionType.get(m.mission_type_id) ?? [];
    list.push(m);
    mappingsByMissionType.set(m.mission_type_id, list);
  }

  const responsibilityById = new Map(data.responsibilities.map((r) => [r.id, r]));

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Responsabilités</h1>
        <p className="mt-1 text-sm text-slate-500">
          Définissez des responsabilités, affectez un titulaire à chacune, puis configurez lesquelles s&apos;appliquent
          automatiquement par catégorie d&apos;activité. Les titulaires sont invités au canal Slack lors de la
          synchronisation.
        </p>
      </header>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : null}

      {successMsg ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{successMsg}</div>
      ) : null}

      {/* ── Section 1 : Responsabilités ── */}
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/40 p-5 shadow-sm md:p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">1. Responsabilités</h2>

        {/* Create form */}
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm font-medium text-slate-700">Nouvelle responsabilité</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              placeholder="Nom (ex : Responsable PSC1)"
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

        {/* List */}
        {data.responsibilities.length === 0 ? (
          <p className="text-sm text-slate-400">Aucune responsabilité définie.</p>
        ) : (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {data.responsibilities.map((r) => {
              const holder = holderByResponsibilityId.get(r.id) ?? null;
              const isEditing = editingId === r.id;

              return (
                <div key={r.id} className="p-4">
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
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(r.id)}
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
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800">{r.name}</p>
                        {r.description ? <p className="text-sm text-slate-500">{r.description}</p> : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Holder picker */}
                        <SearchableSelect
                          value={holder?.id ?? ''}
                          options={volunteers.map((v) => ({ value: v.id, label: v.full_name ?? v.email }))}
                          onChange={(val) => {
                            if (val === '') void handleRemoveHolder(r.id);
                            else void handleSetHolder(r.id, val);
                          }}
                          emptyLabel="— Aucun titulaire —"
                          className="w-48"
                        />

                        {holder ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                            {holder.slack_username ? `@${holder.slack_username}` : (holder.full_name ?? holder.email)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                            Sans titulaire
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(r.id);
                            setEditName(r.name);
                            setEditDescription(r.description ?? '');
                          }}
                          className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(r.id, r.name)}
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

      {/* ── Section 2 : Configuration par catégorie ── */}
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/40 p-5 shadow-sm md:p-6">
        <h2 className="mb-1 text-lg font-semibold text-slate-800">2. Responsabilités par catégorie d&apos;activité</h2>
        <p className="mb-5 text-sm text-slate-500">
          Choisissez quelles responsabilités sont automatiquement ajoutées au canal Slack pour chaque type d&apos;activité.
        </p>

        {/* Add mapping form */}
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm font-medium text-slate-700">Ajouter une association</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <SearchableSelect
              value={mapCategory}
              options={MISSION_TYPE_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
              onChange={(val) => setMapCategory(val)}
              className="w-48"
            />
            <SearchableSelect
              value={mapResponsibilityId}
              options={data.responsibilities.map((r) => ({ value: r.id, label: r.name }))}
              onChange={setMapResponsibilityId}
              emptyLabel="— Choisir une responsabilité —"
              className="flex-1"
            />
            <button
              type="button"
              onClick={handleAddMapping}
              disabled={!mapResponsibilityId || addingMapping}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {addingMapping ? 'Ajout...' : 'Ajouter'}
            </button>
          </div>
        </div>

        {/* Category summary */}
        <div className="space-y-4">
          {MISSION_TYPE_OPTIONS.map((cat) => {
            const mappings = mappingsByMissionType.get(cat.value) ?? [];
            return (
              <div key={cat.value} className="rounded-xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
                  <span className="font-medium text-slate-800">{cat.label}</span>
                  <span className="text-xs text-slate-400">{mappings.length} responsabilité{mappings.length !== 1 ? 's' : ''}</span>
                </div>
                {mappings.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-slate-400">Aucune responsabilité associée.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {mappings.map((m) => {
                      const resp = responsibilityById.get(m.responsibility_id);
                      const holder = resp ? (holderByResponsibilityId.get(resp.id) ?? null) : null;
                      return (
                        <li key={m.id} className="flex items-center justify-between px-4 py-2.5">
                          <div>
                            <span className="text-sm font-medium text-slate-700">{resp?.name ?? '—'}</span>
                            {holder ? (
                              <span className="ml-2 text-sm text-slate-500">
                                → {holder.full_name ?? holder.email}
                                {holder.slack_username ? ` (@${holder.slack_username})` : ''}
                              </span>
                            ) : (
                              <span className="ml-2 text-xs text-amber-600">sans titulaire</span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveMapping(m.id)}
                            className="rounded-md border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50"
                          >
                            Retirer
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
    </div>
  );
}
