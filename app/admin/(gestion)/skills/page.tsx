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
import { Profile, Skill, SkillCategory, SkillStatus } from '@/lib/types';

// ── Palette des catégories (couleur nommée → accents) ─────────
// Même palette que les pages « Cursus » et « Suivi des compétences », pour
// que les couleurs choisies ici se retrouvent identiques partout ailleurs.

const CATEGORY_PALETTE: Record<string, { accent: string; soft: string; softBorder: string }> = {
  slate: { accent: '#475569', soft: '#f1f5f9', softBorder: '#e2e8f0' },
  amber: { accent: '#d97706', soft: '#fffbeb', softBorder: '#fde68a' },
  sky: { accent: '#0284c7', soft: '#f0f9ff', softBorder: '#bae6fd' },
  violet: { accent: '#7c3aed', soft: '#f5f3ff', softBorder: '#ddd6fe' },
  emerald: { accent: '#059669', soft: '#ecfdf5', softBorder: '#a7f3d0' },
  pink: { accent: '#db2777', soft: '#fdf2f8', softBorder: '#fbcfe8' },
  rose: { accent: '#e11d48', soft: '#fff1f2', softBorder: '#fecdd3' },
  orange: { accent: '#ea580c', soft: '#fff7ed', softBorder: '#fed7aa' },
  cyan: { accent: '#0891b2', soft: '#ecfeff', softBorder: '#a5f3fc' },
  indigo: { accent: '#4f46e5', soft: '#eef2ff', softBorder: '#c7d2fe' },
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

// ── Bouton interrupteur ─────────────────────────────────────────

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      style={{
        position: 'relative', flexShrink: 0, width: 40, height: 23, border: 'none', borderRadius: 99,
        cursor: 'pointer', background: value ? '#059669' : '#cbd5e1',
      }}
      aria-checked={value}
      role="switch"
    >
      <span style={{
        position: 'absolute', top: 2, left: value ? 19 : 2, width: 19, height: 19, borderRadius: '50%',
        background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.25)', transition: 'left 0.15s',
      }} />
    </button>
  );
}

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
      style={{ flexShrink: 0, cursor: 'grab', color: '#cbd5e1', fontSize: 13, lineHeight: 1, letterSpacing: -3, touchAction: 'none', ...style }}
    >
      ⠿⠿
    </span>
  );
}

// ── Pastilles de couleur ──────────────────────────────────────────

