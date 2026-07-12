'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { MissionStatus, MissionType, Profile, RoleBehaviorResourceType, RoleBehaviorType } from '@/lib/types';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';

type Role = {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  is_system: boolean;
  created_at: string;
};

type RoleBehavior = {
  id: string;
  role_id: string;
  resource_type: RoleBehaviorResourceType;
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
  can_see: 'Peut voir',
  can_create: 'Peut créer',
  can_manage: 'Peut gérer',
  required_for_visibility: 'Est référent pour la visibilité',
  auto_slack: 'Est ajouté automatiquement sur Slack',
};

const BEHAVIOR_DESCRIPTIONS: Record<RoleBehaviorType, string> = {
  can_see: 'Lecture : les membres voient les éléments de la ressource. Pour les missions : types et statuts sélectionnés ; si un comportement "référent" couvre un type, un référent disponible est requis.',
  can_create: 'Création : les membres peuvent créer des éléments de la ressource (missions : des brouillons des types sélectionnés).',
  can_manage: 'Gestion : édition, suppression, validation. Inclut la lecture ("Peut voir").',
  required_for_visibility: 'Les membres rendent visibles les événements de leurs types (pour les rôles avec "Peut voir"). Ils voient toujours ces missions eux-mêmes.',
  auto_slack: 'Les membres sont invités automatiquement sur les canaux Slack des missions sélectionnées',
};

const ALL_MISSION_STATUSES: { value: MissionStatus; label: string }[] = [
  { value: 'draft', label: 'Brouillon' },
  { value: 'proposed', label: 'Proposé' },
  { value: 'confirmed', label: 'Confirmé' },
  { value: 'closed', label: 'Clôturé' },
  { value: 'cancelled', label: 'Annulé' },
];

// Missions : les 5 comportements (dont les 2 spécifiques référent/Slack).
// Autres ressources : les 3 actions génériques — même règle que la contrainte
// SQL role_behaviors_action_per_resource_check.
const MISSION_BEHAVIOR_TYPES: RoleBehaviorType[] = ['can_see', 'can_create', 'can_manage', 'required_for_visibility', 'auto_slack'];
const GENERIC_BEHAVIOR_TYPES: RoleBehaviorType[] = ['can_see', 'can_create', 'can_manage'];

const ALL_RESOURCE_TYPES: RoleBehaviorResourceType[] = [
  'mission',
  'cursus',
  'materiel',
  'volunteer',
  'skill',
  'mission_type',
  'settings',
  'administration',
];

