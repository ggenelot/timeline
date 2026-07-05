'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Profile, MaterielCategory } from '@/lib/types';
import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { KebabMenu } from '@/components/ui/kebab-menu';
import { materielPalette, MATERIEL_COLOR_OPTIONS } from '@/lib/materiel-palette';
import { cn } from '@/lib/cn';

type CategoryWithTypes = MaterielCategory & { materiel_types: Array<{ id: string }> };

type CategoryModalState = { id?: string; name: string; color: string };

function ColorSwatches({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="flex flex-wrap gap-[9px]">
      {MATERIEL_COLOR_OPTIONS.map((c) => {
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
            style={{ background: materielPalette(c.value).accent }}
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

function CategoryRow({ category, onEdit, onDelete }: {
  category: CategoryWithTypes;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const p = materielPalette(category.color);
  const count = category.materiel_types?.length ?? 0;
  return (
    <div className="mb-2 flex items-center gap-[11px] rounded-2xl border border-line bg-surface-card px-[14px] py-3 shadow-card">
      <span className="min-w-0 flex-1 text-[14.5px] font-bold text-ink">{category.name}</span>
      <span
        className="shrink-0 rounded-full border px-[9px] py-0.5 text-[11.5px] font-bold"
        style={{ color: p.accent, background: p.soft, borderColor: p.softBorder }}
      >
        {count} contenant{count !== 1 ? 's' : ''}
      </span>
      <KebabMenu items={[
        { label: 'Modifier', onClick: onEdit },
        { label: 'Supprimer', onClick: onDelete, danger: true },
      ]} />
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

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [categories]
  );

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
        subtitle="Un contenant racine porte un type ; une mission réclame un type en quantité, sans préciser lequel."
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

      {sortedCategories.length === 0 ? (
        <div className="mb-4 rounded-2xl border-[1.5px] border-dashed border-line bg-surface-card px-6 py-9 text-center">
          <p className="text-[13.5px] text-ink-3">Aucun type pour l&apos;instant. Créez-en un ci-dessous.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-0">
          {sortedCategories.map((cat) => (
            <CategoryRow
              key={cat.id}
              category={cat}
              onEdit={() => setCategoryModal({ id: cat.id, name: cat.name, color: cat.color })}
              onDelete={() => handleDeleteCategory(cat.id, cat.name)}
            />
          ))}
        </div>
      )}

      <p className="mb-4 text-[11.5px] leading-relaxed text-ink-3">
        Liste triée par ordre alphabétique. « 0 contenant » signale un type orphelin, candidat à suppression.
      </p>

      <button type="button" onClick={() => setCategoryModal({ name: '', color: 'slate' })}
        className="w-full rounded-[10px] border border-dashed border-line-field bg-surface-card px-4 py-[11px] text-[13.5px] font-bold text-brand">
        + Nouveau type
      </button>

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