function ColorSwatches({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
      {AVAILABLE_COLORS.map((c) => {
        const active = value === c.value;
        return (
          <button
            key={c.value}
            type="button"
            onClick={() => onChange(c.value)}
            title={c.label}
            aria-label={c.label}
            style={{
              width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', background: palette(c.value).accent,
              border: active ? '2px solid #0f172a' : '2px solid transparent', boxShadow: active ? '0 0 0 2px #fff inset' : 'none',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12,
            }}
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
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '56px 18px', overflowY: 'auto' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: '100%', maxWidth: 520, background: '#fff', borderRadius: 18, boxShadow: '0 24px 60px rgba(15,23,42,.3)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '18px 20px 14px', borderBottom: '1px solid #eef1f5' }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a' }}>{title}</div>
            {subtitle ? <div style={{ marginTop: 3, fontSize: 12.5, color: '#64748b' }}>{subtitle}</div> : null}
          </div>
          <button type="button" onClick={onClose} style={{ flexShrink: 0, cursor: 'pointer', border: 'none', background: '#f1f5f9', color: '#64748b', width: 30, height: 30, borderRadius: 8, fontSize: 16 }}>✕</button>
        </div>
        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid #eef1f5', background: '#fafbfc' }}>
          <button type="button" onClick={onClose} style={{ cursor: 'pointer', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>Annuler</button>
          <button type="button" onClick={onSubmit} disabled={submitDisabled} style={{ cursor: submitDisabled ? 'not-allowed' : 'pointer', border: 'none', background: submitDisabled ? '#94a3b8' : '#059669', color: '#fff', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', opacity: submitDisabled ? 0.6 : 1 }}>{submitLabel}</button>
        </div>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 7 }}>{children}</div>;
}

const inputStyle: React.CSSProperties = { width: '100%', border: '1px solid #cbd5e1', borderRadius: 9, padding: '10px 12px', fontSize: 14, color: '#0f172a', outline: 'none', fontFamily: 'inherit' };

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
      style={{
        transform: CSS.Transform.toString(transform), transition, display: 'flex', alignItems: 'flex-start', gap: 10,
        border: '1px solid #eef1f5', borderRadius: 12, padding: '11px 13px', background: '#fcfcfd',
        opacity: isDragging ? 0.6 : 1, boxShadow: isDragging ? '0 6px 18px rgba(15,23,42,.12)' : 'none', zIndex: isDragging ? 1 : 'auto',
      }}
    >
      <DragHandle attributes={attributes} listeners={listeners} style={{ marginTop: 3 }} />
      <span style={{
        flexShrink: 0, minWidth: 52, textAlign: 'center', fontSize: 12.5, fontWeight: 800, color: p.accent,
        background: p.soft, border: `1px solid ${p.softBorder}`, borderRadius: 7, padding: '4px 8px', marginTop: 1,
      }}>
        {skill.code || '—'}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{skill.name}</div>
        {skill.description ? (
          <div style={{ marginTop: 3, fontSize: 12.5, color: '#64748b', lineHeight: 1.45 }}>{skill.description}</div>
        ) : null}
      </div>
      <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <button type="button" onClick={onEdit}
          style={{ cursor: 'pointer', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>
          Modifier
        </button>
        <button type="button" onClick={onRemove} aria-label="Supprimer"
          style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: '#dc2626', fontSize: 15, padding: '4px 6px' }}>✕</button>
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
      style={{
        transform: CSS.Transform.toString(transform), transition, background: '#fff', border: '1px solid #e7e9ee',
        borderRadius: 16, boxShadow: isDragging ? '0 12px 30px rgba(15,23,42,.16)' : '0 2px 10px rgba(15,23,42,.05)',
        marginBottom: 16, overflow: 'hidden', opacity: isDragging ? 0.85 : 1, zIndex: isDragging ? 5 : 'auto', position: 'relative',
      }}
    >
      <div style={{ padding: '16px 22px 15px', borderBottom: '1px solid #eef1f5' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, flexWrap: 'wrap' }}>
          <DragHandle attributes={attributes} listeners={listeners} />
          <span style={{ flexShrink: 0, width: 12, height: 12, borderRadius: '50%', background: p.accent }} />
          <span style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{category.name}</span>
          <span style={{
            fontSize: 11.5, fontWeight: 700, color: p.accent, background: p.soft, border: `1px solid ${p.softBorder}`,
            borderRadius: 99, padding: '2px 9px',
          }}>
            {category.skills.length} compétence{category.skills.length !== 1 ? 's' : ''}
          </span>
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <button type="button" onClick={onEditCategory}
              style={{ cursor: 'pointer', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>
              Modifier
            </button>
            <button type="button" onClick={onDeleteCategory}
              style={{ cursor: 'pointer', border: '1px solid #fecaca', background: '#fff', color: '#dc2626', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>
              Supprimer
            </button>
          </span>
        </div>
      </div>

      <div style={{ padding: '14px 22px 18px' }}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onSkillDragEnd}>
          <SortableContext items={category.skills.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {category.skills.length === 0 ? (
                <div style={{ fontSize: 12.5, color: '#94a3b8', padding: '2px' }}>Aucune compétence dans cette catégorie.</div>
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
          style={{ marginTop: 11, cursor: 'pointer', border: '1px dashed #cbd5e1', background: '#fff', color: '#2563eb', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', width: '100%', textAlign: 'left' }}>
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
      <div style={{ display: 'flex', minHeight: '40vh', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#94a3b8' }}>Chargement…</p>
      </div>
    );
  }

  if (!profile || profile.role !== 'admin') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Accès refusé : page réservée aux administrateurs.
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 25, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
          Compétences
        </h1>
        <p style={{ margin: '7px 0 0', fontSize: 13.5, color: '#64748b', lineHeight: 1.5, maxWidth: 680 }}>
          Définissez les catégories de compétences et les compétences dans chacune d&apos;elles : acronyme, titre et
          description. L&apos;ordre des compétences dans une catégorie détermine leur niveau.
        </p>
      </div>

      {error ? (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#dc2626' }}>
          {error}
        </div>
      ) : null}
      {successMsg ? (
        <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#047857' }}>
          {successMsg}
        </div>
      ) : null}

      {/* ── Catégories ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 13, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: '#94a3b8' }}>
          Catégories de compétences
        </span>
        <span style={{ fontSize: 11.5, color: '#94a3b8' }}>Glissez <strong>⠿⠿</strong> pour réordonner catégories et compétences</span>
      </div>

      {categories.length === 0 ? (
        <div style={{ textAlign: 'center', background: '#fff', border: '1.5px dashed #e2e8f0', borderRadius: 16, padding: '36px 24px', marginBottom: 16 }}>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: 13.5 }}>Aucune catégorie pour l&apos;instant. Créez-en une ci-dessous.</p>
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

      <div style={{ marginBottom: 32 }}>
        <button type="button" onClick={() => setCategoryModal({ name: '', color: 'slate' })}
          style={{ cursor: 'pointer', border: '1px dashed #cbd5e1', background: '#fff', color: '#2563eb', borderRadius: 10, padding: '11px 16px', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit', width: '100%' }}>
          + Nouvelle catégorie
        </button>
      </div>

      {/* ── Statuts ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 13, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: '#94a3b8' }}>
          Statuts de compétence
        </span>
        <span style={{ fontSize: 11.5, color: '#94a3b8' }}>
          Le statut <strong style={{ color: '#0f172a' }}>{statuses.find((s) => s.protected)?.label ?? 'protégé'}</strong> est protégé : sa clé qualifie l&apos;éligibilité aux missions.
        </span>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e7e9ee', borderRadius: 16, boxShadow: '0 2px 10px rgba(15,23,42,.05)', padding: '14px 22px 18px', marginBottom: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {statuses.length === 0 ? (
            <div style={{ fontSize: 12.5, color: '#94a3b8', padding: '2px' }}>Aucun statut défini.</div>
          ) : statuses.map((status, index) => {
            const p = palette(status.color);
            return (
              <div key={status.id} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #eef1f5', borderRadius: 12, padding: '10px 13px', background: '#fcfcfd' }}>
                <span style={{
                  flexShrink: 0, minWidth: 30, textAlign: 'center', fontSize: 14, fontWeight: 800, color: p.accent,
                  background: p.soft, border: `1px solid ${p.softBorder}`, borderRadius: 7, padding: '4px 6px',
                }} aria-hidden>{status.mark}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{status.label}</span>
                {status.is_validating ? (
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: '#059669', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 5, padding: '1px 7px' }}>validant</span>
                ) : null}
                {status.protected ? (
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 5, padding: '1px 7px' }}>protégé</span>
                ) : null}
                <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                  <button type="button" onClick={() => void handleMoveStatusUp(index)} disabled={index === 0}
                    style={{ cursor: index === 0 ? 'not-allowed' : 'pointer', border: 'none', background: 'transparent', color: '#94a3b8', fontSize: 13, padding: '4px 6px', opacity: index === 0 ? 0.3 : 1 }}>↑</button>
                  <button type="button" onClick={() => void handleMoveStatusDown(index)} disabled={index === statuses.length - 1}
                    style={{ cursor: index === statuses.length - 1 ? 'not-allowed' : 'pointer', border: 'none', background: 'transparent', color: '#94a3b8', fontSize: 13, padding: '4px 6px', opacity: index === statuses.length - 1 ? 0.3 : 1 }}>↓</button>
                  <button type="button" onClick={() => setStatusModal({ id: status.id, label: status.label, color: status.color, mark: status.mark, isValidating: status.is_validating })}
                    style={{ cursor: 'pointer', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>
                    Modifier
                  </button>
                  {!status.protected ? (
                    <button type="button" onClick={() => void handleDeleteStatus(status.id, status.label)}
                      style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: '#dc2626', fontSize: 15, padding: '4px 6px' }}>✕</button>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
        <button type="button" onClick={() => setStatusModal({ label: '', color: 'slate', mark: '✓', isValidating: false })}
          style={{ marginTop: 11, cursor: 'pointer', border: '1px dashed #cbd5e1', background: '#fff', color: '#2563eb', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', width: '100%', textAlign: 'left' }}>
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
              style={inputStyle}
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
            <FieldLabel>Acronyme <span style={{ color: '#94a3b8', fontWeight: 600 }}>(ex : PSE1, CE…)</span></FieldLabel>
            <input
              value={skillModal.code}
              onChange={(e) => setSkillModal((m) => (m ? { ...m, code: e.target.value } : m))}
              placeholder="Ex : PSE1"
              maxLength={12}
              style={{ ...inputStyle, maxWidth: 180, textTransform: 'uppercase' }}
            />
          </div>
          <div>
            <FieldLabel>Titre</FieldLabel>
            <input
              value={skillModal.name}
              onChange={(e) => setSkillModal((m) => (m ? { ...m, name: e.target.value } : m))}
              placeholder="Ex : Premiers secours en équipe niveau 1"
              style={inputStyle}
            />
          </div>
          <div>
            <FieldLabel>Description <span style={{ color: '#94a3b8', fontWeight: 600 }}>(optionnelle)</span></FieldLabel>
            <textarea
              value={skillModal.description}
              onChange={(e) => setSkillModal((m) => (m ? { ...m, description: e.target.value } : m))}
              placeholder="Contenu, prérequis ou critères de validation de la compétence."
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
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
              style={inputStyle}
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
              style={{ ...inputStyle, width: 60, textAlign: 'center' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 13px', border: '1px solid #eef1f5', borderRadius: 11, background: '#fcfcfd' }}>
            <Toggle value={statusModal.isValidating} onChange={(v) => setStatusModal((m) => (m ? { ...m, isValidating: v } : m))} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>Compte comme « validé »</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Ce statut qualifie la compétence comme acquise dans le suivi.</div>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
