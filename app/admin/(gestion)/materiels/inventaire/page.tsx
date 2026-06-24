'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Profile, MaterielType, MaterielCategory, MaterielInstance, MaterielInstanceStatus, MaterielTypeContent } from '@/lib/types';

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

type StatusModalState = { id?: string; label: string; color: string; isAvailable: boolean };
type InstanceModalState = { id?: string; materielTypeId: string; label: string; location: string; statusId: string; parentInstanceId: string };
type AuditModalState = { instance: MaterielInstance };

type AuditRow = { childTypeId: string; childTypeName: string; expected: number; actual: number };

export default function AdminMaterielInventairePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [categories, setCategories] = useState<(MaterielCategory & { materiel_types: MaterielType[] })[]>([]);
  const [statuses, setStatuses] = useState<MaterielInstanceStatus[]>([]);
  const [instances, setInstances] = useState<MaterielInstance[]>([]);

  const [statusModal, setStatusModal] = useState<StatusModalState | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);

  const [instanceModal, setInstanceModal] = useState<InstanceModalState | null>(null);
  const [savingInstance, setSavingInstance] = useState(false);

  const [auditModal, setAuditModal] = useState<AuditModalState | null>(null);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  function flash(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  }

  const fetchAll = useCallback(async (tok: string) => {
    const [catRes, statusRes, instanceRes] = await Promise.all([
      fetch('/api/admin/materiel-categories', { headers: { Authorization: `Bearer ${tok}` } }),
      fetch('/api/admin/materiel-instance-statuses', { headers: { Authorization: `Bearer ${tok}` } }),
      fetch('/api/admin/materiel-instances', { headers: { Authorization: `Bearer ${tok}` } }),
    ]);
    if (catRes.ok) {
      const json = (await catRes.json()) as { categories: (MaterielCategory & { materiel_types: MaterielType[] })[] };
      setCategories(json.categories);
    }
    if (statusRes.ok) {
      const json = (await statusRes.json()) as { statuses: MaterielInstanceStatus[] };
      setStatuses(json.statuses);
    }
    if (instanceRes.ok) {
      const json = (await instanceRes.json()) as { instances: MaterielInstance[] };
      setInstances(json.instances);
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
      await fetchAll(tok);
      setLoading(false);
    }
    void init();
  }, [router, fetchAll]);

  const allTypes = categories.flatMap((c) => c.materiel_types);

  // ── Statuts d'instance ─────────────────────────────────────────

  async function submitStatus() {
    if (!statusModal || !statusModal.label.trim()) return;
    setSavingStatus(true);
    setError(null);
    try {
      const isEdit = !!statusModal.id;
      const res = await fetch(isEdit ? `/api/admin/materiel-instance-statuses/${statusModal.id}` : '/api/admin/materiel-instance-statuses', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: statusModal.label.trim(), color: statusModal.color, is_available: statusModal.isAvailable }),
      });
      if (res.ok) {
        await fetchAll(token);
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

  async function handleDeleteStatus(id: string) {
    setError(null);
    const res = await fetch(`/api/admin/materiel-instance-statuses/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      await fetchAll(token);
    } else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Erreur lors de la suppression.');
    }
  }

  async function swapStatusOrder(a: MaterielInstanceStatus, b: MaterielInstanceStatus) {
    await Promise.all([
      fetch(`/api/admin/materiel-instance-statuses/${a.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_order: b.display_order }),
      }),
      fetch(`/api/admin/materiel-instance-statuses/${b.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_order: a.display_order }),
      }),
    ]);
    await fetchAll(token);
  }

  async function handleMoveStatusUp(index: number) {
    if (index === 0) return;
    await swapStatusOrder(statuses[index - 1], statuses[index]);
  }

  async function handleMoveStatusDown(index: number) {
    if (index === statuses.length - 1) return;
    await swapStatusOrder(statuses[index], statuses[index + 1]);
  }

  // ── Instances ───────────────────────────────────────────────────

  async function submitInstance() {
    if (!instanceModal || !instanceModal.label.trim() || !instanceModal.materielTypeId || !instanceModal.statusId) return;
    setSavingInstance(true);
    setError(null);
    try {
      const isEdit = !!instanceModal.id;
      const res = await fetch(isEdit ? `/api/admin/materiel-instances/${instanceModal.id}` : '/api/admin/materiel-instances', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: instanceModal.label.trim(),
          location: instanceModal.location.trim(),
          status_id: instanceModal.statusId,
          parent_instance_id: instanceModal.parentInstanceId || null,
          ...(isEdit ? {} : { materiel_type_id: instanceModal.materielTypeId }),
        }),
      });
      if (res.ok) {
        await fetchAll(token);
        setInstanceModal(null);
        flash(isEdit ? 'Instance modifiée.' : 'Instance créée.');
      } else {
        const json = (await res.json()) as { error?: string };
        setError(json.error ?? 'Erreur lors de l’enregistrement.');
      }
    } finally {
      setSavingInstance(false);
    }
  }

  async function handleDeleteInstance(id: string, label: string) {
    if (!confirm(`Supprimer l'instance "${label}" de l'inventaire ?`)) return;
    setError(null);
    const res = await fetch(`/api/admin/materiel-instances/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      await fetchAll(token);
      flash('Instance supprimée.');
    } else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Erreur lors de la suppression.');
    }
  }

  // ── Audit : contenu réel vs contenu attendu ─────────────────────

  async function openAudit(instance: MaterielInstance) {
    setAuditModal({ instance });
    setAuditLoading(true);
    try {
      const res = await fetch(`/api/admin/materiel-types/${instance.materiel_type_id}/contents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const expectedContents: MaterielTypeContent[] = res.ok ? ((await res.json()) as { contents: MaterielTypeContent[] }).contents : [];

      const children = instances.filter((i) => i.parent_instance_id === instance.id);
      const rows: AuditRow[] = expectedContents.map((c) => {
        const actual = children.filter((child) => child.materiel_type_id === c.child_type_id).length;
        return {
          childTypeId: c.child_type_id,
          childTypeName: c.child_type?.name ?? allTypes.find((t) => t.id === c.child_type_id)?.name ?? '—',
          expected: c.quantity,
          actual,
        };
      });
      setAuditRows(rows);
    } finally {
      setAuditLoading(false);
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

  const instancesByType = allTypes
    .map((type) => ({ type, items: instances.filter((i) => i.materiel_type_id === type.id) }))
    .filter((group) => group.items.length > 0);

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ marginBottom: 18, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 25, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
            Inventaire
          </h1>
          <p style={{ margin: '7px 0 0', fontSize: 13.5, color: '#64748b', lineHeight: 1.5, maxWidth: 680 }}>
            Instances physiques de matériel : statut, emplacement, et contenu réel comparé au contenu attendu du
            catalogue.
          </p>
        </div>
        <Link href="/admin/materiels"
          style={{ flexShrink: 0, cursor: 'pointer', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
          ← Catalogue
        </Link>
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

      <div style={{ marginBottom: 28 }}>
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: '#94a3b8' }}>
          Statuts d&apos;instance
        </span>
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {statuses.map((status, index) => (
            <div key={status.id} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #eef1f5', borderRadius: 10, padding: '8px 12px', background: '#fcfcfd' }}>
              <span style={{ flexShrink: 0, width: 10, height: 10, borderRadius: '50%', background: palette(status.color).accent }} />
              <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: '#0f172a' }}>{status.label}</span>
              {status.is_available ? (
                <span style={{ fontSize: 11, fontWeight: 700, color: '#047857', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 99, padding: '2px 9px' }}>Disponible</span>
              ) : (
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 99, padding: '2px 9px' }}>Indisponible</span>
              )}
              <button type="button" onClick={() => void handleMoveStatusUp(index)} disabled={index === 0}
                style={{ cursor: index === 0 ? 'not-allowed' : 'pointer', border: 'none', background: 'transparent', color: '#94a3b8', fontSize: 13, padding: '4px 6px', opacity: index === 0 ? 0.3 : 1 }}>↑</button>
              <button type="button" onClick={() => void handleMoveStatusDown(index)} disabled={index === statuses.length - 1}
                style={{ cursor: index === statuses.length - 1 ? 'not-allowed' : 'pointer', border: 'none', background: 'transparent', color: '#94a3b8', fontSize: 13, padding: '4px 6px', opacity: index === statuses.length - 1 ? 0.3 : 1 }}>↓</button>
              <button type="button" onClick={() => setStatusModal({ id: status.id, label: status.label, color: status.color, isAvailable: status.is_available })}
                style={{ cursor: 'pointer', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>
                Modifier
              </button>
              {!status.protected ? (
                <button type="button" onClick={() => void handleDeleteStatus(status.id)} aria-label="Supprimer"
                  style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: '#dc2626', fontSize: 15, padding: '4px 6px' }}>✕</button>
              ) : null}
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setStatusModal({ label: '', color: 'slate', isAvailable: true })}
          style={{ marginTop: 11, cursor: 'pointer', border: '1px dashed #cbd5e1', background: '#fff', color: '#2563eb', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', width: '100%', textAlign: 'left' }}>
          + Nouveau statut
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 13, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: '#94a3b8' }}>
          Instances
        </span>
      </div>

      {instancesByType.length === 0 ? (
        <div style={{ textAlign: 'center', background: '#fff', border: '1.5px dashed #e2e8f0', borderRadius: 16, padding: '36px 24px', marginBottom: 16 }}>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: 13.5 }}>Aucune instance pour l&apos;instant. Créez-en une ci-dessous.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 16 }}>
          {instancesByType.map(({ type, items }) => (
            <div key={type.id} style={{ background: '#fff', border: '1px solid #e7e9ee', borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #eef1f5', fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
                {type.name} <span style={{ fontWeight: 600, color: '#94a3b8', fontSize: 12 }}>({items.length})</span>
              </div>
              <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.map((instance) => {
                  const status = statuses.find((s) => s.id === instance.status_id);
                  const parent = instances.find((i) => i.id === instance.parent_instance_id);
                  const childCount = instances.filter((i) => i.parent_instance_id === instance.id).length;
                  return (
                    <div key={instance.id} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #eef1f5', borderRadius: 10, padding: '9px 12px' }}>
                      <span style={{ flexShrink: 0, width: 10, height: 10, borderRadius: '50%', background: status ? palette(status.color).accent : '#cbd5e1' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a' }}>{instance.label}</div>
                        <div style={{ marginTop: 2, fontSize: 12, color: '#94a3b8' }}>
                          {status?.label ?? '—'}
                          {instance.location ? ` · ${instance.location}` : ''}
                          {parent ? ` · dans ${parent.label}` : ''}
                          {childCount > 0 ? ` · ${childCount} élément${childCount > 1 ? 's' : ''} contenu${childCount > 1 ? 's' : ''}` : ''}
                        </div>
                      </div>
                      <button type="button" onClick={() => void openAudit(instance)}
                        style={{ cursor: 'pointer', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>
                        Audit
                      </button>
                      <button type="button" onClick={() => setInstanceModal({
                        id: instance.id, materielTypeId: instance.materiel_type_id, label: instance.label,
                        location: instance.location ?? '', statusId: instance.status_id, parentInstanceId: instance.parent_instance_id ?? '',
                      })}
                        style={{ cursor: 'pointer', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>
                        Modifier
                      </button>
                      <button type="button" onClick={() => void handleDeleteInstance(instance.id, instance.label)} aria-label="Supprimer"
                        style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: '#dc2626', fontSize: 15, padding: '4px 6px' }}>✕</button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginBottom: 32 }}>
        <button type="button" onClick={() => setInstanceModal({ materielTypeId: allTypes[0]?.id ?? '', label: '', location: '', statusId: statuses[0]?.id ?? '', parentInstanceId: '' })}
          disabled={allTypes.length === 0 || statuses.length === 0}
          style={{ cursor: allTypes.length === 0 || statuses.length === 0 ? 'not-allowed' : 'pointer', border: '1px dashed #cbd5e1', background: '#fff', color: '#2563eb', borderRadius: 10, padding: '11px 16px', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit', width: '100%' }}>
          + Nouvelle instance
        </button>
        {allTypes.length === 0 ? (
          <p style={{ marginTop: 8, fontSize: 12, color: '#94a3b8' }}>Créez d&apos;abord un type de matériel dans le catalogue.</p>
        ) : null}
      </div>

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
              placeholder="Ex. : En service, En maintenance, Retiré…"
              style={inputStyle}
            />
          </div>
          <div>
            <FieldLabel>Couleur</FieldLabel>
            <ColorSwatches value={statusModal.color} onChange={(color) => setStatusModal((m) => (m ? { ...m, color } : m))} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="checkbox"
              checked={statusModal.isAvailable}
              onChange={(e) => setStatusModal((m) => (m ? { ...m, isAvailable: e.target.checked } : m))}
            />
            <span style={{ fontSize: 13, color: '#334155' }}>Une instance dans ce statut peut être affectée à une mission</span>
          </div>
        </Modal>
      ) : null}

      {/* ── Modale instance ── */}
      {instanceModal ? (
        <Modal
          title={instanceModal.id ? "Modifier l'instance" : 'Nouvelle instance'}
          onClose={() => setInstanceModal(null)}
          onSubmit={submitInstance}
          submitLabel={savingInstance ? 'Enregistrement…' : instanceModal.id ? 'Enregistrer' : 'Créer'}
          submitDisabled={savingInstance || !instanceModal.label.trim() || !instanceModal.materielTypeId || !instanceModal.statusId}
        >
          {!instanceModal.id ? (
            <div>
              <FieldLabel>Type de matériel</FieldLabel>
              <select
                value={instanceModal.materielTypeId}
                onChange={(e) => setInstanceModal((m) => (m ? { ...m, materielTypeId: e.target.value } : m))}
                style={inputStyle}
              >
                {allTypes.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          ) : null}
          <div>
            <FieldLabel>Libellé</FieldLabel>
            <input
              value={instanceModal.label}
              onChange={(e) => setInstanceModal((m) => (m ? { ...m, label: e.target.value } : m))}
              placeholder="Ex. : identifiant, numéro de série…"
              style={inputStyle}
            />
          </div>
          <div>
            <FieldLabel>Emplacement <span style={{ color: '#94a3b8', fontWeight: 600 }}>(optionnel)</span></FieldLabel>
            <input
              value={instanceModal.location}
              onChange={(e) => setInstanceModal((m) => (m ? { ...m, location: e.target.value } : m))}
              style={inputStyle}
            />
          </div>
          <div>
            <FieldLabel>Statut</FieldLabel>
            <select
              value={instanceModal.statusId}
              onChange={(e) => setInstanceModal((m) => (m ? { ...m, statusId: e.target.value } : m))}
              style={inputStyle}
            >
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>Contenu dans <span style={{ color: '#94a3b8', fontWeight: 600 }}>(optionnel)</span></FieldLabel>
            <select
              value={instanceModal.parentInstanceId}
              onChange={(e) => setInstanceModal((m) => (m ? { ...m, parentInstanceId: e.target.value } : m))}
              style={inputStyle}
            >
              <option value="">Aucune instance parente</option>
              {instances.filter((i) => i.id !== instanceModal.id).map((i) => (
                <option key={i.id} value={i.id}>{i.label}</option>
              ))}
            </select>
          </div>
        </Modal>
      ) : null}

      {/* ── Modale audit ── */}
      {auditModal ? (
        <Modal
          title={`Audit de « ${auditModal.instance.label} »`}
          subtitle="Contenu réel (instances enfants) comparé au contenu attendu du catalogue."
          onClose={() => setAuditModal(null)}
        >
          {auditLoading ? (
            <div style={{ fontSize: 12.5, color: '#94a3b8' }}>Chargement…</div>
          ) : auditRows.length === 0 ? (
            <div style={{ fontSize: 12.5, color: '#94a3b8' }}>Ce type de matériel n&apos;a aucun contenu attendu défini dans le catalogue.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {auditRows.map((row) => {
                const ok = row.actual >= row.expected;
                return (
                  <div key={row.childTypeId} style={{ display: 'flex', alignItems: 'center', gap: 10, border: `1px solid ${ok ? '#a7f3d0' : '#fecaca'}`, background: ok ? '#ecfdf5' : '#fef2f2', borderRadius: 10, padding: '9px 12px' }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: '#0f172a' }}>{row.childTypeName}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: ok ? '#047857' : '#dc2626' }}>
                      {row.actual} / {row.expected}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Modal>
      ) : null}
    </div>
  );
}
