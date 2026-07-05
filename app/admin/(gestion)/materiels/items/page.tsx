'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Profile, MaterielType } from '@/lib/types';
import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { KebabMenu } from '@/components/ui/kebab-menu';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';

const MAX_CONTAINER_CHIPS = 2;

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 text-[12.5px] font-bold text-ink-2">{children}</div>;
}

const inputClass = 'w-full rounded-[10px] border border-line-field px-3 py-2 text-sm text-ink outline-none';

type ItemModalState = { id?: string; name: string; description: string };

function ItemCard({ item, onEdit, onDelete }: {
  item: MaterielType;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const containers = item.containers ?? [];
  const shown = containers.slice(0, MAX_CONTAINER_CHIPS);
  const rest = containers.length - shown.length;

  return (
    <div className="relative rounded-xl border border-line bg-surface-card p-3">
      <KebabMenu
        className="absolute right-2 top-2"
        items={[
          { label: 'Modifier', onClick: onEdit },
          { label: 'Supprimer', onClick: onDelete, danger: true },
        ]}
      />
      <div className="mb-1 pr-6 text-[14px] font-extrabold text-ink">{item.name}</div>
      <div className="mb-2.5 text-[11.5px] leading-tight text-ink-3">{item.description || '—'}</div>
      <div className="flex flex-wrap gap-1">
        {containers.length === 0 ? (
          <Badge tone="neutral" className="text-[10px]">Non placé</Badge>
        ) : (
          <>
            {shown.map((name) => (
              <Badge key={name} tone="neutral" className="text-[10px]">{name}</Badge>
            ))}
            {rest > 0 ? <Badge tone="neutral" className="text-[10px]">+{rest}</Badge> : null}
          </>
        )}
      </div>
    </div>
  );
}

export default function AdminMaterielItemsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<MaterielType[]>([]);
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [itemModal, setItemModal] = useState<ItemModalState | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchItems = useCallback(async (tok: string) => {
    const res = await fetch('/api/admin/materiel-types?kind=items', { headers: { Authorization: `Bearer ${tok}` } });
    if (res.ok) {
      const json = (await res.json()) as { types: MaterielType[] };
      setItems(json.types);
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
      await fetchItems(tok);
      setLoading(false);
    }
    void init();
  }, [router, fetchItems]);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [items]
  );

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedItems;
    return sortedItems.filter((t) =>
      t.name.toLowerCase().includes(q) ||
      (t.description ?? '').toLowerCase().includes(q)
    );
  }, [sortedItems, search]);

  async function submitItem() {
    if (!itemModal || !itemModal.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const isEdit = !!itemModal.id;
      const res = await fetch(isEdit ? `/api/admin/materiel-types/${itemModal.id}` : '/api/admin/materiel-types', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: itemModal.name.trim(),
          description: itemModal.description.trim(),
          ...(isEdit ? {} : { is_container: false }),
        }),
      });
      if (res.ok) {
        await fetchItems(token);
        setItemModal(null);
      } else {
        const json = (await res.json()) as { error?: string };
        setError(json.error ?? "Erreur lors de l'enregistrement.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteItem(id: string, name: string) {
    if (!confirm(`Supprimer l'item « ${name} » ? Il sera retiré de tous les contenants où il figure.`)) return;
    setError(null);
    const res = await fetch(`/api/admin/materiel-types/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      await fetchItems(token);
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
        title="Bibliothèque d'items"
        subtitle="Chaque carte regroupe nom, description et emplacements en un coup d'œil. L'ajout dans un contenant se fait depuis la page Contenants (glisser-déposer)."
      />

      <div className="mb-[18px] flex items-center gap-2 rounded-[10px] border border-line-field bg-surface-card px-3 py-2.5">
        <Icon name="search" size={18} className="text-ink-3" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par nom ou description…"
          className="flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
        />
      </div>

      {error ? (
        <div className="mb-4 rounded-[10px] border border-bad/30 bg-bad-soft px-4 py-3 text-[13px] text-bad">
          {error}
        </div>
      ) : null}

      {filteredItems.length === 0 && items.length > 0 ? (
        <div className="mb-4 rounded-2xl border-[1.5px] border-dashed border-line bg-surface-card px-6 py-9 text-center">
          <p className="text-[13.5px] text-ink-3">Aucun résultat pour cette recherche.</p>
        </div>
      ) : (
        <div className="mb-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {filteredItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              onEdit={() => setItemModal({ id: item.id, name: item.name, description: item.description ?? '' })}
              onDelete={() => void handleDeleteItem(item.id, item.name)}
            />
          ))}
          <button
            type="button"
            onClick={() => setItemModal({ name: '', description: '' })}
            className={cn(
              'flex min-h-[96px] items-center justify-center rounded-xl border-[1.5px] border-dashed border-line-field text-[12.5px] font-bold text-brand',
              filteredItems.length === 0 && 'sm:col-span-2'
            )}
          >
            + Nouvel item
          </button>
        </div>
      )}

      <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">
        Liste triée par ordre alphabétique — pas de glisser-déposer ici, l&apos;ajout dans un contenant se fait depuis la page Contenants.
      </p>

      {itemModal ? (
        <Modal
          title={itemModal.id ? "Modifier l'item" : 'Nouvel item'}
          onClose={() => setItemModal(null)}
          maxWidth={480}
          footer={
            <>
              <Button variant="ghost" onClick={() => setItemModal(null)}>Annuler</Button>
              <Button variant="engage" onClick={submitItem} disabled={saving || !itemModal.name.trim()}>
                {saving ? 'Enregistrement…' : itemModal.id ? 'Enregistrer' : 'Créer'}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <div>
              <FieldLabel>Nom</FieldLabel>
              <input
                value={itemModal.name}
                onChange={(e) => setItemModal((m) => (m ? { ...m, name: e.target.value } : m))}
                onKeyDown={(e) => { if (e.key === 'Enter') void submitItem(); }}
                placeholder="Nom de l'item"
                className={inputClass}
                autoFocus
              />
            </div>
            <div>
              <FieldLabel>Description <span className="font-semibold text-ink-3">(optionnelle)</span></FieldLabel>
              <textarea
                value={itemModal.description}
                onChange={(e) => setItemModal((m) => (m ? { ...m, description: e.target.value } : m))}
                placeholder="Précisions utiles à l'équipe."
                rows={3}
                className={cn(inputClass, 'resize-y')}
              />
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
