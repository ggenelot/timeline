'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { MissionStatus, MissionType, Profile, RoleBehaviorType } from '@/lib/types';
import { SearchableSelect } from '@/components/ui/searchable-select';

type Role = {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  created_at: string;
};

type RoleBehavior = {
  id: string;
  role_id: string;
  behavior_type: RoleBehaviorType;
  mission_type_ids: string[];
  mission_statuses: string[];
  created_at: string;
};

type VolunteerProfile = {
  id: string;
  full_name: string | null;
  email: string;
};

type ProfileRoleRow = {
  id: string;
  profile_id: string;
  role_id: string;
  created_at: string;
  profile: VolunteerProfile | VolunteerProfile[] | null;
};

type ApiData = {
  roles: Role[];
  profileRoles: ProfileRoleRow[];
  roleBehaviors: RoleBehavior[];
};

function resolveProfile(profile: VolunteerProfile | VolunteerProfile[] | null): VolunteerProfile | null {
  if (!profile) return null;
  return Array.isArray(profile) ? (profile[0] ?? null) : profile;
}

const BEHAVIOR_LABELS: Record<RoleBehaviorType, string> = {
  can_see: 'Peut voir des événements',
  can_create: 'Peut créer des événements',
  can_manage: 'Peut gérer des événements',
  required_for_visibility: 'Est référent pour la visibilité',
  auto_slack: 'Est ajouté automatiquement sur Slack',
};

const BEHAVIOR_DESCRIPTIONS: Record<RoleBehaviorType, string> = {
  can_see: 'Les membres voient les événements des types et statuts sélectionnés. Si un comportement "référent" couvre ce type, un référent disponible est requis.',
  can_create: 'Les membres peuvent créer des brouillons pour les types sélectionnés',
  can_manage: 'Les membres ont des droits d\'administration sur les événements sélectionnés. Sans restriction de type = droits admin complets.',
  required_for_visibility: 'Les membres rendent visibles les événements de leurs types (pour les rôles avec can_see). Ils voient toujours ces missions eux-mêmes.',
  auto_slack: 'Les membres sont invités automatiquement sur les canaux Slack des missions sélectionnées',
};

const ALL_MISSION_STATUSES: { value: MissionStatus; label: string }[] = [
  { value: 'draft', label: 'Brouillon' },
  { value: 'proposed', label: 'Proposé' },
  { value: 'confirmed', label: 'Confirmé' },
  { value: 'closed', label: 'Clôturé' },
  { value: 'cancelled', label: 'Annulé' },
];

const ALL_BEHAVIOR_TYPES: RoleBehaviorType[] = ['can_see', 'can_create', 'can_manage', 'required_for_visibility', 'auto_slack'];

