'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Profile, MaterielType } from '@/lib/types';

function Modal({ title, onClose, children, onSubmit, submitLabel, submitDisabled }: {
  title: string;
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
      <div style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: 18, boxShadow: '0 24px 60px rgba(15,23,42,.3)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '18px 20px 14px', borderBottom: '1px solid #eef1f5' }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a' }}>{title}</div>
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
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '9px 12px', fontSize: 11.5, fontWeight: 800, letterSpacing: '.02em', textTransform: 'uppercase', color: '#64748b' };
const tdStyle: React.CSSProperties = { padding: '9px 12px', verticalAlign: 'top' };

type ItemModalState = { id?: string; code: string; name: string; description: string };

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
          Bibliothèque d&apos;items
        </h1>
        <p style={{ margin: '7px 0 0', fontSize: 13.5, color: '#64748b', lineHeight: 1.5, maxWidth: 680 }}>
          Les items définis ici peuvent être ajoutés dans n&apos;importe quel contenant depuis la page Matériel.
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par nom, code ou description…"
          style={{ ...inputStyle, flex: '1 1 240px', minWidth: 200 }}
        />
      </div>

      {error ? (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#dc2626' }}>
          {error}
        </div>
      ) : null}

      {filteredItems.length === 0 ? (
        <div style={{ textAlign: 'center', background: '#fff', border: '1.5px dashed #e2e8f0', borderRadius: 16, padding: '36px 24px', marginBottom: 16 }}>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: 13.5 }}>
            {items.length === 0 ? "Aucun item pour l'instant. Créez-en un ci-dessous." : 'Aucun résultat pour cette recherche.'}
          </p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #eef1f5', borderRadius: 12, marginBottom: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={thStyle}>Code</th>
                <th style={thStyle}>Nom</th>
                <th style={thStyle}>Description</th>
                <th style={thStyle}>Présent dans</th>
                <th style={{ ...thStyle, width: 1 }} />
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.id} style={{ borderTop: '1px solid #eef1f5' }}>
                  <td style={tdStyle}>{item.code ? <span style={{ fontWeight: 600, color: '#64748b' }}>{item.code}</span> : '—'}</td>
                  <td style={{ ...tdStyle, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>{item.name}</td>
                  <td style={{ ...tdStyle, color: '#64748b' }}>{item.description || '—'}</td>
                  <td style={{ ...tdStyle, color: '#64748b' }}>{item.containers && item.containers.length > 0 ? item.containers.join(', ') : '—'}</td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <button type="button" onClick={() => setItemModal({ id: item.id, code: item.code ?? '', name: item.name, description: item.description ?? '' })}
                        style={{ cursor: 'pointer', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>
                        Modifier
                      </button>
                      <button type="button" onClick={() => void handleDeleteItem(item.id, item.name)} aria-label="Supprimer"
                        style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: '#dc2626', fontSize: 15, padding: '4px 6px' }}>✕</button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button type="button" onClick={() => setItemModal({ code: '', name: '', description: '' })}
        style={{ cursor: 'pointer', border: '1px dashed #cbd5e1', background: '#fff', color: '#2563eb', borderRadius: 10, padding: '11px 16px', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit', width: '100%' }}>
        + Nouvel item
      </button>

      {itemModal ? (
        <Modal
          title={itemModal.id ? "Modifier l'item" : 'Nouvel item'}
          onClose={() => setItemModal(null)}
          onSubmit={submitItem}
          submitLabel={saving ? 'Enregistrement…' : itemModal.id ? 'Enregistrer' : 'Créer'}
          submitDisabled={saving || !itemModal.name.trim()}
        >
          <div>
            <FieldLabel>Code <span style={{ color: '#94a3b8', fontWeight: 600 }}>(optionnel)</span></FieldLabel>
            <input
              value={itemModal.code}
              onChange={(e) => setItemModal((m) => (m ? { ...m, code: e.target.value } : m))}
              placeholder="Ex : référence interne"
              maxLength={24}
              style={{ ...inputStyle, maxWidth: 220, textTransform: 'uppercase' }}
            />
          </div>
          <div>
            <FieldLabel>Nom</FieldLabel>
            <input
              value={itemModal.name}
              onChange={(e) => setItemModal((m) => (m ? { ...m, name: e.target.value } : m))}
              onKeyDown={(e) => { if (e.key === 'Enter') void submitItem(); }}
              placeholder="Nom de l'item"
              style={inputStyle}
            />
          </div>
          <div>
            <FieldLabel>Description <span style={{ color: '#94a3b8', fontWeight: 600 }}>(optionnelle)</span></FieldLabel>
            <textarea
              value={itemModal.description}
              onChange={(e) => setItemModal((m) => (m ? { ...m, description: e.target.value } : m))}
              placeholder="Précisions utiles à l'équipe."
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
