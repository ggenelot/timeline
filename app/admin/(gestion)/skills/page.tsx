'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { supabase } from '@/lib/supabase/client';
import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/card';
import { Toggle } from '@/components/ui/toggle';
import { cn } from '@/lib/cn';
import { Profile, Skill, SkillCategory, SkillStatus } from '@/lib/types';

// ── Palette des catégories (couleur nommée → accents) ─────────
// Même palette que les pages « Cursus » et « Suivi des compétences », pour
// que les couleurs choisies ici se retrouvent identiques partout ailleurs.

const CATEGORY_PALETTE: Record<string, { accent: string; soft: string; softBorder: string }> = {
  slate: { accent: '#5B6478', soft: '#F4F6FA', softBorder: '#E5E9F0' },
  amber: { accent: '#B4590F', soft: '#FFF3E9', softBorder: '#FBD9BE' },
  orange: { accent: '#B4590F', soft: '#FFF3E9', softBorder: '#FBD9BE' },
  sky: { accent: '#1E3C87', soft: '#EEF4FE', softBorder: '#CFDDF6' },
  blue: { accent: '#1E3C87', soft: '#EEF4FE', softBorder: '#CFDDF6' },
  indigo: { accent: '#1E3C87', soft: '#EEF4FE', softBorder: '#CFDDF6' },
  emerald: { accent: '#0B6E63', soft: '#E9F7F4', softBorder: '#C7E9E3' },
  teal: { accent: '#0B6E63', soft: '#E9F7F4', softBorder: '#C7E9E3' },
  cyan: { accent: '#0B6E63', soft: '#E9F7F4', softBorder: '#C7E9E3' },
  green: { accent: '#0B6E63', soft: '#E9F7F4', softBorder: '#C7E9E3' },
  violet: { accent: '#7A2E86', soft: '#F5EDFA', softBorder: '#E3D6EF' },
  pink: { accent: '#8E1279', soft: '#F8E6F4', softBorder: '#E9C9E4' },
  rose: { accent: '#D14343', soft: '#FDEAEA', softBorder: '#F5C6C6' },
  red: { accent: '#D14343', soft: '#FDEAEA', softBorder: '#F5C6C6' },
};

function palette(color: string) {
  return CATEGORY_PALETTE[color] ?? CATEGORY_PALETTE.slate;
}

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

type CategoryWithSkills = SkillCategory & { skills: Skill[] };

type CategoryModalState = { id?: string; name: string; color: string };
type SkillModalState = { categoryId: string; id?: string; code: string; name: string; description: string };
type StatusModalState = { id?: string; label: string; color: string; mark: string; isValidating: boolean };

// ── Poignée de glisser-déposer ───────────────────────────────────

function DragHandle({ attributes, listeners, style }: {
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
  style?: React.CSSProperties;
}) {
  return (
    <span
      {...attributes}
      {...listeners}
      title="Glisser pour réordonner"
      className="shrink-0 cursor-grab touch-none leading-none"
      style={style}
    >
      <Icon name="drag_indicator" className="text-ink-3" />
    </span>
  );
}

// ── Pastilles de couleur ──────────────────────────────────────────

function ColorSwatches({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="flex flex-wrap gap-[9px]">
      {AVAILABLE_COLORS.map((c) => {
        const active = value === c.value;
        return (
          <button
            key={c.value}
            type="button"
            onClick={() => onChange(c.value)}
            title={c.label}
            aria-label={c.label}
            className={cn(
              'inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-2 text-xs text-white',
              active ? 'border-brand shadow-[0_0_0_2px_#fff_inset]' : 'border-transparent'
            )}
            style={{ background: palette(c.value).accent }}
          >
            {active ? '✓' : ''}
          </button>
        );
      })}
    </div>
  );
}

// ── Modale générique ──────────────────────────────────────────────