export default function AdminRolesPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ApiData>({ roles: [], profileRoles: [], roleBehaviors: [] });
  const [missionTypes, setMissionTypes] = useState<Pick<MissionType, 'id' | 'name'>[]>([]);
  const [volunteers, setVolunteers] = useState<VolunteerProfile[]>([]);
  const [token, setToken] = useState<string>('');

  // Create role form
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);

  // Volunteer assignment per role (roleId -> selectedProfileId)
  const [assignProfileIds, setAssignProfileIds] = useState<Record<string, string>>({});
  const [assigning, setAssigning] = useState<Record<string, boolean>>({});

  // Add behavior per role (roleId -> form state)
  const [behaviorForms, setBehaviorForms] = useState<Record<string, { type: RoleBehaviorType | ''; missionTypeIds: string[]; missionStatuses: string[] }>>({});
  const [addingBehavior, setAddingBehavior] = useState<Record<string, boolean>>({});
  const [settingDefault, setSettingDefault] = useState<Record<string, boolean>>({});

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchData = useCallback(async (tok: string) => {
    const res = await fetch('/api/admin/roles', {
      headers: { Authorization: `Bearer ${tok}` },
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
        .select('id,full_name,email,role,created_at')
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

      const [, volunteersRes, mtRes] = await Promise.all([
        fetchData(tok),
        supabase.from('profiles').select('id,full_name,email').order('full_name', { ascending: true }),
        supabase.from('mission_types').select('id,name').order('name', { ascending: true }),
      ]);

      setVolunteers((volunteersRes.data ?? []) as VolunteerProfile[]);
      setMissionTypes((mtRes.data ?? []) as Pick<MissionType, 'id' | 'name'>[]);
      setLoading(false);
    }
    void init();
  }, [router, fetchData]);

  function flash(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  }

  function toggleMissionType(id: string, selected: string[], setter: (v: string[]) => void) {
    setter(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  }

  // ---- Role CRUD ----

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    const res = await fetch('/api/admin/roles', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), description: newDescription.trim() || null }),
    });
    if (res.ok) {
      setNewName('');
      setNewDescription('');
      await fetchData(token);
      flash('Rôle créé.');
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
    const res = await fetch(`/api/admin/roles/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName.trim(), description: editDescription.trim() || null }),
    });
    if (res.ok) {
      setEditingId(null);
      await fetchData(token);
      flash('Rôle mis à jour.');
    } else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Erreur lors de la mise à jour.');
    }
    setSaving(false);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Supprimer le rôle "${name}" ? Cette action est irréversible.`)) return;
    setError(null);
    const res = await fetch(`/api/admin/roles/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) { await fetchData(token); flash('Rôle supprimé.'); }
    else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Erreur lors de la suppression.');
    }
  }

  // ---- Volunteer assignment ----

  async function handleAssignVolunteer(roleId: string) {
    const profileId = assignProfileIds[roleId];
    if (!profileId) return;
    setAssigning((prev) => ({ ...prev, [roleId]: true }));
    setError(null);
    const res = await fetch(`/api/admin/roles/${roleId}/volunteers`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile_id: profileId }),
    });
    if (res.ok) {
      setAssignProfileIds((prev) => ({ ...prev, [roleId]: '' }));
      await fetchData(token);
      flash('Bénévole ajouté au rôle.');
    } else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? "Erreur lors de l'ajout.");
    }
    setAssigning((prev) => ({ ...prev, [roleId]: false }));
  }

  async function handleRemoveVolunteer(roleId: string, profileId: string) {
    setError(null);
    const res = await fetch(`/api/admin/roles/${roleId}/volunteers`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile_id: profileId }),
    });
    if (res.ok) { await fetchData(token); flash('Bénévole retiré du rôle.'); }
    else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Erreur lors du retrait.');
    }
  }

  // ---- Behaviors ----

  function getBehaviorForm(roleId: string) {
    return behaviorForms[roleId] ?? { type: '', missionTypeIds: [], missionStatuses: [] };
  }

  function setBehaviorForm(roleId: string, update: Partial<{ type: RoleBehaviorType | ''; missionTypeIds: string[]; missionStatuses: string[] }>) {
    setBehaviorForms((prev) => ({
      ...prev,
      [roleId]: { ...getBehaviorForm(roleId), ...update },
    }));
  }

  async function handleSetDefault(roleId: string, role: Role) {
    setSettingDefault((prev) => ({ ...prev, [roleId]: true }));
    setError(null);
    const newIsDefault = !role.is_default;
    const res = await fetch(`/api/admin/roles/${roleId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: role.name, description: role.description, is_default: newIsDefault }),
    });
    if (res.ok) {
      await fetchData(token);
      flash(newIsDefault ? 'Rôle défini comme rôle par défaut.' : 'Rôle par défaut retiré.');
    } else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Erreur lors de la mise à jour.');
    }
    setSettingDefault((prev) => ({ ...prev, [roleId]: false }));
  }

  async function handleAddBehavior(roleId: string) {
    const form = getBehaviorForm(roleId);
    if (!form.type) return;
    setAddingBehavior((prev) => ({ ...prev, [roleId]: true }));
    setError(null);
    const res = await fetch(`/api/admin/roles/${roleId}/behaviors`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        behavior_type: form.type,
        mission_type_ids: form.missionTypeIds,
        mission_statuses: form.type === 'can_see' ? form.missionStatuses : [],
      }),
    });
    if (res.ok) {
      setBehaviorForms((prev) => ({ ...prev, [roleId]: { type: '', missionTypeIds: [], missionStatuses: [] } }));
      await fetchData(token);
      flash('Comportement ajouté.');
    } else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? "Erreur lors de l'ajout du comportement.");
    }
    setAddingBehavior((prev) => ({ ...prev, [roleId]: false }));
  }

  async function handleDeleteBehavior(roleId: string, behaviorId: string) {
    setError(null);
    const res = await fetch(`/api/admin/roles/${roleId}/behaviors/${behaviorId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) { await fetchData(token); flash('Comportement supprimé.'); }
    else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Erreur lors de la suppression du comportement.');
    }
  }

  // ---- Render ----

  if (loading) return <p className="text-sm text-slate-600">Chargement...</p>;

  if (!profile || profile.role !== 'admin') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Accès refusé : page réservée aux administrateurs.
      </div>
    );
  }

  const missionTypeById = new Map(missionTypes.map((mt) => [mt.id, mt]));

  // Group data by role
  const profilesByRoleId = new Map<string, VolunteerProfile[]>();
  for (const pr of data.profileRoles) {
    const p = resolveProfile(pr.profile);
    if (!p) continue;
    const list = profilesByRoleId.get(pr.role_id) ?? [];
    list.push(p);
    profilesByRoleId.set(pr.role_id, list);
  }

  const behaviorsByRoleId = new Map<string, RoleBehavior[]>();
  for (const rb of data.roleBehaviors) {
    const list = behaviorsByRoleId.get(rb.role_id) ?? [];
    list.push(rb);
    behaviorsByRoleId.set(rb.role_id, list);
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Rôles</h1>
        <p className="mt-1 text-sm text-slate-500">
          Définissez les rôles qui structurent les droits et comportements des bénévoles. Les rôles sont cumulables.
        </p>
      </header>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {successMsg ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{successMsg}</div> : null}

      {/* Create role form */}
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/40 p-5 shadow-sm md:p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Créer un rôle</h2>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              placeholder="Nom du rôle (ex : Chef de poste)"
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
          <div className="mt-3 flex justify-end">
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

      {/* Roles list */}
      {data.roles.length === 0 ? (
        <p className="text-sm text-slate-400">Aucun rôle défini.</p>
      ) : (
        <div className="space-y-6">
          {data.roles.map((role) => {
            const holders = profilesByRoleId.get(role.id) ?? [];
            const behaviors = behaviorsByRoleId.get(role.id) ?? [];
            const isEditing = editingId === role.id;
            const assignedProfileIdSet = new Set(
              data.profileRoles.filter((pr) => pr.role_id === role.id).map((pr) => pr.profile_id)
            );
            const behaviorForm = getBehaviorForm(role.id);

            return (
              <div key={role.id} className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/40 p-5 shadow-sm md:p-6">
                {/* Role header */}
                {isEditing ? (
                  <div className="mb-4 space-y-3">
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
                        onClick={() => handleSaveEdit(role.id)}
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
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-800">{role.name}</p>
                        {role.is_default && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                            Rôle par défaut
                          </span>
                        )}
                      </div>
                      {role.description ? <p className="text-sm text-slate-500">{role.description}</p> : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleSetDefault(role.id, role)}
                        disabled={settingDefault[role.id]}
                        className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                          role.is_default
                            ? 'border-amber-200 text-amber-700 hover:bg-amber-50'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {settingDefault[role.id]
                          ? '...'
                          : role.is_default
                            ? 'Retirer défaut'
                            : 'Définir par défaut'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(role.id);
                          setEditName(role.name);
                          setEditDescription(role.description ?? '');
                        }}
                        className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
                      >
                        Modifier
                      </button>
                      {!role.is_default && (
                        <button
                          type="button"
                          onClick={() => handleDelete(role.id, role.name)}
                          className="rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          Supprimer
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Volunteers section */}
                <div className="mb-5">
                  <p className="mb-2 text-sm font-medium text-slate-700">Bénévoles</p>
                  {holders.length > 0 ? (
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {holders.map((h) => (
                        <span
                          key={h.id}
                          className="inline-flex items-center gap-1 rounded-full bg-emerald-100 py-0.5 pl-2.5 pr-1 text-xs font-medium text-emerald-800"
                        >
                          {h.full_name ?? h.email}
                          <button
                            type="button"
                            onClick={() => handleRemoveVolunteer(role.id, h.id)}
                            className="ml-0.5 flex items-center rounded-full p-0.5 hover:bg-emerald-200"
                            aria-label={`Retirer ${h.full_name ?? h.email}`}
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mb-3 text-xs text-slate-400">Aucun bénévole dans ce rôle.</p>
                  )}
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <SearchableSelect
                      value={assignProfileIds[role.id] ?? ''}
                      options={volunteers
                        .filter((v) => !assignedProfileIdSet.has(v.id))
                        .map((v) => ({ value: v.id, label: v.full_name ?? v.email }))}
                      onChange={(val) => setAssignProfileIds((prev) => ({ ...prev, [role.id]: val }))}
                      emptyLabel="— Ajouter un bénévole —"
                      className="flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => handleAssignVolunteer(role.id)}
                      disabled={!assignProfileIds[role.id] || assigning[role.id]}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {assigning[role.id] ? 'Ajout...' : 'Ajouter'}
                    </button>
                  </div>
                </div>

                {/* Behaviors section */}
                <div>
                  <p className="mb-2 text-sm font-medium text-slate-700">Comportements</p>
                  {behaviors.length > 0 ? (
                    <div className="mb-3 space-y-2">
                      {behaviors.map((b) => (
                        <div
                          key={b.id}
                          className="flex flex-col gap-2 rounded-xl border border-violet-100 bg-violet-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-violet-800">{BEHAVIOR_LABELS[b.behavior_type]}</p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {b.mission_type_ids.length === 0 ? (
                                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">Tous les types</span>
                              ) : (
                                b.mission_type_ids.map((id) => (
                                  <span key={id} className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
                                    {missionTypeById.get(id)?.name ?? id}
                                  </span>
                                ))
                              )}
                              {b.behavior_type === 'can_see' && (
                                b.mission_statuses.length === 0 ? (
                                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">Tous les statuts</span>
                                ) : (
                                  b.mission_statuses.map((s) => (
                                    <span key={s} className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                                      {ALL_MISSION_STATUSES.find((ms) => ms.value === s)?.label ?? s}
                                    </span>
                                  ))
                                )
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteBehavior(role.id, b.id)}
                            className="shrink-0 self-start rounded-md border border-violet-200 px-2 py-0.5 text-xs text-violet-700 hover:bg-violet-100 sm:self-auto"
                            aria-label="Supprimer ce comportement"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mb-3 text-xs text-slate-400">Aucun comportement défini.</p>
                  )}

                  {/* Add behavior form */}
                  <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <p className="mb-2 text-xs font-medium text-slate-600">Ajouter un comportement</p>
                    <div className="mb-3">
                      <select
                        value={behaviorForm.type}
                        onChange={(e) => setBehaviorForm(role.id, { type: e.target.value as RoleBehaviorType | '', missionTypeIds: [], missionStatuses: [] })}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
                      >
                        <option value="">— Choisir un type de comportement —</option>
                        {ALL_BEHAVIOR_TYPES.map((bt) => (
                          <option key={bt} value={bt}>{BEHAVIOR_LABELS[bt]}</option>
                        ))}
                      </select>
                      {behaviorForm.type ? (
                        <p className="mt-1 text-xs text-slate-500">{BEHAVIOR_DESCRIPTIONS[behaviorForm.type]}</p>
                      ) : null}
                    </div>

                    {behaviorForm.type ? (
                      <div className="mb-3 space-y-3">
                        <div>
                          <p className="mb-1.5 text-xs font-medium text-slate-600">Types de missions concernés</p>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setBehaviorForm(role.id, { missionTypeIds: [] })}
                              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                                behaviorForm.missionTypeIds.length === 0
                                  ? 'border-violet-400 bg-violet-100 text-violet-800'
                                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              Tous les types
                            </button>
                            {missionTypes.map((mt) => (
                              <button
                                key={mt.id}
                                type="button"
                                onClick={() => {
                                  const current = behaviorForm.missionTypeIds;
                                  toggleMissionType(mt.id, current, (next) => setBehaviorForm(role.id, { missionTypeIds: next }));
                                }}
                                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                                  behaviorForm.missionTypeIds.includes(mt.id)
                                    ? 'border-violet-400 bg-violet-100 text-violet-800'
                                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                {mt.name}
                              </button>
                            ))}
                          </div>
                        </div>

                        {behaviorForm.type === 'can_see' && (
                          <div>
                            <p className="mb-1.5 text-xs font-medium text-slate-600">Statuts visibles</p>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => setBehaviorForm(role.id, { missionStatuses: [] })}
                                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                                  behaviorForm.missionStatuses.length === 0
                                    ? 'border-blue-400 bg-blue-100 text-blue-800'
                                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                Tous les statuts
                              </button>
                              {ALL_MISSION_STATUSES.map((ms) => (
                                <button
                                  key={ms.value}
                                  type="button"
                                  onClick={() => {
                                    const current = behaviorForm.missionStatuses;
                                    toggleMissionType(ms.value, current, (next) => setBehaviorForm(role.id, { missionStatuses: next }));
                                  }}
                                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                                    behaviorForm.missionStatuses.includes(ms.value)
                                      ? 'border-blue-400 bg-blue-100 text-blue-800'
                                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                                  }`}
                                >
                                  {ms.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : null}

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleAddBehavior(role.id)}
                        disabled={!behaviorForm.type || addingBehavior[role.id]}
                        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {addingBehavior[role.id] ? 'Ajout...' : 'Ajouter le comportement'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
