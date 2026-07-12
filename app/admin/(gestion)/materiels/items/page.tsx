'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { MaterielType } from '@/lib/types';
import { usePermissions } from '@/lib/permissions/permissions-context';
import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/cn';

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 text-[12.5px] font-bold text-ink-2">{children}</div>;
}

const inputClass = 'w-full rounded-[10px] border border-line-field px-3 py-2 text-sm text-ink outline-none';
const thClass = 'text-left px-3 py-2 text-[11.5px] font-bold uppercase text-ink-3';
const tdClass = 'px-3 py-2 align-top';

type ItemModalState = { id?: string; code: string; name: string; description: string };

export default function AdminMaterielItemsPage() {
  const router = useRouter();
  const { loading: permissionsLoading, can } = usePermissions();
  const canSee = can('materiel', 'can_see');
  const canManage = can('materiel', 'can_manage');
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

      const { data: sessionData } = await supabase.auth.getSession();
      const tok = sessionData.session?.access_token ?? '';
      setToken(tok);
      await fetchItems(tok);
      setLoading(false);
    }
    void init();
  }, [router, fetchItems]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((t) =>
      t.name.toLowerCase().includes(q) ||
      (t.code ?? '').toLowerCase().includes(q) ||
      (t.description ?? '').toLowerCase().includes(q)
    );
  }, [items, search]);

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
          code: itemModal.code.trim(),
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

  if (loading || permissionsLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-ink-3">Chargement…</p>
      </div>
    );
  }

  // Gating UX seulement — les vraies gardes sont la RLS et les routes API.
  if (!canSee) {
    return (
      <div className="rounded-lg border border-bad/30 bg-bad-soft p-4 text-sm text-bad">
        Accès refusé : vous n&apos;avez pas la permission de voir le matériel.
      </div>
    );
  }

  return (
    <div className="pb-20">
      <PageHeader
        title="Bibliothèque d'items"
        subtitle="Les items définis ici peuvent être ajoutés dans n'importe quel contenant depuis la page Matériel."
      />

      <div className="mb-[18px] flex flex-wrap items-center gap-2.5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par nom, code ou description…"
          className={cn(inputClass, 'min-w-[200px] flex-[1_1_240px]')}
        />
      </div>

      {error ? (
        <div className="mb-4 rounded-[10px] border border-bad/30 bg-bad-soft px-4 py-3 text-[13px] text-bad">
          {error}
        </div>
      ) : null}

      {filteredItems.length === 0 ? (
        <div className="mb-4 rounded-2xl border-[1.5px] border-dashed border-line bg-surface-card px-6 py-9 text-center">
          <p className="text-[13.5px] text-ink-3">
            {items.length === 0 ? "Aucun item pour l'instant. Créez-en un ci-dessous." : 'Aucun résultat pour cette recherche.'}
          </p>
        </div>
      ) : (
        <div className="mb-4 overflow-x-auto rounded-2xl border border-line">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-surface-sub">
                <th className={thClass}>Code</th>
                <th className={thClass}>Nom</th>
                <th className={thClass}>Description</th>
                <th className={thClass}>Présent dans</th>
                <th className={cn(thClass, 'w-px')} />
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.id} className="border-t border-line-row">
                  <td className={tdClass}>{item.code ? <span className="font-semibold text-ink-2">{item.code}</span> : '—'}</td>
                  <td className={cn(tdClass, 'whitespace-nowrap font-bold text-ink')}>{item.name}</td>
                  <td className={cn(tdClass, 'text-ink-2')}>{item.description || '—'}</td>
                  <td className={cn(tdClass, 'text-ink-2')}>{item.containers && item.containers.length > 0 ? item.containers.join(', ') : '—'}</td>
                  <td className={cn(tdClass, 'whitespace-nowrap')}>
                    {canManage ? (
                      <span className="inline-flex items-center gap-1">
                        <Button variant="ghost" onClick={() => setItemModal({ id: item.id, code: item.code ?? '', name: item.name, description: item.description ?? '' })}
                          className="rounded-[7px] px-2.5 py-[5px] text-xs">
                          Modifier
                        </Button>
                        <button type="button" onClick={() => void handleDeleteItem(item.id, item.name)} aria-label="Supprimer"
                          className="p-1 text-bad">
                          <Icon name="delete" size={18} />
                        </button>
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage ? (
        <button type="button" onClick={() => setItemModal({ code: '', name: '', description: '' })}
          className="w-full rounded-[10px] border border-dashed border-line-field bg-surface-card px-4 py-[11px] text-[13.5px] font-bold text-brand">
          + Nouvel item
        </button>
      ) : null}

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
              <FieldLabel>Code <span className="font-semibold text-ink-3">(optionnel)</span></FieldLabel>
              <input
                value={itemModal.code}
                onChange={(e) => setItemModal((m) => (m ? { ...m, code: e.target.value } : m))}
                placeholder="Ex : référence interne"
                maxLength={24}
                className={cn(inputClass, 'max-w-[220px] uppercase')}
              />
            </div>
            <div>
              <FieldLabel>Nom</FieldLabel>
              <input
                value={itemModal.name}
                onChange={(e) => setItemModal((m) => (m ? { ...m, name: e.target.value } : m))}
                onKeyDown={(e) => { if (e.key === 'Enter') void submitItem(); }}
                placeholder="Nom de l'item"
                className={inputClass}
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
