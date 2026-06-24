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
import { Profile, MaterielType, MaterielCategory, MaterielTypeContent } from '@/lib/types';

// ── Palette des catégories (même palette que les pages Compétences/Cursus) ──

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

type CategoryWithTypes = MaterielCategory & { materiel_types: MaterielType[] };

type CategoryModalState = { id?: string; name: string; color: string };
type TypeModalState = { categoryId: string; id?: string; code: string; name: string; description: string };
type ContentsModalState = { typeId: string; typeName: string };

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
  onSubmit?: () => void;
  submitLabel?: string;
  submitDisabled?: boolean;
}) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '56px 18px', overflowY: 'auto' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: '100%', maxWidth: 560, background: '#fff', borderRadius: 18, boxShadow: '0 24px 60px rgba(15,23,42,.3)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '18px 20px 14px', borderBottom: '1px solid #eef1f5' }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a' }}>{title}</div>
            {subtitle ? <div style={{ marginTop: 3, fontSize: 12.5, color: '#64748b' }}>{subtitle}</div> : null}
          </div>
          <button type="button" onClick={onClose} style={{ flexShrink: 0, cursor: 'pointer', border: 'none', background: '#f1f5f9', color: '#64748b', width: 30, height: 30, borderRadius: 8, fontSize: 16 }}>✕</button>
        </div>
        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>
        {onSubmit ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid #eef1f5', background: '#fafbfc' }}>
            <button type="button" onClick={onClose} style={{ cursor: 'pointer', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>Annuler</button>
            <button type="button" onClick={onSubmit} disabled={submitDisabled} style={{ cursor: submitDisabled ? 'not-allowed' : 'pointer', border: 'none', background: submitDisabled ? '#94a3b8' : '#059669', color: '#fff', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', opacity: submitDisabled ? 0.6 : 1 }}>{submitLabel}</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 7 }}>{children}</div>;
}

const inputStyle: React.CSSProperties = { width: '100%', border: '1px solid #cbd5e1', borderRadius: 9, padding: '10px 12px', fontSize: 14, color: '#0f172a', outline: 'none', fontFamily: 'inherit' };

// ── Ligne de type triable ──────────────────────────────────────────

function SortableTypeRow({ type, color, onEdit, onRemove, onEditContents }: {
  type: MaterielType;
  color: string;
  onEdit: () => void;
  onRemove: () => void;
  onEditContents: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: type.id });
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
        {type.code || '—'}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{type.name}</div>
        {type.description ? (
          <div style={{ marginTop: 3, fontSize: 12.5, color: '#64748b', lineHeight: 1.45 }}>{type.description}</div>
        ) : null}
      </div>
      <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <button type="button" onClick={onEditContents}
          style={{ cursor: 'pointer', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>
          Contenu
        </button>
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

function SortableCategoryCard({ category, sensors, onTypeDragEnd, onEditCategory, onDeleteCategory, onAddType, onEditType, onRemoveType, onEditContents }: {
  category: CategoryWithTypes;
  sensors: ReturnType<typeof useSensors>;
  onTypeDragEnd: (event: DragEndEvent) => void;
  onEditCategory: () => void;
  onDeleteCategory: () => void;
  onAddType: () => void;
  onEditType: (type: MaterielType) => void;
  onRemoveType: (typeId: string) => void;
  onEditContents: (type: MaterielType) => void;
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
            {category.materiel_types.length} type{category.materiel_types.length !== 1 ? 's' : ''}
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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onTypeDragEnd}>
          <SortableContext items={category.materiel_types.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {category.materiel_types.length === 0 ? (
                <div style={{ fontSize: 12.5, color: '#94a3b8', padding: '2px' }}>Aucun type de matériel dans cette catégorie.</div>
              ) : category.materiel_types.map((type) => (
                <SortableTypeRow
                  key={type.id}
                  type={type}
                  color={category.color}
                  onEdit={() => onEditType(type)}
                  onRemove={() => onRemoveType(type.id)}
                  onEditContents={() => onEditContents(type)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <button type="button" onClick={onAddType}
          style={{ marginTop: 11, cursor: 'pointer', border: '1px dashed #cbd5e1', background: '#fff', color: '#2563eb', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', width: '100%', textAlign: 'left' }}>
          + Ajouter un type de matériel
        </button>
      </div>
    </div>
  );
}

export default function AdminMaterielsPage() {
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

  const [typeModal, setTypeModal] = useState<TypeModalState | null>(null);
  const [savingType, setSavingType] = useState(false);

  const [contentsModal, setContentsModal] = useState<ContentsModalState | null>(null);
  const [contents, setContents] = useState<MaterielTypeContent[]>([]);
  const [contentsLoading, setContentsLoading] = useState(false);
  const [newContentTypeId, setNewContentTypeId] = useState('');
  const [newContentQuantity, setNewContentQuantity] = useState(1);

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

  const allTypes = categories.flatMap((c) => c.materiel_types);

  // ── Catégories ──────────────────────────────────────────────

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
    if (!confirm(`Supprimer la catégorie "${name}" ? Les types de matériel associés seront également supprimés.`)) return;
    setError(null);
    const res = await fetch(`/api/admin/materiel-categories/${id}`, {
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
        next.map((cat, i) => fetch(`/api/admin/materiel-categories/${cat.id}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ display_order: i }),
        }))
      );
    } catch {
      setError('Erreur lors de la réorganisation des catégories.');
    }
  }

  // ── Types de matériel ─────────────────────────────────────────

  async function submitType() {
    if (!typeModal || !typeModal.name.trim()) return;
    setSavingType(true);
    setError(null);
    try {
      const isEdit = !!typeModal.id;
      const res = await fetch(isEdit ? `/api/admin/materiel-types/${typeModal.id}` : '/api/admin/materiel-types', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: typeModal.name.trim(),
          code: typeModal.code.trim(),
          description: typeModal.description.trim(),
          ...(isEdit ? {} : { category_id: typeModal.categoryId }),
        }),
      });
      if (res.ok) {
        await fetchCategories(token);
        setTypeModal(null);
        flash(isEdit ? 'Type de matériel modifié.' : 'Type de matériel ajouté.');
      } else {
        const json = (await res.json()) as { error?: string };
        setError(json.error ?? 'Erreur lors de l’enregistrement.');
      }
    } finally {
      setSavingType(false);
    }
  }

  async function handleDeleteType(id: string) {
    setError(null);
    const res = await fetch(`/api/admin/materiel-types/${id}`, {
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

  async function handleTypeDragEnd(categoryId: string, event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) return;
    const oldIndex = cat.materiel_types.findIndex((t) => t.id === active.id);
    const newIndex = cat.materiel_types.findIndex((t) => t.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(cat.materiel_types, oldIndex, newIndex);
    setCategories((prev) => prev.map((c) => (c.id === categoryId ? { ...c, materiel_types: next } : c)));
    setError(null);
    try {
      await Promise.all(
        next.map((t, i) => fetch(`/api/admin/materiel-types/${t.id}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ display_order: i }),
        }))
      );
    } catch {
      setError('Erreur lors de la réorganisation des types de matériel.');
    }
  }

  // ── Contenu de lot ─────────────────────────────────────────────

  const fetchContents = useCallback(async (typeId: string) => {
    setContentsLoading(true);
    const res = await fetch(`/api/admin/materiel-types/${typeId}/contents`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const json = (await res.json()) as { contents: MaterielTypeContent[] };
      setContents(json.contents);
    }
    setContentsLoading(false);
  }, [token]);

  function openContents(type: MaterielType) {
    setContentsModal({ typeId: type.id, typeName: type.name });
    setNewContentTypeId('');
    setNewContentQuantity(1);
    void fetchContents(type.id);
  }

  async function handleAddContent() {
    if (!contentsModal || !newContentTypeId) return;
    setError(null);
    const res = await fetch(`/api/admin/materiel-types/${contentsModal.typeId}/contents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ child_type_id: newContentTypeId, quantity: newContentQuantity }),
    });
    if (res.ok) {
      await fetchContents(contentsModal.typeId);
      setNewContentTypeId('');
      setNewContentQuantity(1);
    } else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? "Erreur lors de l'ajout.");
    }
  }

  async function handleUpdateContentQuantity(contentId: string, quantity: number) {
    if (!contentsModal || quantity < 1) return;
    const res = await fetch(`/api/admin/materiel-types/${contentsModal.typeId}/contents/${contentId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity }),
    });
    if (res.ok) {
      await fetchContents(contentsModal.typeId);
    }
  }

  async function handleRemoveContent(contentId: string) {
    if (!contentsModal) return;
    const res = await fetch(`/api/admin/materiel-types/${contentsModal.typeId}/contents/${contentId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      await fetchContents(contentsModal.typeId);
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

  const availableForContents = allTypes.filter(
    (t) => t.id !== contentsModal?.typeId && !contents.some((c) => c.child_type_id === t.id)
  );

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 25, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
          Matériel
        </h1>
        <p style={{ margin: '7px 0 0', fontSize: 13.5, color: '#64748b', lineHeight: 1.5, maxWidth: 680 }}>
          Définissez les catégories et les types de matériel, et pour chaque type le contenu de lot attendu
          (les autres types qu&apos;il doit contenir, avec leur quantité).
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

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 13, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: '#94a3b8' }}>
          Catégories de matériel
        </span>
        <span style={{ fontSize: 11.5, color: '#94a3b8' }}>Glissez <strong>⠿⠿</strong> pour réordonner catégories et types</span>
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
                onTypeDragEnd={(e) => handleTypeDragEnd(cat.id, e)}
                onEditCategory={() => setCategoryModal({ id: cat.id, name: cat.name, color: cat.color })}
                onDeleteCategory={() => handleDeleteCategory(cat.id, cat.name)}
                onAddType={() => setTypeModal({ categoryId: cat.id, code: '', name: '', description: '' })}
                onEditType={(type) => setTypeModal({ categoryId: cat.id, id: type.id, code: type.code ?? '', name: type.name, description: type.description ?? '' })}
                onRemoveType={(typeId) => void handleDeleteType(typeId)}
                onEditContents={openContents}
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
              placeholder="Ex. : Véhicules, Secourisme, Communication…"
              style={inputStyle}
            />
          </div>
          <div>
            <FieldLabel>Couleur</FieldLabel>
            <ColorSwatches value={categoryModal.color} onChange={(color) => setCategoryModal((m) => (m ? { ...m, color } : m))} />
          </div>
        </Modal>
      ) : null}

      {/* ── Modale type de matériel ── */}
      {typeModal ? (
        <Modal
          title={typeModal.id ? 'Modifier le type de matériel' : 'Ajouter un type de matériel'}
          subtitle={categories.find((c) => c.id === typeModal.categoryId)?.name}
          onClose={() => setTypeModal(null)}
          onSubmit={submitType}
          submitLabel={savingType ? 'Enregistrement…' : typeModal.id ? 'Enregistrer' : 'Ajouter'}
          submitDisabled={savingType || !typeModal.name.trim()}
        >
          <div>
            <FieldLabel>Code <span style={{ color: '#94a3b8', fontWeight: 600 }}>(optionnel)</span></FieldLabel>
            <input
              value={typeModal.code}
              onChange={(e) => setTypeModal((m) => (m ? { ...m, code: e.target.value } : m))}
              placeholder="Ex : référence interne"
              maxLength={24}
              style={{ ...inputStyle, maxWidth: 220, textTransform: 'uppercase' }}
            />
          </div>
          <div>
            <FieldLabel>Nom</FieldLabel>
            <input
              value={typeModal.name}
              onChange={(e) => setTypeModal((m) => (m ? { ...m, name: e.target.value } : m))}
              placeholder="Nom du type de matériel"
              style={inputStyle}
            />
          </div>
          <div>
            <FieldLabel>Description <span style={{ color: '#94a3b8', fontWeight: 600 }}>(optionnelle)</span></FieldLabel>
            <textarea
              value={typeModal.description}
              onChange={(e) => setTypeModal((m) => (m ? { ...m, description: e.target.value } : m))}
              placeholder="Précisions utiles à l'équipe."
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>
        </Modal>
      ) : null}

      {/* ── Modale contenu de lot ── */}
      {contentsModal ? (
        <Modal
          title={`Contenu de « ${contentsModal.typeName} »`}
          subtitle="Types de matériel que ce type contient, et en quelle quantité."
          onClose={() => setContentsModal(null)}
        >
          {contentsLoading ? (
            <div style={{ fontSize: 12.5, color: '#94a3b8' }}>Chargement…</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {contents.length === 0 ? (
                <div style={{ fontSize: 12.5, color: '#94a3b8' }}>Ce type ne contient encore aucun autre type de matériel.</div>
              ) : contents.map((c) => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #eef1f5', borderRadius: 10, padding: '9px 12px' }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: '#0f172a' }}>
                    {c.child_type?.name ?? '—'}
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={c.quantity}
                    onChange={(e) => void handleUpdateContentQuantity(c.id, Number(e.target.value) || 1)}
                    style={{ ...inputStyle, width: 64, textAlign: 'center' }}
                  />
                  <button type="button" onClick={() => void handleRemoveContent(c.id)} aria-label="Retirer"
                    style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: '#dc2626', fontSize: 15, padding: '4px 6px' }}>✕</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 6, borderTop: '1px solid #eef1f5' }}>
            <select
              value={newContentTypeId}
              onChange={(e) => setNewContentTypeId(e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
            >
              <option value="">Ajouter un type…</option>
              {availableForContents.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              value={newContentQuantity}
              onChange={(e) => setNewContentQuantity(Number(e.target.value) || 1)}
              style={{ ...inputStyle, width: 64, textAlign: 'center' }}
            />
            <button type="button" onClick={handleAddContent} disabled={!newContentTypeId}
              style={{ cursor: newContentTypeId ? 'pointer' : 'not-allowed', border: 'none', background: newContentTypeId ? '#059669' : '#94a3b8', color: '#fff', borderRadius: 9, padding: '10px 16px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>
              Ajouter
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
