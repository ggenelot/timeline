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
import { Profile, MaterielCategory } from '@/lib/types';

// ── Palette des catégories (même palette que les compétences) ────────

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

type CategoryWithTypes = MaterielCategory & { materiel_types: Array<{ id: string }> };

type CategoryModalState = { id?: string; name: string; color: string };

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

function Modal({ title, onClose, children, onSubmit, submitLabel, submitDisabled }: {
  title: string;
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
      <div style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: 18, boxShadow: '0 24px 60px rgba(15,23,42,.3)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '18px 20px 14px', borderBottom: '1px solid #eef1f5' }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a' }}>{title}</div>
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

function SortableCategoryRow({ category, onEdit, onDelete }: {
  category: CategoryWithTypes;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category.id });
  const p = palette(category.color);
  const count = category.materiel_types?.length ?? 0;
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform), transition, display: 'flex', alignItems: 'center', gap: 11,
        border: '1px solid #eef1f5', borderRadius: 12, padding: '12px 14px', background: '#fff',
        opacity: isDragging ? 0.6 : 1, boxShadow: isDragging ? '0 6px 18px rgba(15,23,42,.12)' : 'none', zIndex: isDragging ? 1 : 'auto',
        marginBottom: 8,
      }}
    >
      <DragHandle attributes={attributes} listeners={listeners} />
      <span style={{ flexShrink: 0, width: 12, height: 12, borderRadius: '50%', background: p.accent }} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 700, color: '#0f172a' }}>{category.name}</span>
      <span style={{
        fontSize: 11.5, fontWeight: 700, color: p.accent, background: p.soft, border: `1px solid ${p.softBorder}`,
        borderRadius: 99, padding: '2px 9px', flexShrink: 0,
      }}>
        {count} contenant{count !== 1 ? 's' : ''}
      </span>
      <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <button type="button" onClick={onEdit}
          style={{ cursor: 'pointer', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>
          Modifier
        </button>
        <button type="button" onClick={onDelete} aria-label="Supprimer"
          style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: '#dc2626', fontSize: 15, padding: '4px 6px' }}>✕</button>
      </span>
    </div>
  );
}

export default function AdminMaterielCategoriesPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<CategoryWithTypes[]>([]);
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const [categoryModal, setCategoryModal] = useState<CategoryModalState | null>(null);
  const [savingCategory, setSavingCategory] = useState(false);

  function flash(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  }

  const fetchCategories = useCallback(async (tok: string) => {
    const res = await fetch('/api/admin/materiel-categories', {
      headers: { Authorization: `Bearer ${tok}` },
    });
    if (res.ok) {
      const json = (await res.json()) as { categories: CategoryWithTypes[] };
      setCategories(json.categories);
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
      await fetchCategories(tok);
      setLoading(false);
    }
    void init();
  }, [router, fetchCategories]);

  async function submitCategory() {
    if (!categoryModal || !categoryModal.name.trim()) return;
    setSavingCategory(true);
    setError(null);
    try {
      const isEdit = !!categoryModal.id;
      const res = await fetch(isEdit ? `/api/admin/materiel-categories/${categoryModal.id}` : '/api/admin/materiel-categories', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: categoryModal.name.trim(), color: categoryModal.color }),
      });
      if (res.ok) {
        await fetchCategories(token);
        setCategoryModal(null);
        flash(isEdit ? 'Type modifié.' : 'Type créé.');
      } else {
        const json = (await res.json()) as { error?: string };
        setError(json.error ?? 'Erreur lors de l’enregistrement.');
      }
    } finally {
      setSavingCategory(false);
    }
  }

  async function handleDeleteCategory(id: string, name: string) {
    if (!confirm(`Supprimer le type "${name}" ? Les contenants associés perdront ce type.`)) return;
    setError(null);
    const res = await fetch(`/api/admin/materiel-categories/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      await fetchCategories(token);
      flash('Type supprimé.');
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
        next.map((cat, i) => fetch(`/api/admin/materiel-categories/${cat.id}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ display_order: i }),
        }))
      );
    } catch {
      setError('Erreur lors de la réorganisation des types.');
    }
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
          Types de matériel
        </h1>
        <p style={{ margin: '7px 0 0', fontSize: 13.5, color: '#64748b', lineHeight: 1.5, maxWidth: 680 }}>
          Définissez les types de matériel (ex. Ambulance, Lot A, Véhicule de transport). Un contenant porte un type ;
          une mission réclame un type en quantité, sans préciser lequel.
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

      {categories.length === 0 ? (
        <div style={{ textAlign: 'center', background: '#fff', border: '1.5px dashed #e2e8f0', borderRadius: 16, padding: '36px 24px', marginBottom: 16 }}>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: 13.5 }}>Aucun type pour l&apos;instant. Créez-en un ci-dessous.</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCategoryDragEnd}>
          <SortableContext items={categories.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {categories.map((cat) => (
              <SortableCategoryRow
                key={cat.id}
                category={cat}
                onEdit={() => setCategoryModal({ id: cat.id, name: cat.name, color: cat.color })}
                onDelete={() => handleDeleteCategory(cat.id, cat.name)}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}

      <div style={{ marginTop: 8 }}>
        <button type="button" onClick={() => setCategoryModal({ name: '', color: 'slate' })}
          style={{ cursor: 'pointer', border: '1px dashed #cbd5e1', background: '#fff', color: '#2563eb', borderRadius: 10, padding: '11px 16px', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit', width: '100%' }}>
          + Nouveau type
        </button>
      </div>

      {categoryModal ? (
        <Modal
          title={categoryModal.id ? 'Modifier le type' : 'Nouveau type'}
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
              placeholder="Ex. : Ambulance, Lot A, Véhicule de transport…"
              style={inputStyle}
              autoFocus
            />
          </div>
          <div>
            <FieldLabel>Couleur</FieldLabel>
            <ColorSwatches value={categoryModal.color} onChange={(color) => setCategoryModal((m) => (m ? { ...m, color } : m))} />
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