const RESOURCE_TYPE_LABELS: Record<RoleBehaviorResourceType, string> = {
  mission: 'Missions',
  cursus: 'Cursus',
  materiel: 'Matériel',
  volunteer: 'Bénévoles',
  skill: 'Compétences',
  mission_type: 'Types de mission',
  settings: 'Réglages',
  administration: 'Administration (rôles)',
};

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
  const [behaviorForms, setBehaviorForms] = useState<Record<string, { resourceType: RoleBehaviorResourceType; type: RoleBehaviorType | ''; missionTypeIds: string[]; missionStatuses: string[] }>>({});
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
    return behaviorForms[roleId] ?? { resourceType: 'mission' as RoleBehaviorResourceType, type: '', missionTypeIds: [], missionStatuses: [] };
  }

  function setBehaviorForm(roleId: string, update: Partial<{ resourceType: RoleBehaviorResourceType; type: RoleBehaviorType | ''; missionTypeIds: string[]; missionStatuses: string[] }>) {
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
        resource_type: form.resourceType,
        mission_type_ids: form.resourceType === 'mission' ? form.missionTypeIds : [],
        mission_statuses: form.resourceType === 'mission' && form.type === 'can_see' ? form.missionStatuses : [],
      }),
    });
    if (res.ok) {
      setBehaviorForms((prev) => ({ ...prev, [roleId]: { resourceType: 'mission', type: '', missionTypeIds: [], missionStatuses: [] } }));
      await fetchData(token);
      flash('Comportement ajouté.');
    } else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? "Erreur lors de l'ajout du comportement.");
    }
    setAddingBehavior((prev) => ({ ...prev, [roleId]: false }));
  }

  // Preset « présidente » : accorde la lecture (can_see) sur chaque ressource
  // pas encore couverte par un can_see ou un can_manage.
  async function handlePresetReadAll(roleId: string) {
    setAddingBehavior((prev) => ({ ...prev, [roleId]: true }));
    setError(null);
    const existing = data.roleBehaviors.filter((b) => b.role_id === roleId);
    const missing = ALL_RESOURCE_TYPES.filter(
      (rt) => !existing.some((b) => b.resource_type === rt && (b.behavior_type === 'can_see' || b.behavior_type === 'can_manage'))
    );
    for (const resource of missing) {
      const res = await fetch(`/api/admin/roles/${roleId}/behaviors`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ behavior_type: 'can_see', resource_type: resource, mission_type_ids: [], mission_statuses: [] }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        setError(json.error ?? "Erreur lors de l'ajout du comportement.");
        break;
      }
    }
    await fetchData(token);
    if (missing.length > 0) flash('Lecture accordée sur toutes les ressources.');
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

  if (loading) return <p className="text-sm text-ink-2">Chargement...</p>;

  if (!profile || profile.role !== 'admin') {
    return (
      <div className="rounded-xl border border-bad/30 bg-bad-soft p-4 text-sm text-bad">
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
      <PageHeader
        title="Rôles"
        subtitle="Définissez les rôles qui structurent les droits et comportements des bénévoles. Les rôles sont cumulables."
      />

      {error ? <div className="rounded-xl border border-bad/30 bg-bad-soft p-3 text-sm text-bad">{error}</div> : null}
      {successMsg ? <div className="rounded-xl border border-ok-line bg-ok-soft p-3 text-sm text-ok-text">{successMsg}</div> : null}

      {/* Create role form */}
      <section className="rounded-2xl border border-line bg-surface-card p-5 shadow-card md:p-6">
        <h2 className="mb-4 text-lg font-semibold text-ink">Créer un rôle</h2>
        <div className="rounded-xl border border-line bg-surface-card p-4 shadow-card">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              placeholder="Nom du rôle (ex : Chef de poste)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 rounded-lg border border-line-field bg-surface-sub px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
            <input
              type="text"
              placeholder="Description (optionnel)"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              className="flex-1 rounded-lg border border-line-field bg-surface-sub px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              onClick={handleCreate}
              disabled={!newName.trim() || creating}
            >
              {creating ? 'Création...' : 'Créer'}
            </Button>
          </div>
        </div>
      </section>

      {/* Roles list */}
      {data.roles.length === 0 ? (
        <p className="text-sm text-ink-3">Aucun rôle défini.</p>
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
              <div key={role.id} className="rounded-2xl border border-line bg-surface-card p-5 shadow-card md:p-6">
                {/* Role header */}
                {isEditing ? (
                  <div className="mb-4 space-y-3">
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        disabled={role.is_system}
                        title={role.is_system ? 'Le nom du rôle système ne peut pas être modifié.' : undefined}
                        className="flex-1 rounded-lg border border-line-field bg-surface-sub px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                      <input
                        type="text"
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        placeholder="Description (optionnel)"
                        className="flex-1 rounded-lg border border-line-field bg-surface-sub px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-brand/30"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        onClick={() => handleSaveEdit(role.id)}
                        disabled={!editName.trim() || saving}
                        className="px-3 py-1.5"
                      >
                        {saving ? 'Enregistrement...' : 'Enregistrer'}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1.5"
                      >
                        Annuler
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-ink">{role.name}</p>
                        {role.is_system && (
                          <span className="rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
                            Système
                          </span>
                        )}
                        {role.is_default && (
                          <span className="rounded-full border border-warn-line bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn-text">
                            Rôle par défaut
                          </span>
                        )}
                      </div>
                      {role.description ? <p className="text-sm text-ink-2">{role.description}</p> : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {!role.is_system && (
                        <button
                          type="button"
                          onClick={() => handleSetDefault(role.id, role)}
                          disabled={settingDefault[role.id]}
                          className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                            role.is_default
                              ? 'border-warn-line text-warn-text hover:bg-warn-soft'
                              : 'border-line text-ink-2 hover:bg-surface-sub'
                          }`}
                        >
                          {settingDefault[role.id]
                            ? '...'
                            : role.is_default
                              ? 'Retirer défaut'
                              : 'Définir par défaut'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(role.id);
                          setEditName(role.name);
                          setEditDescription(role.description ?? '');
                        }}
                        className="rounded-md border border-line px-2.5 py-1 text-xs text-ink-2 hover:bg-surface-sub"
                      >
                        Modifier
                      </button>
                      {!role.is_default && !role.is_system && (
                        <button
                          type="button"
                          onClick={() => handleDelete(role.id, role.name)}
                          className="rounded-md border border-bad/30 px-2.5 py-1 text-xs text-bad hover:bg-bad-soft"
                        >
                          Supprimer
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Volunteers section */}
                <div className="mb-5">
                  <p className="mb-2 text-sm font-medium text-ink-2">Bénévoles</p>
                  {holders.length > 0 ? (
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {holders.map((h) => (
                        <span
                          key={h.id}
                          className="inline-flex items-center gap-1 rounded-full border border-ok-line bg-ok-soft py-0.5 pl-2.5 pr-1 text-xs font-medium text-ok-text"
                        >
                          {h.full_name ?? h.email}
                          <button
                            type="button"
                            onClick={() => handleRemoveVolunteer(role.id, h.id)}
                            className="ml-0.5 flex items-center rounded-full p-0.5 hover:bg-ok-line"
                            aria-label={`Retirer ${h.full_name ?? h.email}`}
                          >
                            <Icon name="close" size={13} />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mb-3 text-xs text-ink-3">Aucun bénévole dans ce rôle.</p>
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
                    <Button
                      type="button"
                      onClick={() => handleAssignVolunteer(role.id)}
                      disabled={!assignProfileIds[role.id] || assigning[role.id]}
                    >
                      {assigning[role.id] ? 'Ajout...' : 'Ajouter'}
                    </Button>
                  </div>
                </div>

                {/* Behaviors section */}
                {role.is_system ? (
                  <div className="rounded-xl border border-brand/20 bg-brand/5 px-3 py-2.5 text-sm text-ink-2">
                    Ce rôle a tous les droits sur toutes les ressources — aucun comportement à configurer.
                  </div>
                ) : (
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-ink-2">Comportements</p>
                    <button
                      type="button"
                      onClick={() => handlePresetReadAll(role.id)}
                      disabled={addingBehavior[role.id]}
                      title="Accorde la lecture (Peut voir) sur toutes les ressources — ex. rôle de supervision type présidence."
                      className="rounded-md border border-line px-2.5 py-1 text-xs text-ink-2 hover:bg-surface-sub"
                    >
                      {addingBehavior[role.id] ? '...' : 'Lecture sur tout'}
                    </button>
                  </div>
                  {behaviors.length > 0 ? (
                    <div className="mb-3 space-y-2">
                      {behaviors.map((b) => (
                        <div
                          key={b.id}
                          className="flex flex-col gap-2 rounded-xl border border-[#E9C9E4] bg-acsso-soft px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-medium text-white">
                                {RESOURCE_TYPE_LABELS[b.resource_type]}
                              </span>
                              <p className="text-xs font-semibold text-acsso-text">{BEHAVIOR_LABELS[b.behavior_type]}</p>
                            </div>
                            {b.resource_type === 'mission' && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {b.mission_type_ids.length === 0 ? (
                                  <span className="rounded-full bg-line px-2 py-0.5 text-xs text-ink-2">Tous les types</span>
                                ) : (
                                  b.mission_type_ids.map((id) => (
                                    <span key={id} className="rounded-full bg-line px-2 py-0.5 text-xs text-ink-2">
                                      {missionTypeById.get(id)?.name ?? id}
                                    </span>
                                  ))
                                )}
                                {b.behavior_type === 'can_see' && (
                                  b.mission_statuses.length === 0 ? (
                                    <span className="rounded-full border border-accent-ring bg-accent-soft px-2 py-0.5 text-xs text-accent-text">Tous les statuts</span>
                                  ) : (
                                    b.mission_statuses.map((s) => (
                                      <span key={s} className="rounded-full border border-accent-ring bg-accent-soft px-2 py-0.5 text-xs text-accent-text">
                                        {ALL_MISSION_STATUSES.find((ms) => ms.value === s)?.label ?? s}
                                      </span>
                                    ))
                                  )
                                )}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteBehavior(role.id, b.id)}
                            className="shrink-0 self-start rounded-md border border-[#E9C9E4] px-2 py-0.5 text-xs text-acsso-text hover:bg-acsso-soft sm:self-auto"
                            aria-label="Supprimer ce comportement"
                          >
                            <Icon name="close" size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mb-3 text-xs text-ink-3">Aucun comportement défini.</p>
                  )}

                  {/* Add behavior form */}
                  <div className="rounded-xl border border-line bg-surface-card p-3 shadow-card">
                    <p className="mb-2 text-xs font-medium text-ink-2">Ajouter un comportement</p>
                    <div className="mb-3">
                      <select
                        value={behaviorForm.resourceType}
                        onChange={(e) => setBehaviorForm(role.id, {
                          resourceType: e.target.value as RoleBehaviorResourceType,
                          type: '',
                          missionTypeIds: [],
                          missionStatuses: [],
                        })}
                        className="w-full rounded-lg border border-line-field bg-surface-sub px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
                      >
                        {ALL_RESOURCE_TYPES.map((rt) => (
                          <option key={rt} value={rt}>{RESOURCE_TYPE_LABELS[rt]}</option>
                        ))}
                      </select>
                    </div>
                    <div className="mb-3">
                      <select
                        value={behaviorForm.type}
                        onChange={(e) => setBehaviorForm(role.id, { type: e.target.value as RoleBehaviorType | '', missionTypeIds: [], missionStatuses: [] })}
                        className="w-full rounded-lg border border-line-field bg-surface-sub px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
                      >
                        <option value="">— Choisir un type de comportement —</option>
                        {(behaviorForm.resourceType === 'mission' ? MISSION_BEHAVIOR_TYPES : GENERIC_BEHAVIOR_TYPES).map((bt) => (
                          <option key={bt} value={bt}>{BEHAVIOR_LABELS[bt]}</option>
                        ))}
                      </select>
                      {behaviorForm.type ? (
                        <p className="mt-1 text-xs text-ink-2">{BEHAVIOR_DESCRIPTIONS[behaviorForm.type]}</p>
                      ) : null}
                    </div>

                    {behaviorForm.type && behaviorForm.resourceType === 'mission' ? (
                      <div className="mb-3 space-y-3">
                        <div>
                          <p className="mb-1.5 text-xs font-medium text-ink-2">Types de missions concernés</p>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setBehaviorForm(role.id, { missionTypeIds: [] })}
                              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                                behaviorForm.missionTypeIds.length === 0
                                  ? 'border-[#E9C9E4] bg-acsso-soft text-acsso-text'
                                  : 'border-line bg-surface-sub text-ink-2 hover:bg-line-row'
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
                                    ? 'border-[#E9C9E4] bg-acsso-soft text-acsso-text'
                                    : 'border-line bg-surface-sub text-ink-2 hover:bg-line-row'
                                }`}
                              >
                                {mt.name}
                              </button>
                            ))}
                          </div>
                        </div>

                        {behaviorForm.type === 'can_see' && (
                          <div>
                            <p className="mb-1.5 text-xs font-medium text-ink-2">Statuts visibles</p>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => setBehaviorForm(role.id, { missionStatuses: [] })}
                                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                                  behaviorForm.missionStatuses.length === 0
                                    ? 'border-accent-ring bg-accent-soft text-accent-text'
                                    : 'border-line bg-surface-sub text-ink-2 hover:bg-line-row'
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
                                      ? 'border-accent-ring bg-accent-soft text-accent-text'
                                      : 'border-line bg-surface-sub text-ink-2 hover:bg-line-row'
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
                      <Button
                        type="button"
                        onClick={() => handleAddBehavior(role.id)}
                        disabled={!behaviorForm.type || addingBehavior[role.id]}
                      >
                        {addingBehavior[role.id] ? 'Ajout...' : 'Ajouter le comportement'}
                      </Button>
                    </div>
                  </div>
                </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
