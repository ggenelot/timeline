'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Profile } from '@/lib/types';

type VisibilityRule = {
  id: string;
  name: string;
  description: string | null;
  criterion_type: 'skill' | 'aptitude';
  criterion_id: string;
  required_status: string | null;
  is_active: boolean;
  created_at: string;
};

const STATUS_OPTIONS: { value: string | null; label: string }[] = [
  { value: null,        label: 'Tous les statuts' },
  { value: 'proposed',  label: 'Proposé' },
  { value: 'closed',    label: 'Clôturé' },
  { value: 'confirmed', label: 'Confirmé' },
  { value: 'cancelled', label: 'Annulé' },
];

function getStatusLabel(status: string | null): string {
  return STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status ?? 'Tous les statuts';
}

type SkillOption = { id: string; name: string; category: string | null };
type AptitudeOption = { id: string; name: string };

type ApiData = {
  rules: VisibilityRule[];
  skills: SkillOption[];
  aptitudes: AptitudeOption[];
};

const CRITERION_TYPE_LABELS: Record<string, string> = {
  skill: 'Compétence',
  aptitude: 'Aptitude'
};

export default function AdminVisibilitePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ApiData>({ rules: [], skills: [], aptitudes: [] });
  const [token, setToken] = useState<string>('');

  // Create form
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCriterionType, setNewCriterionType] = useState<'skill' | 'aptitude'>('skill');
  const [newCriterionId, setNewCriterionId] = useState('');
  const [newRequiredStatus, setNewRequiredStatus] = useState<string | null>(null);
  const [newIsActive, setNewIsActive] = useState(true);
  const [creating, setCreating] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCriterionType, setEditCriterionType] = useState<'skill' | 'aptitude'>('skill');
  const [editCriterionId, setEditCriterionId] = useState('');
  const [editRequiredStatus, setEditRequiredStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchData = useCallback(async (tok: string) => {
    const res = await fetch('/api/admin/visibility-rules', {
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

  function getCriterionLabel(rule: VisibilityRule): string {
    if (rule.criterion_type === 'skill') {
      const skill = data.skills.find((s) => s.id === rule.criterion_id);
      return skill ? skill.name : rule.criterion_id;
    }
    const apt = data.aptitudes.find((a) => a.id === rule.criterion_id);
    return apt ? apt.name : rule.criterion_id;
  }

  async function handleCreate() {
    if (!newName.trim() || !newCriterionId) return;
    setCreating(true);
    setError(null);
    const res = await fetch('/api/admin/visibility-rules', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newName.trim(),
        description: newDescription.trim() || null,
        criterion_type: newCriterionType,
        criterion_id: newCriterionId,
        required_status: newRequiredStatus,
        is_active: newIsActive
      })
    });
    if (res.ok) {
      setNewName(''); setNewDescription(''); setNewCriterionId(''); setNewRequiredStatus(null); setNewIsActive(true);
      await fetchData(token);
      flash('Règle créée.');
    } else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Erreur lors de la création.');
    }
    setCreating(false);
  }

  async function handleSaveEdit(id: string) {
    if (!editName.trim() || !editCriterionId) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/admin/visibility-rules/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editName.trim(),
        description: editDescription.trim() || null,
        criterion_type: editCriterionType,
        criterion_id: editCriterionId,
        required_status: editRequiredStatus
      })
    });
    if (res.ok) {
      setEditingId(null);
      await fetchData(token);
      flash('Règle mise à jour.');
    } else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Erreur lors de la mise à jour.');
    }
    setSaving(false);
  }

  async function handleToggleActive(rule: VisibilityRule) {
    setError(null);
    const res = await fetch(`/api/admin/visibility-rules/${rule.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !rule.is_active })
    });
    if (res.ok) {
      await fetchData(token);
      flash(rule.is_active ? 'Règle désactivée.' : 'Règle activée.');
    } else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Erreur lors de la mise à jour.');
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Supprimer la règle "${name}" ? Cette action est irréversible.`)) return;
    setError(null);
    const res = await fetch(`/api/admin/visibility-rules/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) { await fetchData(token); flash('Règle supprimée.'); }
    else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Erreur lors de la suppression.');
    }
  }

  function CriterionSelect({
    type,
    value,
    onChange
  }: {
    type: 'skill' | 'aptitude';
    value: string;
    onChange: (v: string) => void;
  }) {
    const options = type === 'skill' ? data.skills : data.aptitudes;
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
      >
        <option value="">— Choisir —</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
    );
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
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Règles de visibilité</h1>
        <p className="mt-1 text-sm text-slate-500">
          Définissez quels bénévoles voient toutes les missions. Les bénévoles qui correspondent à une
          règle active (<strong>groupe privilégié</strong>) voient toutes les missions. Les autres ne
          voient que les missions sur lesquelles un membre du groupe privilégié est disponible.
          Si aucune règle n&apos;est active, les bénévoles voient uniquement les missions pour
          lesquelles ils ont été explicitement sollicités.
        </p>
      </header>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {successMsg ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{successMsg}</div> : null}

      {/* ── Créer une règle ── */}
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/40 p-5 shadow-sm md:p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Nouvelle règle</h2>

        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              placeholder="Nom (ex : Visibilité CP)"
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

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <span className="shrink-0 text-sm font-medium text-slate-700">Groupe privilégié :</span>
            <select
              value={newCriterionType}
              onChange={(e) => { setNewCriterionType(e.target.value as 'skill' | 'aptitude'); setNewCriterionId(''); }}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              <option value="skill">Compétence</option>
              <option value="aptitude">Aptitude</option>
            </select>
            <CriterionSelect type={newCriterionType} value={newCriterionId} onChange={setNewCriterionId} />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <span className="shrink-0 text-sm font-medium text-slate-700">Statut requis :</span>
            <select
              value={newRequiredStatus ?? ''}
              onChange={(e) => setNewRequiredStatus(e.target.value || null)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value ?? '__all'} value={o.value ?? ''}>{o.label}</option>
              ))}
            </select>
            <span className="text-xs text-slate-400">
              Le groupe voit les missions avec ce statut (et les non-membres les voient si un membre est disponible).
            </span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="new-is-active"
              checked={newIsActive}
              onChange={(e) => setNewIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-300"
            />
            <label htmlFor="new-is-active" className="text-sm text-slate-700">Activer immédiatement</label>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleCreate}
              disabled={!newName.trim() || !newCriterionId || creating}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? 'Création...' : 'Créer'}
            </button>
          </div>
        </div>
      </section>

      {/* ── Liste des règles ── */}
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/40 p-5 shadow-sm md:p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Règles existantes</h2>

        {data.rules.length === 0 ? (
          <p className="text-sm text-slate-400">Aucune règle définie. Sans règle active, les bénévoles voient uniquement les missions pour lesquelles ils ont été sollicités.</p>
        ) : (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {data.rules.map((rule) => {
              const isEditing = editingId === rule.id;
              return (
                <div key={rule.id} className="p-4">
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
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <span className="shrink-0 text-sm font-medium text-slate-700">Groupe privilégié :</span>
                        <select
                          value={editCriterionType}
                          onChange={(e) => { setEditCriterionType(e.target.value as 'skill' | 'aptitude'); setEditCriterionId(''); }}
                          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
                        >
                          <option value="skill">Compétence</option>
                          <option value="aptitude">Aptitude</option>
                        </select>
                        <CriterionSelect type={editCriterionType} value={editCriterionId} onChange={setEditCriterionId} />
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <span className="shrink-0 text-sm font-medium text-slate-700">Statut requis :</span>
                        <select
                          value={editRequiredStatus ?? ''}
                          onChange={(e) => setEditRequiredStatus(e.target.value || null)}
                          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
                        >
                          {STATUS_OPTIONS.map((o) => (
                            <option key={o.value ?? '__all'} value={o.value ?? ''}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(rule.id)}
                          disabled={!editName.trim() || !editCriterionId || saving}
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
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-slate-800">{rule.name}</p>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            rule.is_active
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}>
                            {rule.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        {rule.description ? (
                          <p className="text-sm text-slate-500">{rule.description}</p>
                        ) : null}
                        <p className="text-sm text-slate-600">
                          <span className="font-medium">Groupe privilégié :</span>{' '}
                          {CRITERION_TYPE_LABELS[rule.criterion_type]}{' '}
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                            {getCriterionLabel(rule)}
                          </span>
                        </p>
                        <p className="text-sm text-slate-600">
                          <span className="font-medium">Statut visible :</span>{' '}
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            rule.required_status
                              ? 'bg-violet-100 text-violet-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}>
                            {getStatusLabel(rule.required_status)}
                          </span>
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(rule)}
                          className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                            rule.is_active
                              ? 'border-amber-200 text-amber-700 hover:bg-amber-50'
                              : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                          }`}
                        >
                          {rule.is_active ? 'Désactiver' : 'Activer'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(rule.id);
                            setEditName(rule.name);
                            setEditDescription(rule.description ?? '');
                            setEditCriterionType(rule.criterion_type);
                            setEditCriterionId(rule.criterion_id);
                            setEditRequiredStatus(rule.required_status);
                          }}
                          className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(rule.id, rule.name)}
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

      {/* ── Explication ── */}
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5 md:p-6">
        <h2 className="mb-3 text-base font-semibold text-slate-700">Comment ça fonctionne</h2>
        <ul className="space-y-2 text-sm text-slate-600">
          <li>
            <strong>Groupe privilégié</strong> : bénévoles ayant la compétence ou l&apos;aptitude spécifiée.
            Ils voient toutes les missions dont le statut correspond au filtre défini (ou toutes les missions
            non-brouillon si aucun filtre n&apos;est configuré).
          </li>
          <li>
            <strong>Statut requis</strong> : si une règle a un filtre de statut (ex. <em>Proposé</em>),
            le groupe ne voit que les missions ayant ce statut. Sans filtre, ils voient toutes les missions
            non-brouillon.
          </li>
          <li>
            <strong>Autres bénévoles</strong> : voient uniquement les missions couvertes par une règle active
            (statut correspondant) sur lesquelles un membre du groupe privilégié a répondu <em>disponible</em>.
          </li>
          <li>
            <strong>Exemple</strong> : règle &laquo; CP &raquo; avec statut <em>Proposé</em> — les CP voient
            toutes les missions proposées ; les non-CP voient les missions proposées où au moins un CP est disponible.
          </li>
          <li>
            <strong>Plusieurs règles actives</strong> : chaque règle est évaluée indépendamment. Une mission
            est visible dès qu&apos;une règle l&apos;autorise.
          </li>
          <li>
            <strong>Aucune règle active</strong> : les bénévoles ne voient que les missions pour
            lesquelles ils ont été explicitement sollicités.
          </li>
          <li>
            <strong>Admins et responsables</strong> : voient toujours toutes les missions,
            indépendamment des règles.
          </li>
        </ul>
      </section>
    </div>
  );
}