function Modal({ title, subtitle, onClose, children, onSubmit, submitLabel, submitDisabled }: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  onSubmit: () => void;
  submitLabel: string;
  submitDisabled?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-[rgba(12,19,38,.55)] px-[18px] py-14"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-[520px] overflow-hidden rounded-[18px] bg-surface-card shadow-lift">
        <div className="flex items-start justify-between gap-3 border-b border-line-row px-5 pb-[14px] pt-[18px]">
          <div>
            <div className="text-[17px] font-extrabold text-ink">{title}</div>
            {subtitle ? <div className="mt-[3px] text-[12.5px] text-ink-2">{subtitle}</div> : null}
          </div>
          <button type="button" onClick={onClose} className="flex h-[30px] w-[30px] shrink-0 cursor-pointer items-center justify-center rounded-lg bg-surface-sub text-ink-2">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="flex flex-col gap-4 px-5 py-[18px]">{children}</div>
        <div className="flex items-center justify-end gap-2.5 border-t border-line-row bg-surface-sub px-5 py-[14px]">
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant="engage" onClick={onSubmit} disabled={submitDisabled}>{submitLabel}</Button>
        </div>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-[7px] text-[12.5px] font-bold text-ink-2">{children}</div>;
}

const inputClass = 'w-full rounded-[9px] border border-line-field px-3 py-2.5 text-sm text-ink outline-none';

// ── Ligne de compétence triable ──────────────────────────────────

function SortableSkillRow({ skill, color, onEdit, onRemove }: {
  skill: Skill;
  color: string;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: skill.id });
  const p = palette(color);
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex items-start gap-2.5 rounded-xl border border-line-row bg-surface-sub px-[13px] py-[11px]',
        isDragging ? 'opacity-60 shadow-lift' : ''
      )}
      style={{
        transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 1 : 'auto',
      }}
    >
      <DragHandle attributes={attributes} listeners={listeners} style={{ marginTop: 3 }} />
      <span
        className="mt-px min-w-[52px] shrink-0 rounded-[7px] border px-2 py-1 text-center text-[12.5px] font-extrabold"
        style={{ color: p.accent, background: p.soft, borderColor: p.softBorder }}
      >
        {skill.code || '—'}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-ink">{skill.name}</div>
        {skill.description ? (
          <div className="mt-[3px] text-[12.5px] leading-snug text-ink-2">{skill.description}</div>
        ) : null}
      </div>
      <span className="inline-flex shrink-0 items-center gap-1">
        <button type="button" onClick={onEdit}
          className="cursor-pointer rounded-[7px] border border-line-field bg-surface-card px-2.5 py-[5px] text-xs font-bold text-ink-2">
          Modifier
        </button>
        <button type="button" onClick={onRemove} aria-label="Supprimer"
          className="cursor-pointer bg-transparent px-1.5 py-1 text-[15px] text-bad">✕</button>
      </span>
    </div>
  );
}

// ── Carte de catégorie triable ────────────────────────────────────

