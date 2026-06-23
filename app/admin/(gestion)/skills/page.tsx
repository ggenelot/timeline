'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Profile, Skill, SkillCategory, SkillStatus } from '@/lib/types';

const AVAILABLE_COLORS = [
  { value: 'slate', label: 'Gris' },
  { value: 'amber', label: 'Ambre' },
  { value: 'sky', label: 'Ciel' },
  { value: 'violet', label: 'Violet' },
  { value: 'emerald', label: 'Vert' },
  { value: 'pink', label: 'Rose' },
  { value: 'rose', label: 'Rouge' },
  { value: 'orange', label: 'Orange' },
  { value: 'cyan', label: 'Cyan' },
  { value: 'indigo', label: 'Indigo' },
];

const COLOR_DOT: Record<string, string> = {
  slate: 'bg-slate-400',
  amber: 'bg-amber-400',
  sky: 'bg-sky-400',
  violet: 'bg-violet-400',
  emerald: 'bg-emerald-400',
  pink: 'bg-pink-400',
  rose: 'bg-rose-400',
  orange: 'bg-orange-400',
  cyan: 'bg-cyan-400',
  indigo: 'bg-indigo-400',
};

type CategoryWithSkills = SkillCategory & { skills: Skill[] };

export default function AdminSkillsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<CategoryWithSkills[]>([]);
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('slate');
  const [creatingCat, setCreatingCat] = useState(false);

  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatColor, setEditCatColor] = useState('slate');
  const [savingCat, setSavingCat] = useState(false);

  const [newSkillName, setNewSkillName] = useState<Record<string, string>>({});
  const [addingSkill, setAddingSkill] = useState<string | null>(null);

  const [statuses, setStatuses] = useState<SkillStatus[]>([]);
  const [newStatusLabel, setNewStatusLabel] = useState('');
  const [newStatusColor, setNewStatusColor] = useState('slate');
  const [newStatusMark, setNewStatusMark] = useState('✓');
  const [newStatusValidating, setNewStatusValidating] = useState(false);
  const [creatingStatus, setCreatingStatus] = useState(false);

  const [editingStatusId, setEditingStatusId] = useState<string | null>(null);
  const [editStatusLabel, setEditStatusLabel] = useState('');
  const [editStatusColor, setEditStatusColor] = useState('slate');
  const [editStatusMark, setEditStatusMark] = useState('✓');
  const [editStatusValidating, setEditStatusValidating] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  function flash(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  }

  const fetchCategories = useCallback(async (tok: string) => {
    const res = await fetch('/api/admin/skill-categories', {
      headers: { Authorization: `Bearer ${tok}` },
    });
    if (res.ok) {
      const json = (await res.json()) as { categories: CategoryWithSkills[] };
      setCategories(json.categories);
    }
  }, []);

  const fetchStatuses = useCallback(async (tok: string) => {
    const res = await fetch('/api/admin/skill-statuses', {
      headers: { Authorization: `Bearer ${tok}` },
    });
    if (res.ok) {
      const json = (await res.json()) as { statuses: SkillStatus[] };
      setStatuses(json.statuses);
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
      await Promise.all([fetchCategories(tok), fetchStatuses(tok)]);
      setLoading(false);
    }
    void init();
  }, [router, fetchCategories, fetchStatuses]);

  async function handleCreateCategory() {
    if (!newCatName.trim()) return;
    setCreatingCat(true);
    setError(null);
    const res = await fetch('/api/admin/skill-categories', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newCatName.trim(), color: newCatColor }),
    });
    if (res.ok) {
      setNewCatName('');
      setNewCatColor('slate');
      await fetchCategories(token);
      flash('Catégorie créée.');
    } else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Erreur lors de la création.');
    }
    setCreatingCat(false);
  }

  function startEditCat(cat: CategoryWithSkills) {
    setEditingCatId(cat.id);
    setEditCatName(cat.name);
    setEditCatColor(cat.color);
  }

  async function handleSaveCategory(id: string) {
    setSavingCat(true);
    setError(null);
    const res = await fetch(`/api/admin/skill-categories/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editCatName.trim(), color: editCatColor }),
    });
    if (res.ok) {
      setEditingCatId(null);
      await fetchCategories(token);
      flash('Catégorie modifiée.');
    } else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Erreur lors de la modification.');
    }
    setSavingCat(false);
  }

  async function handleDeleteCategory(id: string, name: string) {
    if (!confirm(`Supprimer la catégorie "${name}" ? Les compétences associées seront également supprimées.`)) return;
    setError(null);
    const res = await fetch(`/api/admin/skill-categories/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      await fetchCategories(token);
      flash('Catégorie supprimée.');
    } else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Erreur lors de la suppression.');
    }
  }

  async function handleMoveCategoryUp(index: number) {
    if (index === 0) return;
    await swapCategoryOrder(index - 1, index);
  }

  async function handleMoveCategoryDown(index: number) {
    if (index === categories.length - 1) return;
    await swapCategoryOrder(index, index + 1);
  }

  async function swapCategoryOrder(indexA: number, indexB: number) {
    const a = categories[indexA];
    const b = categories[indexB];
    setError(null);
    await Promise.all([
      fetch(`/api/admin/skill-categories/${a.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_order: b.display_order }),
      }),
      fetch(`/api/admin/skill-categories/${b.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_order: a.display_order }),
      }),
    ]);
    await fetchCategories(token);
  }

  async function handleAddSkill(categoryId: string) {
    const name = (newSkillName[categoryId] ?? '').trim();
    if (!name) return;
    setAddingSkill(categoryId);
    setError(null);
    const res = await fetch('/api/admin/skills', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, category_id: categoryId }),
    });
    if (res.ok) {
      setNewSkillName((prev) => ({ ...prev, [categoryId]: '' }));
      await fetchCategories(token);
    } else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? "Erreur lors de l'ajout.");
    }
    setAddingSkill(null);
  }

  async function handleDeleteSkill(id: string) {
    setError(null);
    const res = await fetch(`/api/admin/skills/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      await fetchCategories(token);
    } else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Erreur lors de la suppression.');
    }
  }

  async function handleMoveSkillUp(categoryId: string, index: number) {
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat || index === 0) return;
    await swapSkillOrder(cat.skills[index - 1], cat.skills[index]);
  }

  async function handleMoveSkillDown(categoryId: string, index: number) {
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat || index === cat.skills.length - 1) return;
    await swapSkillOrder(cat.skills[index], cat.skills[index + 1]);
  }

  async function swapSkillOrder(a: Skill, b: Skill) {
    setError(null);
    await Promise.all([
      fetch(`/api/admin/skills/${a.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_order: b.display_order }),
      }),
      fetch(`/api/admin/skills/${b.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_order: a.display_order }),
      }),
    ]);
    await fetchCategories(token);
  }

  async function handleCreateStatus() {
    if (!newStatusLabel.trim()) return;
    setCreatingStatus(true);
    setError(null);
    const res = await fetch('/api/admin/skill-statuses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: newStatusLabel.trim(),
        color: newStatusColor,
        mark: newStatusMark,
        is_validating: newStatusValidating,
      }),
    });
    if (res.ok) {
      setNewStatusLabel('');
      setNewStatusColor('slate');
      setNewStatusMark('✓');
      setNewStatusValidating(false);
      await fetchStatuses(token);
      flash('Statut créé.');
    } else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Erreur lors de la création.');
    }
    setCreatingStatus(false);
  }

  function startEditStatus(status: SkillStatus) {
    setEditingStatusId(status.id);
    setEditStatusLabel(status.label);
    setEditStatusColor(status.color);
    setEditStatusMark(status.mark);
    setEditStatusValidating(status.is_validating);
  }

  async function handleSaveStatus(id: string) {
    setSavingStatus(true);
    setError(null);
    const res = await fetch(`/api/admin/skill-statuses/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: editStatusLabel.trim(),
        color: editStatusColor,
        mark: editStatusMark,
        is_validating: editStatusValidating,
      }),
    });
    if (res.ok) {
      setEditingStatusId(null);
      await fetchStatuses(token);
      flash('Statut modifié.');
    } else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Erreur lors de la modification.');
    }
    setSavingStatus(false);
  }

  async function handleDeleteStatus(id: string, label: string) {
    if (!confirm(`Supprimer le statut "${label}" ?`)) return;
    setError(null);
    const res = await fetch(`/api/admin/skill-statuses/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      await fetchStatuses(token);
      flash('Statut supprimé.');
    } else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Erreur lors de la suppression.');
    }
  }

  async function swapStatusOrder(a: SkillStatus, b: SkillStatus) {
    setError(null);
    await Promise.all([
      fetch(`/api/admin/skill-statuses/${a.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_order: b.display_order }),
      }),
      fetch(`/api/admin/skill-statuses/${b.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_order: a.display_order }),
      }),
    ]);
    await fetchStatuses(token);
  }

  async function handleMoveStatusUp(index: number) {
    if (index === 0) return;
    await swapStatusOrder(statuses[index - 1], statuses[index]);
  }

  async function handleMoveStatusDown(index: number) {
    if (index === statuses.length - 1) return;
    await swapStatusOrder(statuses[index], statuses[index + 1]);
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
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Compétences</h1>
        <p className="mt-1 text-sm text-slate-500">
          Définissez les catégories de compétences et les compétences dans chacune d&apos;elles. L&apos;ordre des compétences dans une catégorie détermine leur niveau.
        </p>
      </header>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {successMsg ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{successMsg}</div> : null}

      <section className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/40 p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-slate-800">Nouvelle catégorie</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-40">
            <label className="mb-1 block text-xs font-medium text-slate-600">Nom *</label>
            <input
              type="text"
              placeholder="Ex. : Opérationnel, Conduite…"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleCreateCategory(); }}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Couleur</label>
            <select
              value={newCatColor}
              onChange={(e) => setNewCatColor(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              {AVAILABLE_COLORS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={handleCreateCategory}
            disabled={creatingCat || !newCatName.trim()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creatingCat ? 'Création…' : 'Créer'}
          </button>
        </div>
      </section>

      <section className="space-y-4">
        {categories.length === 0 ? (
          <p className="text-sm text-slate-400">Aucune catégorie définie. Créez-en une ci-dessus.</p>
        ) : (
          categories.map((cat, catIndex) => (
            <div key={cat.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4">
                {editingCatId === cat.id ? (
                  <div className="flex flex-1 flex-wrap items-end gap-2">
                    <input
                      type="text"
                      value={editCatName}
                      onChange={(e) => setEditCatName(e.target.value)}
                      className="flex-1 min-w-32 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
                    />
                    <select
                      value={editCatColor}
                      onChange={(e) => setEditCatColor(e.target.value)}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
                    >
                      {AVAILABLE_COLORS.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void handleSaveCategory(cat.id)}
                        disabled={savingCat}
                        className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                      >
                        Enregistrer
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingCatId(null)}
                        className="rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className={`h-3 w-3 rounded-full ${COLOR_DOT[cat.color] ?? 'bg-slate-400'}`} />
                    <span className="font-semibold text-slate-800">{cat.name}</span>
                    <span className="text-xs text-slate-400">{cat.skills.length} compétence{cat.skills.length !== 1 ? 's' : ''}</span>
                  </div>
                )}

                {editingCatId !== cat.id && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void handleMoveCategoryUp(catIndex)}
                      disabled={catIndex === 0}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                      title="Monter"
                    >↑</button>
                    <button
                      type="button"
                      onClick={() => void handleMoveCategoryDown(catIndex)}
                      disabled={catIndex === categories.length - 1}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                      title="Descendre"
                    >↓</button>
                    <button
                      type="button"
                      onClick={() => startEditCat(cat)}
                      className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
                    >Modifier</button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteCategory(cat.id, cat.name)}
                      className="rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50"
                    >Supprimer</button>
                  </div>
                )}
              </div>

              <div className="divide-y divide-slate-50 p-3">
                {cat.skills.length === 0 ? (
                  <p className="px-1 py-2 text-xs text-slate-400">Aucune compétence. Ajoutez-en une ci-dessous.</p>
                ) : (
                  cat.skills.map((skill, skillIndex) => (
                    <div key={skill.id} className="flex items-center justify-between gap-2 py-1.5 px-1">
                      <div className="flex items-center gap-2 text-sm text-slate-700">
                        <span className="w-5 text-center text-xs font-mono text-slate-400">{skillIndex + 1}</span>
                        <span>{skill.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void handleMoveSkillUp(cat.id, skillIndex)}
                          disabled={skillIndex === 0}
                          className="rounded p-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                          title="Monter"
                        >↑</button>
                        <button
                          type="button"
                          onClick={() => void handleMoveSkillDown(cat.id, skillIndex)}
                          disabled={skillIndex === cat.skills.length - 1}
                          className="rounded p-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                          title="Descendre"
                        >↓</button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteSkill(skill.id)}
                          className="rounded p-1 text-xs text-red-400 hover:bg-red-50 hover:text-red-600"
                          title="Supprimer"
                        >✕</button>
                      </div>
                    </div>
                  ))
                )}

                <div className="flex items-center gap-2 pt-2 px-1">
                  <input
                    type="text"
                    placeholder="Ajouter une compétence…"
                    value={newSkillName[cat.id] ?? ''}
                    onChange={(e) => setNewSkillName((prev) => ({ ...prev, [cat.id]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') void handleAddSkill(cat.id); }}
                    className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
                  />
                  <button
                    type="button"
                    onClick={() => void handleAddSkill(cat.id)}
                    disabled={addingSkill === cat.id || !(newSkillName[cat.id] ?? '').trim()}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Ajouter
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-100 p-4">
          <h2 className="text-base font-semibold text-slate-800">Statuts de compétence</h2>
          <p className="mt-1 text-xs text-slate-500">
            Statuts utilisables dans le tableau de bord de suivi des compétences (libellé, couleur, symbole). Le
            statut <span className="font-medium text-slate-700">{statuses.find((s) => s.protected)?.label ?? 'protégé'}</span>{' '}
            est protégé : sa clé qualifie l&apos;éligibilité aux missions, il ne peut pas être supprimé mais reste
            modifiable.
          </p>
        </header>

        <div className="divide-y divide-slate-50 p-3">
          {statuses.length === 0 ? (
            <p className="px-1 py-2 text-xs text-slate-400">Aucun statut défini.</p>
          ) : (
            statuses.map((status, index) =>
              editingStatusId === status.id ? (
                <div key={status.id} className="flex flex-wrap items-end gap-2 py-2 px-1">
                  <input
                    type="text"
                    value={editStatusLabel}
                    onChange={(e) => setEditStatusLabel(e.target.value)}
                    className="flex-1 min-w-32 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
                  />
                  <select
                    value={editStatusColor}
                    onChange={(e) => setEditStatusColor(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
                  >
                    {AVAILABLE_COLORS.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={editStatusMark}
                    onChange={(e) => setEditStatusMark(e.target.value)}
                    maxLength={2}
                    title="Symbole"
                    className="w-12 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-center text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
                  />
                  <label className="flex items-center gap-1.5 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={editStatusValidating}
                      onChange={(e) => setEditStatusValidating(e.target.checked)}
                    />
                    Compte comme « validé »
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleSaveStatus(status.id)}
                      disabled={savingStatus}
                      className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      Enregistrer
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingStatusId(null)}
                      className="rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <div key={status.id} className="flex items-center justify-between gap-2 py-1.5 px-1">
                  <div className="flex items-center gap-2 text-sm text-slate-700">
                    <span className={`h-3 w-3 rounded-full ${COLOR_DOT[status.color] ?? 'bg-slate-400'}`} />
                    <span aria-hidden>{status.mark}</span>
                    <span>{status.label}</span>
                    {status.is_validating ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                        validant
                      </span>
                    ) : null}
                    {status.protected ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                        protégé
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void handleMoveStatusUp(index)}
                      disabled={index === 0}
                      className="rounded p-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                      title="Monter"
                    >↑</button>
                    <button
                      type="button"
                      onClick={() => void handleMoveStatusDown(index)}
                      disabled={index === statuses.length - 1}
                      className="rounded p-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                      title="Descendre"
                    >↓</button>
                    <button
                      type="button"
                      onClick={() => startEditStatus(status)}
                      className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
                    >Modifier</button>
                    {!status.protected && (
                      <button
                        type="button"
                        onClick={() => void handleDeleteStatus(status.id, status.label)}
                        className="rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50"
                      >Supprimer</button>
                    )}
                  </div>
                </div>
              )
            )
          )}

          <div className="flex flex-wrap items-end gap-2 pt-3 px-1">
            <input
              type="text"
              placeholder="Nouveau statut…"
              value={newStatusLabel}
              onChange={(e) => setNewStatusLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleCreateStatus(); }}
              className="flex-1 min-w-32 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
            <select
              value={newStatusColor}
              onChange={(e) => setNewStatusColor(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              {AVAILABLE_COLORS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <input
              type="text"
              value={newStatusMark}
              onChange={(e) => setNewStatusMark(e.target.value)}
              maxLength={2}
              title="Symbole"
              className="w-12 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-center text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={newStatusValidating}
                onChange={(e) => setNewStatusValidating(e.target.checked)}
              />
              Compte comme « validé »
            </label>
            <button
              type="button"
              onClick={handleCreateStatus}
              disabled={creatingStatus || !newStatusLabel.trim()}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Ajouter
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
