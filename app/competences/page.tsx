'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import type {
  Cursus,
  CursusPhase,
  CursusCompetence,
  CursusRule,
  VolunteerCursus,
  Doublure,
  CompetenceValidation,
} from '@/lib/types';
import {
  getAllCursus,
  getCursusWithDetails,
  getVolunteerCursus,
  getDoubluresForVolunteerCursus,
  getValidationsForVolunteerCursus,
  enrollInCursus,
  declareDoublure,
  deleteDoublure,
  declareCompetenceValidation,
  deleteCompetenceValidation,
} from '@/lib/queries/cursus';

// ── Types ─────────────────────────────────────────────────────

type CursusDetail = Cursus & { rules: CursusRule[]; phases: CursusPhase[] };
type ViewMode = 'parcours' | 'carnet';

type ModalKind = 'doublure' | 'validation';

type EventOption = { id: string; name: string; sub: string; date?: string };
type SupOption = { id: string; name: string; sub: string };

type ModalState = {
  kind: ModalKind;
  phaseId?: string;
  competenceId?: string;
  // event
  eventMode: 'search' | 'manual' | 'chosen';
  eventQuery: string;
  eventResults: EventOption[];
  chosenEvent: EventOption | null;
  // manual event
  evName: string;
  evDate: string;
  evAntenne: string;
  // supervisor
  supMode: 'search' | 'manual' | 'chosen';
  supQuery: string;
  supResults: SupOption[];
  chosenSup: SupOption | null;
  // manual sup
  supName: string;
  supAntenne: string;
  // message
  message: string;
};

const MODAL_INIT: ModalState = {
  kind: 'doublure',
  eventMode: 'search',
  eventQuery: '',
  eventResults: [],
  chosenEvent: null,
  evName: '',
  evDate: '',
  evAntenne: '',
  supMode: 'search',
  supQuery: '',
  supResults: [],
  chosenSup: null,
  supName: '',
  supAntenne: '',
  message: '',
};

// ── Helpers ────────────────────────────────────────────────────

function fmt(d: string | null | undefined) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Visual primitives ─────────────────────────────────────────

function Pill({
  children,
  color,
  bg,
  border,
}: {
  children: React.ReactNode;
  color: string;
  bg: string;
  border?: string;
}) {
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 10.5,
        fontWeight: 700,
        color,
        background: bg,
        border: `1px solid ${border ?? bg}`,
        borderRadius: 5,
        padding: '1px 7px',
      }}
    >
      {children}
    </span>
  );
}

function SegmentedBar({
  total,
  validated,
}: {
  total: number;
  validated: number;
}) {
  return (
    <div style={{ display: 'flex', gap: 4, marginTop: 18 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: 9,
            borderRadius: 5,
            background: i < validated ? '#059669' : '#e2e8f0',
          }}
        />
      ))}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────

function Modal({
  title,
  subtitle,
  onClose,
  children,
  onSubmit,
  submitLabel,
  submitDisabled,
}: {
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
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(15,23,42,.45)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '48px 18px',
        overflowY: 'auto',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 540,
          background: '#fff',
          borderRadius: 18,
          boxShadow: '0 24px 60px rgba(15,23,42,.3)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            padding: '18px 20px 14px',
            borderBottom: '1px solid #eef1f5',
          }}
        >
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a' }}>{title}</div>
            {subtitle ? (
              <div style={{ marginTop: 3, fontSize: 12.5, color: '#64748b' }}>{subtitle}</div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              flexShrink: 0,
              cursor: 'pointer',
              border: 'none',
              background: '#f1f5f9',
              color: '#64748b',
              width: 30,
              height: 30,
              borderRadius: 8,
              fontSize: 16,
            }}
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>
        <div
          style={{
            padding: '18px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
            maxHeight: '60vh',
            overflowY: 'auto',
          }}
        >
          {children}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 10,
            padding: '14px 20px',
            borderTop: '1px solid #eef1f5',
            background: '#fafbfc',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              cursor: 'pointer',
              border: '1px solid #e2e8f0',
              background: '#fff',
              color: '#64748b',
              borderRadius: 9,
              padding: '9px 16px',
              fontSize: 13,
              fontWeight: 700,
              fontFamily: 'inherit',
            }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitDisabled}
            style={{
              cursor: submitDisabled ? 'not-allowed' : 'pointer',
              border: 'none',
              background: '#059669',
              color: '#fff',
              borderRadius: 9,
              padding: '9px 18px',
              fontSize: 13,
              fontWeight: 700,
              fontFamily: 'inherit',
              opacity: submitDisabled ? 0.5 : 1,
            }}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal input helpers ───────────────────────────────────────

function ModalInput({
  value,
  onChange,
  placeholder,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%',
        border: '1px solid #cbd5e1',
        borderRadius: 9,
        padding: '10px 12px',
        fontSize: 14,
        color: '#0f172a',
        outline: 'none',
        fontFamily: 'inherit',
        ...style,
      }}
    />
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 7 }}>
      {children}
    </div>
  );
}

// ── Event field ───────────────────────────────────────────────