function SortableCategoryCard({ category, sensors, onSkillDragEnd, onEditCategory, onDeleteCategory, onAddSkill, onEditSkill, onRemoveSkill }: {
  category: CategoryWithSkills;
  sensors: ReturnType<typeof useSensors>;
  onSkillDragEnd: (event: DragEndEvent) => void;
  onEditCategory: () => void;
  onDeleteCategory: () => void;
  onAddSkill: () => void;
  onEditSkill: (skill: Skill) => void;
  onRemoveSkill: (skillId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category.id });
  const p = palette(category.color);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'relative mb-4 overflow-hidden rounded-2xl border border-line bg-surface-card',
        isDragging ? 'opacity-85 shadow-lift' : 'shadow-card'
      )}
      style={{
        transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 5 : 'auto',
      }}
    >
      <div className="border-b border-line-row px-[22px] pb-[15px] pt-4">
        <div className="flex flex-wrap items-center gap-[11px]">
          <DragHandle attributes={attributes} listeners={listeners} />
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: p.accent }} />
          <span className="text-base font-extrabold text-ink">{category.name}</span>
          <span
            className="rounded-full border px-[9px] py-0.5 text-[11.5px] font-bold"
            style={{ color: p.accent, background: p.soft, borderColor: p.softBorder }}
          >
            {category.skills.length} compétence{category.skills.length !== 1 ? 's' : ''}
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5">
            <button type="button" onClick={onEditCategory}
              className="cursor-pointer rounded-[7px] border border-line-field bg-surface-card px-2.5 py-[5px] text-xs font-bold text-ink-2">
              Modifier
            </button>
            <button type="button" onClick={onDeleteCategory}
              className="cursor-pointer rounded-[7px] border border-bad/30 bg-surface-card px-2.5 py-[5px] text-xs font-bold text-bad">
              Supprimer
            </button>
          </span>
        </div>
      </div>

      <div className="px-[22px] pb-[18px] pt-[14px]">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onSkillDragEnd}>
          <SortableContext items={category.skills.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-2">
              {category.skills.length === 0 ? (
                <div className="p-0.5 text-[12.5px] text-ink-3">Aucune compétence dans cette catégorie.</div>
              ) : category.skills.map((skill) => (
                <SortableSkillRow
                  key={skill.id}
                  skill={skill}
                  color={category.color}
                  onEdit={() => onEditSkill(skill)}
                  onRemove={() => onRemoveSkill(skill.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <button type="button" onClick={onAddSkill}
          className="mt-[11px] w-full cursor-pointer rounded-[10px] border border-dashed border-line-field bg-surface-card px-[14px] py-2.5 text-left text-[13px] font-bold text-brand">
          + Ajouter une compétence
        </button>
      </div>
    </div>
  );
}

export default function AdminSkillsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<CategoryWithSkills[]>([]);
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const [categoryModal, setCategoryModal] = useState<CategoryModalState | null>(null);
  const [savingCategory, setSavingCategory] = useState(false);

  const [skillModal, setSkillModal] = useState<SkillModalState | null>(null);
  const [savingSkill, setSavingSkill] = useState(false);

  const [statuses, setStatuses] = useState<SkillStatus[]>([]);
  const [statusModal, setStatusModal] = useState<StatusModalState | null>(null);
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

  // ── Catégories ──────────────────────────────────────────────

  async function submitCategory() {
    if (!categoryModal || !categoryModal.name.trim()) return;
    setSavingCategory(true);
    setError(null);
    try {
      const isEdit = !!categoryModal.id;
      const res = await fetch(isEdit ? `/api/admin/skill-categories/${categoryModal.id}` : '/api/admin/skill-categories', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: categoryModal.name.trim(), color: categoryModal.color }),
      });
      if (res.ok) {
        await fetchCategories(token);
        setCategoryModal(null);
        flash(isEdit ? 'Catégorie modifiée.' : 'Catégorie créée.');
      } else {
        const json = (await res.json()) as { error?: string };
        setError(json.error ?? 'Erreur lors de l’enregistrement.');
      }
    } finally {
      setSavingCategory(false);
    }
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

  async function handleCategoryDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = categories.findIndex((c) => c.id === active.id);
    const newIndex = categories.findIndex((c) => c.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(categories, oldIndex, newIndex);
    setCategories(next);
    setError(null);
    try {
      await Promise.all(
        next.map((cat, i) => fetch(`/api/admin/skill-categories/${cat.id}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ display_order: i }),
        }))
      );
    } catch {
      setError('Erreur lors de la réorganisation des catégories.');
    }
  }

  // ── Compétences ─────────────────────────────────────────────

  async function submitSkill() {
    if (!skillModal || !skillModal.name.trim()) return;
    setSavingSkill(true);
    setError(null);
    try {
      const isEdit = !!skillModal.id;
      const res = await fetch(isEdit ? `/api/admin/skills/${skillModal.id}` : '/api/admin/skills', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: skillModal.name.trim(),
          code: skillModal.code.trim(),
          description: skillModal.description.trim(),
          ...(isEdit ? {} : { category_id: skillModal.categoryId }),
        }),
      });
      if (res.ok) {
        await fetchCategories(token);
        setSkillModal(null);
        flash(isEdit ? 'Compétence modifiée.' : 'Compétence ajoutée.');
      } else {
        const json = (await res.json()) as { error?: string };
        setError(json.error ?? 'Erreur lors de l’enregistrement.');
      }
    } finally {
      setSavingSkill(false);
    }
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

  async function handleSkillDragEnd(categoryId: string, event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) return;
    const oldIndex = cat.skills.findIndex((s) => s.id === active.id);
    const newIndex = cat.skills.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(cat.skills, oldIndex, newIndex);
    setCategories((prev) => prev.map((c) => (c.id === categoryId ? { ...c, skills: next } : c)));
    setError(null);
    try {
      await Promise.all(
        next.map((s, i) => fetch(`/api/admin/skills/${s.id}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ display_order: i }),
        }))
      );
    } catch {
      setError('Erreur lors de la réorganisation des compétences.');
    }
  }

  // ── Statuts ─────────────────────────────────────────────────

  async function submitStatus() {
    if (!statusModal || !statusModal.label.trim()) return;
    setSavingStatus(true);
    setError(null);
    try {
      const isEdit = !!statusModal.id;
      const res = await fetch(isEdit ? `/api/admin/skill-statuses/${statusModal.id}` : '/api/admin/skill-statuses', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: statusModal.label.trim(),
          color: statusModal.color,
          mark: statusModal.mark,
          is_validating: statusModal.isValidating,
        }),
      });
      if (res.ok) {
        await fetchStatuses(token);
        setStatusModal(null);
        flash(isEdit ? 'Statut modifié.' : 'Statut créé.');
      } else {
        const json = (await res.json()) as { error?: string };
        setError(json.error ?? 'Erreur lors de l’enregistrement.');
      }
    } finally {
      setSavingStatus(false);
    }
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

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-ink-3">Chargement…</p>
      </div>
    );
  }

  if (!profile || profile.role !== 'admin') {
    return (
      <div className="rounded-lg border border-bad/30 bg-bad-soft p-4 text-sm text-bad">
        Accès refusé : page réservée aux administrateurs.
      </div>
    );
  }

  return (
    <div className="pb-20">
      <PageHeader
        title="Compétences"
        subtitle="Définissez les catégories de compétences et les compétences dans chacune d'elles : acronyme, titre et description. L'ordre des compétences dans une catégorie détermine leur niveau."
      />

      {error ? (
        <div className="mb-4 rounded-[10px] border border-bad/30 bg-bad-soft px-4 py-3 text-[13px] text-bad">
          {error}
        </div>
      ) : null}
      {successMsg ? (
        <div className="mb-4 rounded-[10px] border border-ok-line bg-ok-soft px-4 py-3 text-[13px] text-ok-text">
          {successMsg}
        </div>
      ) : null}

      {/* ── Catégories ── */}
      <div className="mb-[13px] flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs font-extrabold uppercase tracking-[.04em] text-ink-3">
          Catégories de compétences
        </span>
        <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-3">Glissez <Icon name="drag_indicator" size={16} className="text-ink-3" /> pour réordonner catégories et compétences</span>
      </div>

      {categories.length === 0 ? (
        <div className="mb-4 rounded-2xl border-[1.5px] border-dashed border-line bg-surface-card px-6 py-9 text-center">
          <p className="text-[13.5px] text-ink-3">Aucune catégorie pour l&apos;instant. Créez-en une ci-dessous.</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCategoryDragEnd}>
          <SortableContext items={categories.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {categories.map((cat) => (
              <SortableCategoryCard
                key={cat.id}
                category={cat}
                sensors={sensors}
                onSkillDragEnd={(e) => handleSkillDragEnd(cat.id, e)}
                onEditCategory={() => setCategoryModal({ id: cat.id, name: cat.name, color: cat.color })}
                onDeleteCategory={() => handleDeleteCategory(cat.id, cat.name)}
                onAddSkill={() => setSkillModal({ categoryId: cat.id, code: '', name: '', description: '' })}
                onEditSkill={(skill) => setSkillModal({ categoryId: cat.id, id: skill.id, code: skill.code ?? '', name: skill.name, description: skill.description ?? '' })}
                onRemoveSkill={(skillId) => void handleDeleteSkill(skillId)}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}

      <div className="mb-8">
        <button type="button" onClick={() => setCategoryModal({ name: '', color: 'slate' })}
          className="w-full cursor-pointer rounded-[10px] border border-dashed border-line-field bg-surface-card px-4 py-[11px] text-[13.5px] font-bold text-brand">
          + Nouvelle catégorie
        </button>
      </div>

      {/* ── Statuts ── */}
      <div className="mb-[13px] flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs font-extrabold uppercase tracking-[.04em] text-ink-3">
          Statuts de compétence
        </span>
        <span className="text-[11.5px] text-ink-3">
          Le statut <strong className="text-ink">{statuses.find((s) => s.protected)?.label ?? 'protégé'}</strong> est protégé : sa clé qualifie l&apos;éligibilité aux missions.
        </span>
      </div>

      <div className="mb-4 rounded-2xl border border-line bg-surface-card px-[22px] pb-[18px] pt-[14px] shadow-card">
        <div className="flex flex-col gap-2">
          {statuses.length === 0 ? (
            <div className="p-0.5 text-[12.5px] text-ink-3">Aucun statut défini.</div>
          ) : statuses.map((status, index) => {
            const p = palette(status.color);
            return (
              <div key={status.id} className="flex items-center gap-2.5 rounded-xl border border-line-row bg-surface-sub px-[13px] py-2.5">
                <span
                  className="min-w-[30px] shrink-0 rounded-[7px] border px-1.5 py-1 text-center text-sm font-extrabold"
                  style={{ color: p.accent, background: p.soft, borderColor: p.softBorder }}
                  aria-hidden>{status.mark}</span>
                <span className="min-w-0 flex-1 text-sm font-bold text-ink">{status.label}</span>
                {status.is_validating ? (
                  <span className="rounded-[5px] border border-ok-line bg-ok-soft px-[7px] py-px text-[10.5px] font-bold text-engage">validant</span>
                ) : null}
                {status.protected ? (
                  <span className="rounded-[5px] border border-line bg-surface-sub px-[7px] py-px text-[10.5px] font-bold text-ink-2">protégé</span>
                ) : null}
                <span className="inline-flex shrink-0 items-center gap-0.5">
                  <button type="button" onClick={() => void handleMoveStatusUp(index)} disabled={index === 0}
                    className="cursor-pointer bg-transparent px-1.5 py-1 text-[13px] text-ink-3 disabled:cursor-not-allowed disabled:opacity-30">↑</button>
                  <button type="button" onClick={() => void handleMoveStatusDown(index)} disabled={index === statuses.length - 1}
                    className="cursor-pointer bg-transparent px-1.5 py-1 text-[13px] text-ink-3 disabled:cursor-not-allowed disabled:opacity-30">↓</button>
                  <button type="button" onClick={() => setStatusModal({ id: status.id, label: status.label, color: status.color, mark: status.mark, isValidating: status.is_validating })}
                    className="cursor-pointer rounded-[7px] border border-line-field bg-surface-card px-2.5 py-[5px] text-xs font-bold text-ink-2">
                    Modifier
                  </button>
                  {!status.protected ? (
                    <button type="button" onClick={() => void handleDeleteStatus(status.id, status.label)}
                      className="cursor-pointer bg-transparent px-1.5 py-1 text-[15px] text-bad">✕</button>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
        <button type="button" onClick={() => setStatusModal({ label: '', color: 'slate', mark: '✓', isValidating: false })}
          className="mt-[11px] w-full cursor-pointer rounded-[10px] border border-dashed border-line-field bg-surface-card px-[14px] py-2.5 text-left text-[13px] font-bold text-brand">
          + Nouveau statut
        </button>
      </div>

      {/* ── Modale catégorie ── */}
      {categoryModal ? (
        <Modal
          title={categoryModal.id ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
          onClose={() => setCategoryModal(null)}
          onSubmit={submitCategory}
          submitLabel={savingCategory ? 'Enregistrement…' : categoryModal.id ? 'Enregistrer' : 'Créer'}
          submitDisabled={savingCategory || !categoryModal.name.trim()}
        >
          <div>
            <FieldLabel>Nom</FieldLabel>
            <input
              value={categoryModal.name}
              onChange={(e) => setCategoryModal((m) => (m ? { ...m, name: e.target.value } : m))}
              onKeyDown={(e) => { if (e.key === 'Enter') submitCategory(); }}
              placeholder="Ex. : Opérationnel, Conduite…"
              className={inputClass}
            />
          </div>
          <div>
            <FieldLabel>Couleur</FieldLabel>
            <ColorSwatches value={categoryModal.color} onChange={(color) => setCategoryModal((m) => (m ? { ...m, color } : m))} />
          </div>
        </Modal>
      ) : null}

      {/* ── Modale compétence ── */}
      {skillModal ? (
        <Modal
          title={skillModal.id ? 'Modifier la compétence' : 'Ajouter une compétence'}
          subtitle={categories.find((c) => c.id === skillModal.categoryId)?.name}
          onClose={() => setSkillModal(null)}
          onSubmit={submitSkill}
          submitLabel={savingSkill ? 'Enregistrement…' : skillModal.id ? 'Enregistrer' : 'Ajouter'}
          submitDisabled={savingSkill || !skillModal.name.trim()}
        >
          <div>
            <FieldLabel>Acronyme <span className="font-semibold text-ink-3">(ex : PSE1, CE…)</span></FieldLabel>
            <input
              value={skillModal.code}
              onChange={(e) => setSkillModal((m) => (m ? { ...m, code: e.target.value } : m))}
              placeholder="Ex : PSE1"
              maxLength={12}
              className={cn(inputClass, 'max-w-[180px] uppercase')}
            />
          </div>
          <div>
            <FieldLabel>Titre</FieldLabel>
            <input
              value={skillModal.name}
              onChange={(e) => setSkillModal((m) => (m ? { ...m, name: e.target.value } : m))}
              placeholder="Ex : Premiers secours en équipe niveau 1"
              className={inputClass}
            />
          </div>
          <div>
            <FieldLabel>Description <span className="font-semibold text-ink-3">(optionnelle)</span></FieldLabel>
            <textarea
              value={skillModal.description}
              onChange={(e) => setSkillModal((m) => (m ? { ...m, description: e.target.value } : m))}
              placeholder="Contenu, prérequis ou critères de validation de la compétence."
              rows={3}
              className={cn(inputClass, 'resize-y')}
            />
          </div>
        </Modal>
      ) : null}

      {/* ── Modale statut ── */}
      {statusModal ? (
        <Modal
          title={statusModal.id ? 'Modifier le statut' : 'Nouveau statut'}
          onClose={() => setStatusModal(null)}
          onSubmit={submitStatus}
          submitLabel={savingStatus ? 'Enregistrement…' : statusModal.id ? 'Enregistrer' : 'Créer'}
          submitDisabled={savingStatus || !statusModal.label.trim()}
        >
          <div>
            <FieldLabel>Libellé</FieldLabel>
            <input
              value={statusModal.label}
              onChange={(e) => setStatusModal((m) => (m ? { ...m, label: e.target.value } : m))}
              placeholder="Ex : Validée, En formation…"
              className={inputClass}
            />
          </div>
          <div>
            <FieldLabel>Couleur</FieldLabel>
            <ColorSwatches value={statusModal.color} onChange={(color) => setStatusModal((m) => (m ? { ...m, color } : m))} />
          </div>
          <div>
            <FieldLabel>Symbole</FieldLabel>
            <input
              value={statusModal.mark}
              onChange={(e) => setStatusModal((m) => (m ? { ...m, mark: e.target.value } : m))}
              maxLength={2}
              className={cn(inputClass, 'w-[60px] text-center')}
            />
          </div>
          <div className="flex items-center gap-[11px] rounded-[11px] border border-line-row bg-surface-sub px-[13px] py-[11px]">
            <Toggle value={statusModal.isValidating} onChange={(v) => setStatusModal((m) => (m ? { ...m, isValidating: v } : m))} />
            <div>
              <div className="text-[13px] font-bold text-ink-2">Compte comme « validé »</div>
              <div className="text-xs text-ink-3">Ce statut qualifie la compétence comme acquise dans le suivi.</div>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
