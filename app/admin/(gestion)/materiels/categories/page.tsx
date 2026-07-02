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
import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/cn';

// ── Palette des catégories (même palette que les compétences) ────────

const CATEGORY_PALETTE: Record<string, { accent: string; soft: string; softBorder: string }> = {
  slate: { accent: '#5B6478', soft: '#F4F6FA', softBorder: '#E5E9F0' },
  amber: { accent: '#B4590F', soft: '#FFF3E9', softBorder: '#FBD9BE' },
  sky: { accent: '#1E3C87', soft: '#EEF4FE', softBorder: '#CFDDF6' },
  violet: { accent: '#7A2E86', soft: '#F5EDFA', softBorder: '#E3D6EF' },
  emerald: { accent: '#0B6E63', soft: '#E9F7F4', softBorder: '#C7E9E3' },
  pink: { accent: '#8E1279', soft: '#F8E6F4', softBorder: '#E9C9E4' },
  rose: { accent: '#D14343', soft: '#FDEAEA', softBorder: '#F5C6C6' },
  orange: { accent: '#B4590F', soft: '#FFF3E9', softBorder: '#FBD9BE' },
  cyan: { accent: '#0B6E63', soft: '#E9F7F4', softBorder: '#C7E9E3' },
  indigo: { accent: '#1E3C87', soft: '#EEF4FE', softBorder: '#CFDDF6' },
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
      className="shrink-0 cursor-grab touch-none"
      style={style}
    >
      <Icon name="drag_indicator" className="text-ink-3" />
    </span>
  );
}

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
              'inline-flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs text-white',
              active ? 'border-ink shadow-[0_0_0_2px_#fff_inset]' : 'border-transparent'
            )}
            style={{ background: palette(c.value).accent }}
          >
            {active ? <Icon name="check" size={14} /> : ''}
          </button>
        );
      })}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 text-[12.5px] font-bold text-ink-2">{children}</div>;
}

const inputClass = 'w-full rounded-[10px] border border-line-field px-3 py-2 text-sm text-ink outline-none';

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
      className="mb-2 flex items-center gap-[11px] rounded-2xl border border-line bg-surface-card px-[14px] py-3 shadow-card"
      style={{
        transform: CSS.Transform.toString(transform), transition,
        opacity: isDragging ? 0.6 : 1, boxShadow: isDragging ? '0 6px 18px rgba(15,23,42,.12)' : undefined, zIndex: isDragging ? 1 : 'auto',
      }}
    >
      <DragHandle attributes={attributes} listeners={listeners} />
      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: p.accent }} />
      <span className="min-w-0 flex-1 text-[14.5px] font-bold text-ink">{category.name}</span>
      <span
        className="shrink-0 rounded-full border px-[9px] py-0.5 text-[11.5px] font-bold"
        style={{ color: p.accent, background: p.soft, borderColor: p.softBorder }}
      >
        {count} contenant{count !== 1 ? 's' : ''}
      </span>
      <span className="inline-flex shrink-0 items-center gap-1">
        <Button variant="ghost" onClick={onEdit} className="rounded-[7px] px-2.5 py-[5px] text-xs">
          Modifier
        </Button>
        <button type="button" onClick={onDelete} aria-label="Supprimer"
          className="p-1 text-bad">
          <Icon name="delete" size={18} />
        </button>
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
        title="Types de matériel"
        subtitle="Définissez les types de matériel (ex. Ambulance, Lot A, Véhicule de transport). Un contenant porte un type ; une mission réclame un type en quantité, sans préciser lequel."
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

      {categories.length === 0 ? (
        <div className="mb-4 rounded-2xl border-[1.5px] border-dashed border-line bg-surface-card px-6 py-9 text-center">
          <p className="text-[13.5px] text-ink-3">Aucun type pour l&apos;instant. Créez-en un ci-dessous.</p>
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

      <div className="mt-2">
        <button type="button" onClick={() => setCategoryModal({ name: '', color: 'slate' })}
          className="w-full rounded-[10px] border border-dashed border-line-field bg-surface-card px-4 py-[11px] text-[13.5px] font-bold text-brand">
          + Nouveau type
        </button>
      </div>

      {categoryModal ? (
        <Modal
          title={categoryModal.id ? 'Modifier le type' : 'Nouveau type'}
          onClose={() => setCategoryModal(null)}
          maxWidth={480}
          footer={
            <>
              <Button variant="ghost" onClick={() => setCategoryModal(null)}>Annuler</Button>
              <Button variant="engage" onClick={submitCategory} disabled={savingCategory || !categoryModal.name.trim()}>
                {savingCategory ? 'Enregistrement…' : categoryModal.id ? 'Enregistrer' : 'Créer'}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <div>
              <FieldLabel>Nom</FieldLabel>
              <input
                value={categoryModal.name}
                onChange={(e) => setCategoryModal((m) => (m ? { ...m, name: e.target.value } : m))}
                onKeyDown={(e) => { if (e.key === 'Enter') submitCategory(); }}
                placeholder="Ex. : Ambulance, Lot A, Véhicule de transport…"
                className={inputClass}
                autoFocus
              />
            </div>
            <div>
              <FieldLabel>Couleur</FieldLabel>
              <ColorSwatches value={categoryModal.color} onChange={(color) => setCategoryModal((m) => (m ? { ...m, color } : m))} />
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