function EventField({
  modal,
  setModal,
}: {
  modal: ModalState;
  setModal: React.Dispatch<React.SetStateAction<ModalState>>;
}) {
  async function search(q: string) {
    setModal((m) => ({ ...m, eventQuery: q }));
    if (q.length < 2) { setModal((m) => ({ ...m, eventResults: [] })); return; }
    const { data } = await supabase
      .from('missions')
      .select('id, title, starts_at, location')
      .ilike('title', `%${q}%`)
      .order('starts_at', { ascending: false })
      .limit(5);
    setModal((m) => ({
      ...m,
      eventResults: (data ?? []).map((r: { id: string; title: string; starts_at: string; location: string | null }) => ({
        id: r.id,
        name: r.title,
        sub: `${fmt(r.starts_at)}${r.location ? ' · ' + r.location : ''}`,
        date: r.starts_at,
      })),
    }));
  }

  if (modal.eventMode === 'chosen' && modal.chosenEvent) {
    return (
      <div>
        <FieldLabel>Événement</FieldLabel>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            border: '1.5px solid #a7f3d0',
            background: '#f6fdfa',
            borderRadius: 10,
            padding: '10px 12px',
          }}
        >
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a' }}>{modal.chosenEvent.name}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{modal.chosenEvent.sub}</div>
          </div>
          <button
            type="button"
            onClick={() => setModal((m) => ({ ...m, eventMode: 'search', chosenEvent: null }))}
            style={{ cursor: 'pointer', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', borderRadius: 8, padding: '6px 11px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}
          >
            Changer
          </button>
        </div>
      </div>
    );
  }

  if (modal.eventMode === 'manual') {
    return (
      <div>
        <FieldLabel>Événement hors timeline</FieldLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <ModalInput value={modal.evName} onChange={(v) => setModal((m) => ({ ...m, evName: v }))} placeholder="Nom de l'événement" />
          <div style={{ display: 'flex', gap: 9 }}>
            <ModalInput value={modal.evDate} onChange={(v) => setModal((m) => ({ ...m, evDate: v }))} placeholder="Date (jj/mm/aaaa)" style={{ flex: '1' }} />
            <ModalInput value={modal.evAntenne} onChange={(v) => setModal((m) => ({ ...m, evAntenne: v }))} placeholder="Antenne / lieu" style={{ flex: '1' }} />
          </div>
        </div>
        <button
          type="button"
          onClick={() => setModal((m) => ({ ...m, eventMode: 'search' }))}
          style={{ marginTop: 8, cursor: 'pointer', border: 'none', background: 'transparent', color: '#2563eb', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', padding: 0 }}
        >
          ‹ Rechercher dans la timeline
        </button>
      </div>
    );
  }

  return (
    <div>
      <FieldLabel>Événement</FieldLabel>
      <ModalInput
        value={modal.eventQuery}
        onChange={search}
        placeholder="Rechercher un événement de la timeline…"
      />
      {modal.eventResults.length > 0 ? (
        <div style={{ marginTop: 7, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {modal.eventResults.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setModal((m) => ({ ...m, eventMode: 'chosen', chosenEvent: e, eventQuery: '' }))}
              style={{ cursor: 'pointer', textAlign: 'left', border: '1px solid #e7e9ee', background: '#fff', borderRadius: 9, padding: '9px 11px', fontFamily: 'inherit' }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{e.name}</div>
              <div style={{ fontSize: 11.5, color: '#94a3b8' }}>{e.sub}</div>
            </button>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setModal((m) => ({ ...m, eventMode: 'manual' }))}
        style={{ marginTop: 8, cursor: 'pointer', border: 'none', background: 'transparent', color: '#2563eb', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', padding: 0 }}
      >
        + Événement hors timeline (doublure externe)
      </button>
    </div>
  );
}

// ── Supervisor field ──────────────────────────────────────────

function SupervisorField({
  modal,
  setModal,
}: {
  modal: ModalState;
  setModal: React.Dispatch<React.SetStateAction<ModalState>>;
}) {
  async function search(q: string) {
    setModal((m) => ({ ...m, supQuery: q }));
    if (q.length < 2) { setModal((m) => ({ ...m, supResults: [] })); return; }
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(5);
    setModal((m) => ({
      ...m,
      supResults: (data ?? []).map((r: { id: string; full_name: string | null; email: string }) => ({
        id: r.id,
        name: r.full_name ?? r.email,
        sub: r.email,
      })),
    }));
  }

  if (modal.supMode === 'chosen' && modal.chosenSup) {
    return (
      <div>
        <FieldLabel>Encadré par</FieldLabel>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            border: '1.5px solid #a7f3d0',
            background: '#f6fdfa',
            borderRadius: 10,
            padding: '10px 12px',
          }}
        >
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a' }}>{modal.chosenSup.name}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{modal.chosenSup.sub}</div>
          </div>
          <button
            type="button"
            onClick={() => setModal((m) => ({ ...m, supMode: 'search', chosenSup: null }))}
            style={{ cursor: 'pointer', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', borderRadius: 8, padding: '6px 11px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}
          >
            Changer
          </button>
        </div>
      </div>
    );
  }

  if (modal.supMode === 'manual') {
    return (
      <div>
        <FieldLabel>Superviseur (hors liste)</FieldLabel>
        <div style={{ display: 'flex', gap: 9 }}>
          <ModalInput value={modal.supName} onChange={(v) => setModal((m) => ({ ...m, supName: v }))} placeholder="Prénom Nom" style={{ flex: '1.4' }} />
          <ModalInput value={modal.supAntenne} onChange={(v) => setModal((m) => ({ ...m, supAntenne: v }))} placeholder="Antenne" style={{ flex: '1' }} />
        </div>
        <button
          type="button"
          onClick={() => setModal((m) => ({ ...m, supMode: 'search' }))}
          style={{ marginTop: 8, cursor: 'pointer', border: 'none', background: 'transparent', color: '#2563eb', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', padding: 0 }}
        >
          ‹ Rechercher dans les personnes
        </button>
      </div>
    );
  }

  return (
    <div>
      <FieldLabel>Encadré par</FieldLabel>
      <ModalInput value={modal.supQuery} onChange={search} placeholder="Rechercher une personne…" />
      {modal.supResults.length > 0 ? (
        <div style={{ marginTop: 7, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {modal.supResults.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setModal((m) => ({ ...m, supMode: 'chosen', chosenSup: s, supQuery: '' }))}
              style={{ cursor: 'pointer', textAlign: 'left', border: '1px solid #e7e9ee', background: '#fff', borderRadius: 9, padding: '9px 11px', fontFamily: 'inherit' }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{s.name}</div>
              <div style={{ fontSize: 11.5, color: '#94a3b8' }}>{s.sub}</div>
            </button>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setModal((m) => ({ ...m, supMode: 'manual' }))}
        style={{ marginTop: 8, cursor: 'pointer', border: 'none', background: 'transparent', color: '#2563eb', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', padding: 0 }}
      >
        + Saisir un superviseur hors liste
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────

export default function CompetencesPage() {
  const [profileId, setProfileId] = useState<string | null>(null);
  const [allCursus, setAllCursus] = useState<Cursus[]>([]);
  const [volunteerCursus, setVolunteerCursus] = useState<VolunteerCursus[]>([]);
  const [selectedVCId, setSelectedVCId] = useState<string | null>(null);
  const [cursusDetail, setCursusDetail] = useState<CursusDetail | null>(null);
  const [doublures, setDoublures] = useState<Doublure[]>([]);
  const [validations, setValidations] = useState<CompetenceValidation[]>([]);
  const [view, setView] = useState<ViewMode>('parcours');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // modals
  const [modal, setModal] = useState<ModalState | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // enroll modal
  const [enrollModal, setEnrollModal] = useState(false);

  // ── Load ──────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const pid = session.user.id;
      setProfileId(pid);
      try {
        const [cursusAll, vcAll] = await Promise.all([getAllCursus(), getVolunteerCursus(pid)]);
        setAllCursus(cursusAll);
        setVolunteerCursus(vcAll);
        if (vcAll.length > 0) setSelectedVCId(vcAll[0].id);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (!selectedVCId) { setCursusDetail(null); setDoublures([]); setValidations([]); return; }
    const vc = volunteerCursus.find((v) => v.id === selectedVCId);
    if (!vc) return;
    async function loadDetail() {
      try {
        const [detail, dbl, val] = await Promise.all([
          getCursusWithDetails(vc!.cursus_id),
          getDoubluresForVolunteerCursus(selectedVCId!),
          getValidationsForVolunteerCursus(selectedVCId!),
        ]);
        setCursusDetail(detail);
        setDoublures(dbl);
        setValidations(val);
      } catch (e) {
        setError((e as Error).message);
      }
    }
    loadDetail();
  }, [selectedVCId, volunteerCursus]);

  // ── Derived ────────────────────────────────────────────────

  const validatedIds = useMemo(() => new Set(validations.map((v) => v.competence_id)), [validations]);

  const allComps = useMemo(
    () => cursusDetail?.phases.flatMap((p) => p.competences ?? []) ?? [],
    [cursusDetail]
  );

  const enrolledCursusIds = useMemo(() => new Set(volunteerCursus.map((vc) => vc.cursus_id)), [volunteerCursus]);
  const availableToEnroll = useMemo(() => allCursus.filter((c) => !enrolledCursusIds.has(c.id)), [allCursus, enrolledCursusIds]);

  const currentVC = volunteerCursus.find((v) => v.id === selectedVCId);
  const currentCursusData = currentVC ? (allCursus.find((c) => c.id === currentVC.cursus_id) ?? null) : null;

  // ── Enroll ────────────────────────────────────────────────

  async function handleEnroll(cursusId: string) {
    if (!profileId) return;
    try {
      const vc = await enrollInCursus(profileId, cursusId);
      const cursus = allCursus.find((c) => c.id === cursusId);
      setVolunteerCursus((prev) => [...prev, { ...vc, cursus }]);
      setSelectedVCId(vc.id);
      setEnrollModal(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // ── Modal submit ───────────────────────────────────────────

  function getEventData(m: ModalState) {
    if (m.eventMode === 'chosen' && m.chosenEvent) {
      return {
        mission_id: m.chosenEvent.id,
        event_name: m.chosenEvent.name,
        event_date: m.chosenEvent.date ? m.chosenEvent.date.slice(0, 10) : null,
        event_lieu: null as string | null,
        is_external: false,
      };
    }
    return {
      mission_id: null as string | null,
      event_name: m.evName || null,
      event_date: m.evDate || null,
      event_lieu: m.evAntenne || null,
      is_external: true,
    };
  }

  function getSupData(m: ModalState) {
    if (m.supMode === 'chosen' && m.chosenSup) {
      return { supervisor_id: m.chosenSup.id, supervisor_name: m.chosenSup.name, supervisor_antenne: null as string | null };
    }
    return { supervisor_id: null as string | null, supervisor_name: m.supName || null, supervisor_antenne: m.supAntenne || null };
  }

  async function handleSubmit() {
    if (!modal || !selectedVCId || !profileId) return;
    setSubmitting(true);
    try {
      const ev = getEventData(modal);
      const sup = getSupData(modal);
      if (modal.kind === 'doublure') {
        const dbl = await declareDoublure({
          volunteer_cursus_id: selectedVCId,
          phase_id: modal.phaseId!,
          ...ev,
          ...sup,
          message: modal.message || null,
          is_pending: false,
          declared_by: profileId,
        });
        setDoublures((prev) => [dbl, ...prev]);
      } else {
        const val = await declareCompetenceValidation({
          volunteer_cursus_id: selectedVCId,
          competence_id: modal.competenceId!,
          doublure_id: null,
          ...ev,
          ...sup,
          declared_by: profileId,
        });
        setValidations((prev) => [...prev, val]);
      }
      setModal(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function openDoublureModal(phaseId: string) {
    setModal({ ...MODAL_INIT, kind: 'doublure', phaseId });
  }

  function openValidationModal(competenceId: string) {
    setModal({ ...MODAL_INIT, kind: 'validation', competenceId });
  }

  async function handleDeleteDoublure(id: string) {
    try { await deleteDoublure(id); setDoublures((prev) => prev.filter((d) => d.id !== id)); }
    catch (e) { setError((e as Error).message); }
  }

  async function handleDeleteValidation(id: string) {
    try { await deleteCompetenceValidation(id); setValidations((prev) => prev.filter((v) => v.id !== id)); }
    catch (e) { setError((e as Error).message); }
  }

  function isModalSubmittable() {
    if (!modal) return false;
    if (modal.kind === 'validation' && !modal.competenceId) return false;
    if (modal.kind === 'doublure' && !modal.phaseId) return false;
    return true;
  }

  // ── Render ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '40vh', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#94a3b8' }}>Chargement…</p>
      </div>
    );
  }

  const selectedCursusCode = currentCursusData?.code ?? '';
  const selectedCursusName = currentCursusData?.name ?? '';

  return (
    <div style={{ paddingBottom: 48 }}>

        {/* Breadcrumb */}
        <div style={{ fontSize: 12.5, color: '#94a3b8', fontWeight: 600, marginBottom: 18 }}>
          <Link href="/missions" style={{ color: '#94a3b8', textDecoration: 'none' }}>Missions</Link>
          <span style={{ color: '#cbd5e1' }}> › </span>
          <span>Suivi des compétences</span>
          {selectedCursusName ? (
            <>
              <span style={{ color: '#cbd5e1' }}> › </span>
              <span style={{ color: '#475569' }}>{selectedCursusName}</span>
            </>
          ) : null}
        </div>

        {error ? (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#dc2626' }}>
            {error}
          </div>
        ) : null}

        {/* Cursus tab selector + enroll */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {volunteerCursus.map((vc) => {
            const c = allCursus.find((x) => x.id === vc.cursus_id);
            return (
              <button
                key={vc.id}
                type="button"
                onClick={() => setSelectedVCId(vc.id)}
                style={{
                  cursor: 'pointer',
                  border: selectedVCId === vc.id ? 'none' : '1px solid #e2e8f0',
                  borderRadius: 99,
                  padding: '7px 16px',
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: 'inherit',
                  background: selectedVCId === vc.id ? '#0f172a' : '#fff',
                  color: selectedVCId === vc.id ? '#fff' : '#475569',
                }}
              >
                {c?.code ?? vc.cursus_id}
                {vc.completed_at ? ' ✓' : ''}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setEnrollModal(true)}
            disabled={availableToEnroll.length === 0}
            style={{
              cursor: availableToEnroll.length === 0 ? 'not-allowed' : 'pointer',
              border: '1px dashed #cbd5e1',
              borderRadius: 99,
              padding: '7px 16px',
              fontSize: 13,
              fontWeight: 700,
              fontFamily: 'inherit',
              background: 'transparent',
              color: '#94a3b8',
              opacity: availableToEnroll.length === 0 ? 0.5 : 1,
            }}
          >
            + Rejoindre un cursus
          </button>
        </div>

        {volunteerCursus.length === 0 ? (
          <div style={{ textAlign: 'center', background: '#fff', border: '1.5px dashed #e2e8f0', borderRadius: 18, padding: '60px 24px' }}>
            <p style={{ color: '#94a3b8', fontSize: 15 }}>Vous n&apos;êtes inscrit dans aucun cursus de doublure.</p>
            <button
              type="button"
              onClick={() => setEnrollModal(true)}
              style={{ marginTop: 16, cursor: 'pointer', border: '1px solid #e2e8f0', background: '#fff', color: '#475569', borderRadius: 10, padding: '10px 20px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}
            >
              Rejoindre un cursus
            </button>
          </div>
        ) : cursusDetail ? (
          <>
            {/* ── Header card ── */}
            <div
              style={{
                background: '#fff',
                border: '1px solid #e7e9ee',
                borderRadius: 18,
                boxShadow: '0 2px 10px rgba(15,23,42,.05)',
                padding: '22px 24px',
                marginBottom: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  {cursusDetail.category || cursusDetail.level ? (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#2563eb', marginBottom: 7 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2563eb', display: 'inline-block' }} />
                      {[cursusDetail.category, cursusDetail.level ? `Niveau ${cursusDetail.level}` : null].filter(Boolean).join(' · ')}
                    </div>
                  ) : null}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 11 }}>
                    <h1 style={{ margin: 0, fontSize: 27, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
                      {cursusDetail.name}
                    </h1>
                    <span
                      style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 7, padding: '3px 9px' }}
                    >
                      {cursusDetail.code}
                    </span>
                  </div>
                  {cursusDetail.formation_label ? (
                    <div style={{ marginTop: 9, fontSize: 13.5, color: '#64748b' }}>
                      Formation : {cursusDetail.formation_label}
                      {cursusDetail.formation_required ? ' (obligatoire)' : ' (optionnelle)'}
                    </div>
                  ) : null}
                </div>
                <div style={{ flexShrink: 0, textAlign: 'right' }}>
                  <div style={{ fontSize: 30, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>
                    {validatedIds.size}
                    <span style={{ fontSize: 17, fontWeight: 700, color: '#94a3b8' }}>/{allComps.length}</span>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginTop: 4 }}>compétences validées</div>
                </div>
              </div>

              {/* Segmented progress bar */}
              {allComps.length > 0 ? (
                <>
                  <SegmentedBar total={allComps.length} validated={allComps.filter((c) => validatedIds.has(c.id)).length} />
                  <div style={{ display: 'flex', gap: 16, marginTop: 11, fontSize: 12, color: '#64748b' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 3, background: '#059669', display: 'inline-block' }} />
                      Validée (autodéclarée)
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 3, background: '#e2e8f0', display: 'inline-block' }} />
                      À valider
                    </span>
                  </div>
                </>
              ) : null}
            </div>

            {/* ── Phase stepper grid ── */}
            {cursusDetail.phases.length > 0 ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${cursusDetail.phases.length}, 1fr)`,
                  gap: 10,
                  marginBottom: 22,
                }}
              >
                {cursusDetail.phases.map((ph, i) => {
                  const phDoublures = doublures.filter((d) => d.phase_id === ph.id);
                  const phComps = ph.competences ?? [];
                  const done = phComps.filter((c) => validatedIds.has(c.id)).length;
                  const isComplete = done === phComps.length && phComps.length > 0 && phDoublures.length >= ph.min_doublures;
                  const isActive = !isComplete && (i === 0 || cursusDetail.phases.slice(0, i).every((p) => {
                    const pc = p.competences ?? [];
                    return pc.length > 0 && pc.every((c) => validatedIds.has(c.id));
                  }));
                  const badgeBg = isComplete ? '#059669' : isActive ? '#0f172a' : '#f1f5f9';
                  const badgeColor = isComplete || isActive ? '#fff' : '#94a3b8';
                  const borderColor = isComplete ? '#a7f3d0' : isActive ? '#cbd5e1' : '#e7e9ee';
                  const titleColor = isActive ? '#0f172a' : isComplete ? '#059669' : '#94a3b8';
                  const pillBg = isComplete ? '#d1fae5' : '#f1f5f9';
                  const pillColor = isComplete ? '#059669' : '#94a3b8';

                  return (
                    <div
                      key={ph.id}
                      style={{ background: '#fff', border: `1px solid ${borderColor}`, borderRadius: 13, padding: '13px 14px' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <span
                          style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, background: badgeBg, color: badgeColor, border: `1.5px solid ${borderColor}` }}
                        >
                          {isComplete ? '✓' : i + 1}
                        </span>
                        <span style={{ fontSize: 13.5, fontWeight: 700, color: titleColor }}>
                          {ph.kind === 'pre' ? 'Pré-doublure' : 'Post-doublure'}
                        </span>
                      </div>
                      {ph.sub ? (
                        <div style={{ marginTop: 8, fontSize: 11.5, color: '#94a3b8', lineHeight: 1.4 }}>{ph.sub}</div>
                      ) : null}
                      <div
                        style={{ marginTop: 9, display: 'inline-block', fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '2px 8px', background: pillBg, color: pillColor }}
                      >
                        {done}/{phComps.length} compétences
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {/* ── View switcher ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#94a3b8' }}>Affichage</span>
              <div style={{ display: 'inline-flex', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 3 }}>
                {(['parcours', 'carnet'] as ViewMode[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    style={{
                      cursor: 'pointer',
                      border: 'none',
                      borderRadius: 7,
                      padding: '7px 16px',
                      fontSize: 13,
                      fontWeight: 700,
                      fontFamily: 'inherit',
                      background: view === v ? '#0f172a' : 'transparent',
                      color: view === v ? '#fff' : '#64748b',
                    }}
                  >
                    {v === 'parcours' ? 'Parcours' : 'Carnet'}
                  </button>
                ))}
              </div>
            </div>

            {/* ══════════════ PARCOURS VIEW ══════════════ */}
            {view === 'parcours' ? (
              <div style={{ position: 'relative', paddingLeft: 38 }}>
                {/* vertical timeline line */}
                <div style={{ position: 'absolute', left: 13, top: 6, bottom: 14, width: 2, background: '#e3e7ee' }} />

                {cursusDetail.phases.map((phase, i) => {
                  const phDoublures = doublures.filter((d) => d.phase_id === phase.id);
                  const phComps = (phase.competences ?? []) as CursusCompetence[];
                  const doneComps = phComps.filter((c) => validatedIds.has(c.id));
                  const todoComps = phComps.filter((c) => !validatedIds.has(c.id));
                  const isComplete = doneComps.length === phComps.length && phComps.length > 0 && phDoublures.length >= phase.min_doublures;
                  const nodeBg = isComplete ? '#059669' : i === 0 ? '#0f172a' : '#e2e8f0';
                  const cardBorderColor = isComplete ? '#a7f3d0' : '#e7e9ee';
                  const pillBg = isComplete ? '#d1fae5' : doneComps.length > 0 ? '#eff6ff' : '#f1f5f9';
                  const pillColor = isComplete ? '#059669' : doneComps.length > 0 ? '#1d4ed8' : '#94a3b8';

                  // Group validated competences by their doublure/event
                  const validationsByDoublure: Map<string | null, CompetenceValidation[]> = new Map();
                  for (const val of validations.filter((v) => phComps.some((c) => c.id === v.competence_id))) {
                    const key = val.event_name ?? null;
                    if (!validationsByDoublure.has(key)) validationsByDoublure.set(key, []);
                    validationsByDoublure.get(key)!.push(val);
                  }

                  return (
                    <div key={phase.id} style={{ position: 'relative', paddingBottom: 18 }}>
                      {/* timeline node */}
                      <div
                        style={{
                          position: 'absolute',
                          left: -32,
                          top: 1,
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          background: nodeBg,
                          border: '2px solid #f1f5f9',
                          boxShadow: '0 0 0 4px #f1f5f9',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          fontSize: 12,
                          fontWeight: 800,
                        }}
                      >
                        {isComplete ? '✓' : i + 1}
                      </div>

                      {/* phase card */}
                      <div
                        style={{
                          background: '#fff',
                          border: `1.5px solid ${cardBorderColor}`,
                          borderRadius: 16,
                          boxShadow: '0 1px 3px rgba(15,23,42,.04)',
                          overflow: 'hidden',
                        }}
                      >
                        {/* phase header */}
                        <div style={{ padding: '15px 18px 14px', borderBottom: '1px solid #eef1f5' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 15.5, fontWeight: 800, color: '#0f172a' }}>{phase.label}</span>
                              {phase.provisional ? (
                                <Pill color="#b45309" bg="#fffbeb" border="#fde68a">Contenu provisoire</Pill>
                              ) : null}
                            </div>
                            <div
                              style={{ fontSize: 12, fontWeight: 700, color: pillColor, background: pillBg, borderRadius: 6, padding: '2px 9px' }}
                            >
                              {doneComps.length}/{phComps.length} compétences
                            </div>
                          </div>
                          {phase.sub ? (
                            <div style={{ marginTop: 5, fontSize: 13, color: '#64748b' }}>
                              {phase.sub} · {phDoublures.length}/{phase.min_doublures} doublure{phase.min_doublures > 1 ? 's' : ''}
                              {phase.require_externe ? ' (dont 1 externe)' : ''}
                            </div>
                          ) : null}
                        </div>

                        {/* Doublures & événements section */}
                        <div style={{ padding: '15px 18px 6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 11 }}>
                            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: '#94a3b8' }}>
                              Doublures &amp; événements
                            </span>
                            <span style={{ display: 'inline-flex', gap: 8 }}>
                              <button
                                type="button"
                                onClick={() => openDoublureModal(phase.id)}
                                style={{ cursor: 'pointer', border: '1px solid #0f172a', background: '#0f172a', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}
                              >
                                Déclarer une doublure
                              </button>
                            </span>
                          </div>

                          {/* Events with their competences */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginBottom: 6 }}>
                            {phDoublures.map((d) => {
                              const dVals = validations.filter(
                                (v) => v.doublure_id === d.id || (d.event_name && v.event_name === d.event_name)
                              );
                              return (
                                <div key={d.id} style={{ border: '1px solid #e7e9ee', borderRadius: 13, background: '#fff', overflow: 'hidden' }}>
                                  {/* event header */}
                                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '12px 14px', background: '#f8fafc', borderBottom: '1px solid #eef1f5' }}>
                                    <span style={{ flexShrink: 0, marginTop: 1, width: 26, height: 26, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#eff6ff', border: '1px solid #bfdbfe', fontSize: 13 }}>📅</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{d.event_name ?? 'Doublure'}</span>
                                        {d.is_external ? <Pill color="#6d28d9" bg="#f5f3ff" border="#ddd6fe">Externe</Pill> : null}
                                        {d.mission_id ? <Pill color="#1d4ed8" bg="#eff6ff" border="#bfdbfe">Événement timeline</Pill> : null}
                                        {d.is_pending ? <Pill color="#b45309" bg="#fffbeb" border="#fde68a">En attente</Pill> : null}
                                        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>{fmt(d.event_date)}</span>
                                      </div>
                                      {d.event_lieu ? (
                                        <div style={{ marginTop: 3, fontSize: 12, color: '#94a3b8' }}>{d.event_lieu}</div>
                                      ) : null}
                                      {d.supervisor_name ? (
                                        <div style={{ marginTop: 5, fontSize: 12, color: '#475569' }}>
                                          Encadré par <strong>{d.supervisor_name}</strong>
                                          {d.supervisor_antenne ? ` · ${d.supervisor_antenne}` : ''}
                                        </div>
                                      ) : null}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteDoublure(d.id)}
                                      style={{ flexShrink: 0, cursor: 'pointer', border: 'none', background: 'transparent', color: '#94a3b8', padding: '4px', fontSize: 11.5, fontFamily: 'inherit' }}
                                      aria-label="Supprimer"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                  {/* Competences validated at this event */}
                                  {dVals.map((val) => {
                                    const comp = allComps.find((c) => c.id === val.competence_id);
                                    if (!comp) return null;
                                    return (
                                      <div
                                        key={val.id}
                                        style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '11px 16px 11px 40px', borderTop: '1px solid #f4f6f9', borderLeft: '3px solid #d1fae5' }}
                                      >
                                        <span style={{ flexShrink: 0, marginTop: 1, width: 22, height: 22, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, background: '#059669', color: '#fff', border: '1.5px solid #059669' }}>✓</span>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a' }}>{comp.name}</span>
                                            {comp.garde_only ? <Pill color="#6d28d9" bg="#f5f3ff" border="#ddd6fe">Garde uniquement</Pill> : null}
                                          </div>
                                          {comp.description ? (
                                            <div style={{ marginTop: 2, fontSize: 12, color: '#64748b', lineHeight: 1.45 }}>{comp.description}</div>
                                          ) : null}
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteValidation(val.id)}
                                          style={{ flexShrink: 0, cursor: 'pointer', border: 'none', background: 'transparent', color: '#94a3b8', fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit' }}
                                        >
                                          Annuler
                                        </button>
                                      </div>
                                    );
                                  })}
                                  {dVals.length === 0 ? (
                                    <div style={{ padding: '11px 14px', fontSize: 12.5, color: '#94a3b8' }}>Aucune compétence validée sur cet événement.</div>
                                  ) : null}
                                </div>
                              );
                            })}

                            {phDoublures.length === 0 ? (
                              <div style={{ fontSize: 12.5, color: '#94a3b8' }}>Aucune doublure déclarée pour l&apos;instant.</div>
                            ) : null}
                          </div>
                        </div>

                        {/* Compétences à valider */}
                        {todoComps.length > 0 ? (
                          <div style={{ padding: '14px 18px 18px' }}>
                            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 11 }}>
                              Compétences à valider
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {todoComps.map((c) => (
                                <div
                                  key={c.id}
                                  style={{ display: 'flex', alignItems: 'flex-start', gap: 12, border: '1px solid #e7e9ee', background: '#fff', borderRadius: 12, padding: '12px 14px' }}
                                >
                                  <span style={{ flexShrink: 0, marginTop: 1, width: 24, height: 24, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, background: '#f1f5f9', color: '#94a3b8', border: '1.5px solid #e2e8f0' }}>–</span>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                      <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{c.name}</span>
                                      {c.garde_only ? <Pill color="#6d28d9" bg="#f5f3ff" border="#ddd6fe">Garde uniquement</Pill> : null}
                                    </div>
                                    {c.description ? (
                                      <div style={{ marginTop: 3, fontSize: 12.5, color: '#64748b', lineHeight: 1.45 }}>{c.description}</div>
                                    ) : null}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => openValidationModal(c.id)}
                                    style={{ flexShrink: 0, cursor: 'pointer', border: '1px solid #059669', background: '#059669', color: '#fff', borderRadius: 9, padding: '8px 13px', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                                  >
                                    Déclarer validée
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {/* ══════════════ CARNET VIEW ══════════════ */}
            {view === 'carnet' ? (
              <div>
                {/* Rules */}
                {cursusDetail.rules.length > 0 ? (
                  <div style={{ background: '#fff', border: '1px solid #e7e9ee', borderRadius: 14, padding: '16px 18px', marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 11 }}>
                      Règles du cursus de doublure
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '9px 22px' }}>
                      {cursusDetail.rules.map((r) => (
                        <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13, color: '#475569', lineHeight: 1.45 }}>
                          <span
                            style={{ flexShrink: 0, marginTop: 1, width: 17, height: 17, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, background: r.auto ? '#0f172a' : '#e2e8f0', color: r.auto ? '#fff' : '#64748b' }}
                          >
                            {r.auto ? '⚡' : '·'}
                          </span>
                          <span>{r.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Per-phase carnet */}
                {cursusDetail.phases.map((phase) => {
                  const phDoublures = doublures.filter((d) => d.phase_id === phase.id);
                  const phComps = (phase.competences ?? []) as CursusCompetence[];
                  const doneComps = phComps.filter((c) => validatedIds.has(c.id));
                  const isComplete = doneComps.length === phComps.length && phComps.length > 0;
                  const pillBg = isComplete ? '#d1fae5' : '#f1f5f9';
                  const pillColor = isComplete ? '#059669' : '#94a3b8';

                  return (
                    <div
                      key={phase.id}
                      style={{ background: '#fff', border: '1px solid #e7e9ee', borderRadius: 16, boxShadow: '0 1px 3px rgba(15,23,42,.04)', marginBottom: 16, overflow: 'hidden' }}
                    >
                      {/* Phase header */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '14px 18px', borderBottom: '1px solid #eef1f5' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{phase.label}</span>
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: pillColor, background: pillBg, borderRadius: 6, padding: '2px 8px' }}>
                            {doneComps.length}/{phComps.length}
                          </span>
                          {phase.provisional ? <Pill color="#b45309" bg="#fffbeb" border="#fde68a">Provisoire</Pill> : null}
                        </div>
                        <span style={{ display: 'inline-flex', gap: 8 }}>
                          <button
                            type="button"
                            onClick={() => openDoublureModal(phase.id)}
                            style={{ cursor: 'pointer', border: '1px solid #0f172a', background: '#0f172a', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}
                          >
                            Déclarer une doublure
                          </button>
                        </span>
                      </div>

                      {/* Doublures compact */}
                      {phDoublures.length > 0 ? (
                        <div style={{ padding: '6px 8px 4px' }}>
                          {phDoublures.map((d) => (
                            <div key={d.id} style={{ display: 'grid', gridTemplateColumns: '1fr 168px', gap: 14, alignItems: 'start', padding: '10px 12px', borderBottom: '1px solid #f4f6f9' }}>
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a' }}>{d.event_name ?? 'Doublure'}</span>
                                  {d.is_external ? <Pill color="#6d28d9" bg="#f5f3ff" border="#ddd6fe">Ext.</Pill> : null}
                                  {d.mission_id ? <Pill color="#1d4ed8" bg="#eff6ff" border="#bfdbfe">Timeline</Pill> : null}
                                </div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 12, color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>{fmt(d.event_date)}</div>
                                {d.supervisor_name ? (
                                  <div style={{ marginTop: 2, fontSize: 12.5, fontWeight: 700, color: '#334155' }}>{d.supervisor_name}</div>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {/* Competences table */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 230px 188px', gap: 12, padding: '10px 18px', background: '#f8fafc', borderTop: phDoublures.length > 0 ? '1px solid #eef1f5' : 'none', borderBottom: '1px solid #eef1f5', fontSize: 11, fontWeight: 800, letterSpacing: '.03em', textTransform: 'uppercase', color: '#94a3b8' }}>
                        <div>Compétence</div>
                        <div>Événement / lieu</div>
                        <div>Superviseur</div>
                      </div>
                      {phComps.map((c) => {
                        const val = validations.find((v) => v.competence_id === c.id);
                        const isDone = validatedIds.has(c.id);
                        return (
                          <div
                            key={c.id}
                            style={{ display: 'grid', gridTemplateColumns: '1fr 230px 188px', gap: 12, alignItems: 'center', padding: '13px 18px', borderBottom: '1px solid #f1f5f9', background: isDone ? '#f9fffe' : '#fff' }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span
                                  style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, background: isDone ? '#059669' : '#f1f5f9', color: isDone ? '#fff' : '#94a3b8', border: `1.5px solid ${isDone ? '#059669' : '#e2e8f0'}` }}
                                >
                                  {isDone ? '✓' : '–'}
                                </span>
                                <span style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a' }}>{c.name}</span>
                                {c.garde_only ? <Pill color="#6d28d9" bg="#f5f3ff" border="#ddd6fe">Garde</Pill> : null}
                              </div>
                              {c.description ? (
                                <div style={{ marginTop: 3, marginLeft: 28, fontSize: 12, color: '#94a3b8', lineHeight: 1.4 }}>{c.description}</div>
                              ) : null}
                            </div>
                            <div style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.4 }}>
                              {val ? [val.event_name, val.event_lieu].filter(Boolean).join(' · ') || '—' : '—'}
                            </div>
                            <div>
                              {isDone && val ? (
                                <>
                                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#334155' }}>{val.supervisor_name ?? '—'}</div>
                                  <div style={{ fontSize: 11.5, color: '#94a3b8' }}>déclarée par moi</div>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => openValidationModal(c.id)}
                                  style={{ cursor: 'pointer', border: '1px solid #059669', background: '#059669', color: '#fff', borderRadius: 8, padding: '6px 11px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                                >
                                  Déclarer validée
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

                {/* Final sign-off */}
                {cursusDetail.signoff_role ? (() => {
                  const allDone = allComps.length > 0 && allComps.every((c) => validatedIds.has(c.id));
                  return (
                    <div
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', background: allDone ? '#f0fdf4' : '#f8fafc', border: `1px solid ${allDone ? '#bbf7d0' : '#e2e8f0'}`, borderRadius: 14, padding: '15px 18px' }}
                    >
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: allDone ? '#15803d' : '#64748b' }}>
                          Avis favorable du {cursusDetail.signoff_role}
                        </div>
                        <div style={{ marginTop: 3, fontSize: 12.5, color: '#64748b' }}>
                          {allDone ? 'Toutes les compétences ont été validées.' : 'En attente de la validation de toutes les compétences.'}
                        </div>
                      </div>
                      <div
                        style={{ fontSize: 12, fontWeight: 700, color: allDone ? '#059669' : '#94a3b8', background: allDone ? '#d1fae5' : '#f1f5f9', border: `1px solid ${allDone ? '#a7f3d0' : '#e2e8f0'}`, borderRadius: 6, padding: '4px 11px', whiteSpace: 'nowrap' }}
                      >
                        {allDone ? 'Éligible à la validation' : 'Non éligible'}
                      </div>
                    </div>
                  );
                })() : null}
              </div>
            ) : null}
          </>
        ) : null}

      {/* ── Enroll modal ── */}
      {enrollModal ? (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}
          onClick={(e) => { if (e.target === e.currentTarget) setEnrollModal(false); }}
        >
          <div style={{ width: '100%', maxWidth: 440, background: '#fff', borderRadius: 18, boxShadow: '0 24px 60px rgba(15,23,42,.3)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 14px', borderBottom: '1px solid #eef1f5' }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a' }}>Rejoindre un cursus</div>
              <button type="button" onClick={() => setEnrollModal(false)} style={{ cursor: 'pointer', border: 'none', background: '#f1f5f9', color: '#64748b', width: 30, height: 30, borderRadius: 8, fontSize: 16 }}>✕</button>
            </div>
            <div style={{ padding: '14px 20px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {availableToEnroll.length === 0 ? (
                <p style={{ fontSize: 13, color: '#64748b' }}>Vous êtes déjà inscrit à tous les cursus disponibles.</p>
              ) : availableToEnroll.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleEnroll(c.id)}
                  style={{ cursor: 'pointer', textAlign: 'left', border: '1px solid #e2e8f0', background: '#fff', borderRadius: 12, padding: '12px 14px', fontFamily: 'inherit' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#a7f3d0'; (e.currentTarget as HTMLButtonElement).style.background = '#f6fdfa'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e2e8f0'; (e.currentTarget as HTMLButtonElement).style.background = '#fff'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '2px 8px' }}>{c.code}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{c.name}</span>
                  </div>
                  {c.category ? <div style={{ marginTop: 4, fontSize: 12, color: '#94a3b8' }}>{c.category}{c.level ? ` · Niveau ${c.level}` : ''}</div> : null}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Declare modal ── */}
      {modal ? (
        <Modal
          title={modal.kind === 'doublure' ? 'Déclarer une doublure' : 'Valider une compétence'}
          subtitle={
            modal.kind === 'validation' && modal.competenceId
              ? allComps.find((c) => c.id === modal.competenceId)?.name
              : cursusDetail?.phases.find((p) => p.id === modal.phaseId)?.label
          }
          onClose={() => setModal(null)}
          onSubmit={handleSubmit}
          submitLabel={submitting ? 'Enregistrement…' : modal.kind === 'doublure' ? 'Déclarer la doublure' : 'Valider la compétence'}
          submitDisabled={submitting || !isModalSubmittable()}
        >
          {modal.kind === 'validation' && !modal.competenceId ? (
            <div>
              <FieldLabel>Compétence</FieldLabel>
              <select
                style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 9, padding: '10px 12px', fontSize: 14, color: '#0f172a', outline: 'none', fontFamily: 'inherit' }}
                value={modal.competenceId ?? ''}
                onChange={(e) => setModal((m) => m ? { ...m, competenceId: e.target.value } : m)}
              >
                <option value="">— Choisir —</option>
                {allComps.filter((c) => !validatedIds.has(c.id)).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          ) : null}

          <EventField modal={modal} setModal={setModal as React.Dispatch<React.SetStateAction<ModalState>>} />
          <SupervisorField modal={modal} setModal={setModal as React.Dispatch<React.SetStateAction<ModalState>>} />

          {modal.kind === 'doublure' ? (
            <div>
              <FieldLabel>Message (optionnel)</FieldLabel>
              <textarea
                value={modal.message}
                onChange={(e) => setModal((m) => m ? { ...m, message: e.target.value } : m)}
                placeholder="Remarques, contexte…"
                rows={3}
                style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 9, padding: '10px 12px', fontSize: 14, color: '#0f172a', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>
          ) : null}
        </Modal>
      ) : null}
    </div>
  );
}
