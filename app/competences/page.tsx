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
  declareDoublure,
  deleteDoublure,
  declareCompetenceValidation,
  deleteCompetenceValidation,
} from '@/lib/queries/cursus';

// ── Types ─────────────────────────────────────────────────────

type CursusDetail = Cursus & { rules: CursusRule[]; phases: CursusPhase[] };
type ViewMode = 'parcours' | 'carnet';

type EventOption = { id: string; name: string; sub: string; date?: string };
type SupOption = { id: string; name: string; sub: string };

// Déclaration d'une doublure en 4 étapes : événement, doubleur, commentaires,
// compétences validées.
const STEP_LABELS = ['Événement', 'Doubleur', 'Commentaires', 'Compétences validées'];

type ModalState = {
  phaseId: string;
  step: number;
  // event
  eventMode: 'search' | 'manual' | 'chosen';
  eventQuery: string;
  eventResults: EventOption[];
  chosenEvent: EventOption | null;
  // manual event
  evName: string;
  evDate: string;
  evAntenne: string;
  // supervisor / doubleur
  supMode: 'search' | 'manual' | 'chosen';
  supQuery: string;
  supResults: SupOption[];
  chosenSup: SupOption | null;
  // manual sup
  supName: string;
  supAntenne: string;
  // comments
  supervisorComment: string;
  personalComment: string;
  // validated competences
  selectedCompetences: string[];
};

const MODAL_INIT: Omit<ModalState, 'phaseId'> = {
  step: 0,
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
  supervisorComment: '',
  personalComment: '',
  selectedCompetences: [],
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
  footer,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  onSubmit?: () => void;
  submitLabel?: string;
  submitDisabled?: boolean;
  footer?: React.ReactNode;
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
            justifyContent: footer ? 'space-between' : 'flex-end',
            gap: 10,
            padding: '14px 20px',
            borderTop: '1px solid #eef1f5',
            background: '#fafbfc',
          }}
        >
          {footer ?? (
            <>
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
            </>
          )}
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
  type = 'text',
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  type?: string;
  ariaLabel?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      type={type}
      aria-label={ariaLabel}
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

// Chronological order (oldest first): by event date, undated last, then creation.
function compareDoublureChrono(a: Doublure, b: Doublure): number {
  const da = a.event_date ?? '';
  const db = b.event_date ?? '';
  if (da && db) return da < db ? -1 : da > db ? 1 : 0;
  if (da) return -1;
  if (db) return 1;
  return (a.created_at ?? '') < (b.created_at ?? '') ? -1 : 1;
}

// Discreet round "+" button to declare a doublure.
function DeclareDoublureButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Déclarer une doublure"
      title="Déclarer une doublure"
      style={{ cursor: 'pointer', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', borderRadius: '50%', fontSize: 17, fontWeight: 500, fontFamily: 'inherit', lineHeight: 1 }}
    >
      +
    </button>
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
            <ModalInput value={modal.evDate} onChange={(v) => setModal((m) => ({ ...m, evDate: v }))} type="date" ariaLabel="Date de l'événement" style={{ flex: '1' }} />
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
  // Lecture seule : consultation du carnet d'un autre bénévole via
  // ?profile=<id>&cursus=<id> (depuis le tableau de bord compétences).
  const [readOnly, setReadOnly] = useState(false);
  const [viewingName, setViewingName] = useState<string | null>(null);
  const [allCursus, setAllCursus] = useState<Cursus[]>([]);
  const [volunteerCursus, setVolunteerCursus] = useState<VolunteerCursus[]>([]);
  const [selectedVCId, setSelectedVCId] = useState<string | null>(null);
  const [cursusDetail, setCursusDetail] = useState<CursusDetail | null>(null);
  const [doublures, setDoublures] = useState<Doublure[]>([]);
  const [validations, setValidations] = useState<CompetenceValidation[]>([]);
  const [view, setView] = useState<ViewMode>('parcours');
  const [expandedDoublures, setExpandedDoublures] = useState<Set<string>>(new Set());
  const [expandedCompetences, setExpandedCompetences] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // modals
  const [modal, setModal] = useState<ModalState | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ── Load ──────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const viewerId = session.user.id;

      // Cible : un autre bénévole si ?profile= est fourni et diffère du viewer.
      const params = new URLSearchParams(window.location.search);
      const targetParam = params.get('profile');
      const cursusParam = params.get('cursus');
      const isOther = !!targetParam && targetParam !== viewerId;
      const pid = isOther ? targetParam! : viewerId;
      setProfileId(pid);
      setReadOnly(isOther);

      try {
        const [cursusAll, vcAll] = await Promise.all([getAllCursus(), getVolunteerCursus(pid)]);
        setAllCursus(cursusAll);
        setVolunteerCursus(vcAll);
        // Présélection du cursus demandé, sinon le premier disponible.
        const target = cursusParam ? vcAll.find((v) => v.cursus_id === cursusParam) : null;
        if (target) setSelectedVCId(target.id);
        else if (vcAll.length > 0) setSelectedVCId(vcAll[0].id);

        if (isOther) {
          const { data: targetProfile } = await supabase
            .from('profiles')
            .select('full_name,email')
            .eq('id', pid)
            .single();
          setViewingName(targetProfile?.full_name ?? targetProfile?.email ?? 'ce bénévole');
        }
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

  // Cursus en cours en premier (plein), cursus terminés ensuite (plus légers).
  const inProgressCursus = useMemo(() => volunteerCursus.filter((vc) => !vc.completed_at), [volunteerCursus]);
  const completedCursus = useMemo(() => volunteerCursus.filter((vc) => vc.completed_at), [volunteerCursus]);

  const currentVC = volunteerCursus.find((v) => v.id === selectedVCId);
  const currentCursusData = currentVC ? (allCursus.find((c) => c.id === currentVC.cursus_id) ?? null) : null;

  function scrollToPhase(phaseId: string) {
    document.getElementById(`phase-anchor-${phaseId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  async function handleConfirm() {
    if (readOnly) return;
    if (!modal || !selectedVCId || !profileId) return;
    setError(null);
    setSubmitting(true);
    // Track what we persisted so we can roll back if a later insert fails,
    // keeping the doublure + its validations atomic from the user's point of view.
    let createdDoublure: Doublure | null = null;
    const createdVals: CompetenceValidation[] = [];
    try {
      const ev = getEventData(modal);
      const sup = getSupData(modal);
      // `competence_validations` has no `is_external` column (it lives on `doublures`),
      // so omit it from the validation payload.
      const { is_external: _omitExternal, ...evForValidation } = ev;
      createdDoublure = await declareDoublure({
        volunteer_cursus_id: selectedVCId,
        phase_id: modal.phaseId,
        ...ev,
        ...sup,
        message: modal.personalComment || null,
        supervisor_comment: modal.supervisorComment || null,
        is_pending: false,
        declared_by: profileId,
      });
      for (const compId of modal.selectedCompetences) {
        const val = await declareCompetenceValidation({
          volunteer_cursus_id: selectedVCId,
          competence_id: compId,
          doublure_id: createdDoublure.id,
          ...evForValidation,
          ...sup,
          declared_by: profileId,
        });
        createdVals.push(val);
      }
      // Everything persisted — commit to local state in one go.
      setDoublures((prev) => [createdDoublure as Doublure, ...prev]);
      if (createdVals.length > 0) setValidations((prev) => [...prev, ...createdVals]);
      setModal(null);
    } catch (e) {
      // Roll back partial inserts so a retry doesn't leave duplicate/orphan rows.
      for (const val of createdVals) {
        try { await deleteCompetenceValidation(val.id); } catch { /* best-effort rollback */ }
      }
      if (createdDoublure) {
        try { await deleteDoublure(createdDoublure.id); } catch { /* best-effort rollback */ }
      }
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function openDoublureModal(phaseId: string) {
    if (readOnly) return;
    setError(null);
    setModal({ ...MODAL_INIT, phaseId });
  }

  function toggleDoublureExpanded(id: string) {
    setExpandedDoublures((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleCompetenceExpanded(id: string) {
    setExpandedCompetences((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Compétences proposées à la validation pour la phase de la doublure :
  // celles non encore validées.
  function selectableComps(phaseId: string): CursusCompetence[] {
    const phase = cursusDetail?.phases.find((p) => p.id === phaseId);
    return ((phase?.competences ?? []) as CursusCompetence[]).filter((c) => !validatedIds.has(c.id));
  }

  function toggleSelectedComp(compId: string) {
    setModal((m) => {
      if (!m) return m;
      const has = m.selectedCompetences.includes(compId);
      return {
        ...m,
        selectedCompetences: has
          ? m.selectedCompetences.filter((id) => id !== compId)
          : [...m.selectedCompetences, compId],
      };
    });
  }

  function canProceed(m: ModalState): boolean {
    if (m.step === 0) {
      return (m.eventMode === 'chosen' && !!m.chosenEvent) || m.evName.trim().length > 0;
    }
    if (m.step === 1) {
      return (m.supMode === 'chosen' && !!m.chosenSup) || m.supName.trim().length > 0;
    }
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

        {readOnly ? (
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#1d4ed8', fontWeight: 600 }}>
            Vous consultez le carnet de doublure de {viewingName ?? 'ce bénévole'} en lecture seule.
          </div>
        ) : null}

        {/* Cursus tab selector : en cours en plein, terminés en plus léger */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {inProgressCursus.map((vc) => {
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
              </button>
            );
          })}
          {completedCursus.length > 0 ? (
            <>
              {inProgressCursus.length > 0 ? (
                <span style={{ width: 1, height: 18, background: '#e2e8f0', margin: '0 2px' }} />
              ) : null}
              {completedCursus.map((vc) => {
                const c = allCursus.find((x) => x.id === vc.cursus_id);
                return (
                  <button
                    key={vc.id}
                    type="button"
                    onClick={() => setSelectedVCId(vc.id)}
                    style={{
                      cursor: 'pointer',
                      border: selectedVCId === vc.id ? 'none' : '1px solid #eef1f5',
                      borderRadius: 99,
                      padding: '5px 13px',
                      fontSize: 12,
                      fontWeight: 600,
                      fontFamily: 'inherit',
                      background: selectedVCId === vc.id ? '#475569' : 'transparent',
                      color: selectedVCId === vc.id ? '#fff' : '#94a3b8',
                      opacity: selectedVCId === vc.id ? 1 : 0.75,
                    }}
                  >
                    {c?.code ?? vc.cursus_id} ✓
                  </button>
                );
              })}
            </>
          ) : null}
        </div>

        {volunteerCursus.length === 0 ? (
          <div style={{ textAlign: 'center', background: '#fff', border: '1.5px dashed #e2e8f0', borderRadius: 18, padding: '60px 24px' }}>
            <p style={{ color: '#94a3b8', fontSize: 15 }}>
              {readOnly
                ? `${viewingName ?? 'Ce bénévole'} n'est inscrit dans aucun cursus de doublure.`
                : "Vous n'êtes inscrit dans aucun cursus de doublure. Un administrateur peut vous y inscrire."}
            </p>
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
                  display: 'flex',
                  gap: 10,
                  marginBottom: 22,
                  overflowX: 'auto',
                  paddingBottom: 4,
                }}
              >
                {cursusDetail.phases.map((ph, i) => {
                  const phDoublures = doublures.filter((d) => d.phase_id === ph.id);
                  const phComps = ph.competences ?? [];
                  const done = phComps.filter((c) => validatedIds.has(c.id)).length;
                  const isComplete = done === phComps.length && phComps.length > 0 && phDoublures.length >= ph.min_doublures && phDoublures.filter((d) => d.is_external).length >= ph.min_externe;
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
                      role="button"
                      tabIndex={0}
                      onClick={() => scrollToPhase(ph.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); scrollToPhase(ph.id); } }}
                      title={`Aller à la phase « ${ph.label} »`}
                      style={{ flex: '0 0 auto', width: 184, display: 'flex', flexDirection: 'column', background: '#fff', border: `1px solid ${borderColor}`, borderRadius: 13, padding: '13px 14px', cursor: 'pointer' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <span
                          style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, background: badgeBg, color: badgeColor, border: `1.5px solid ${borderColor}` }}
                        >
                          {isComplete ? '✓' : i + 1}
                        </span>
                        <span style={{ fontSize: 13.5, fontWeight: 700, color: titleColor }}>
                          {ph.label}
                        </span>
                      </div>
                      {ph.sub ? (
                        <div style={{ marginTop: 8, fontSize: 11.5, color: '#94a3b8', lineHeight: 1.4 }}>{ph.sub}</div>
                      ) : null}
                      <div style={{ marginTop: 'auto', paddingTop: 9 }}>
                        <span
                          style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '2px 8px', background: pillBg, color: pillColor }}
                        >
                          {done}/{phComps.length} compétences
                        </span>
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
                  const phDoublures = doublures.filter((d) => d.phase_id === phase.id).sort(compareDoublureChrono);
                  const phComps = (phase.competences ?? []) as CursusCompetence[];
                  const doneComps = phComps.filter((c) => validatedIds.has(c.id));
                  const todoComps = phComps.filter((c) => !validatedIds.has(c.id));
                  const isComplete = doneComps.length === phComps.length && phComps.length > 0 && phDoublures.length >= phase.min_doublures && phDoublures.filter((d) => d.is_external).length >= phase.min_externe;
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
                    <div key={phase.id} id={`phase-anchor-${phase.id}`} style={{ position: 'relative', paddingBottom: 18, scrollMarginTop: 80 }}>
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
                              {phase.min_externe > 0 ? ` (dont ${phase.min_externe} externe${phase.min_externe > 1 ? 's' : ''})` : ''}
                            </div>
                          ) : null}
                        </div>

                        {/* Doublures & événements section */}
                        <div style={{ padding: '15px 18px 6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 11 }}>
                            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: '#94a3b8' }}>
                              Doublures &amp; événements
                            </span>
                            {!readOnly ? <DeclareDoublureButton onClick={() => openDoublureModal(phase.id)} /> : null}
                          </div>

                          {/* Events with their competences */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginBottom: 6 }}>
                            {phDoublures.map((d) => {
                              const dVals = validations.filter(
                                (v) => v.doublure_id === d.id || (d.event_name && v.event_name === d.event_name)
                              );
                              const expanded = expandedDoublures.has(d.id);
                              return (
                                <div key={d.id} style={{ border: '1px solid #e7e9ee', borderRadius: 13, background: '#fff', overflow: 'hidden' }}>
                                  {/* event header — click anywhere to expand/collapse */}
                                  <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => toggleDoublureExpanded(d.id)}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleDoublureExpanded(d.id); } }}
                                    aria-expanded={expanded}
                                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 11, padding: '12px 14px', background: '#f8fafc', borderBottom: expanded ? '1px solid #eef1f5' : 'none' }}
                                  >
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{d.event_name ?? 'Doublure'}</span>
                                        {expanded ? (
                                          <>
                                            {d.is_external ? <Pill color="#6d28d9" bg="#f5f3ff" border="#ddd6fe">Externe</Pill> : null}
                                            {d.mission_id ? <Pill color="#1d4ed8" bg="#eff6ff" border="#bfdbfe">Événement timeline</Pill> : null}
                                            {d.is_pending ? <Pill color="#b45309" bg="#fffbeb" border="#fde68a">En attente</Pill> : null}
                                            <span style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>{fmt(d.event_date)}</span>
                                          </>
                                        ) : (
                                          dVals.length > 0 ? (
                                            <span
                                              aria-label={`${dVals.length} compétence${dVals.length > 1 ? 's' : ''} signée${dVals.length > 1 ? 's' : ''} sur cette doublure`}
                                              style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 800, color: '#fff', background: '#059669', borderRadius: 999, padding: '2px 9px', fontVariantNumeric: 'tabular-nums' }}
                                            >
                                              +{dVals.length}
                                            </span>
                                          ) : null
                                        )}
                                      </div>
                                      {expanded ? (
                                        <>
                                          {d.event_lieu ? (
                                            <div style={{ marginTop: 3, fontSize: 12, color: '#94a3b8' }}>{d.event_lieu}</div>
                                          ) : null}
                                          {d.supervisor_name ? (
                                            <div style={{ marginTop: 5, fontSize: 12, color: '#475569' }}>
                                              Encadré par <strong>{d.supervisor_name}</strong>
                                              {d.supervisor_antenne ? ` · ${d.supervisor_antenne}` : ''}
                                            </div>
                                          ) : null}
                                          {d.supervisor_comment ? (
                                            <div style={{ marginTop: 6, fontSize: 12, color: '#475569', fontStyle: 'italic', lineHeight: 1.45 }}>
                                              « {d.supervisor_comment} » <span style={{ fontStyle: 'normal', color: '#94a3b8' }}>— doubleur</span>
                                            </div>
                                          ) : null}
                                          {d.message ? (
                                            <div style={{ marginTop: 4, fontSize: 12, color: '#94a3b8', lineHeight: 1.45 }}>
                                              Note perso : {d.message}
                                            </div>
                                          ) : null}
                                        </>
                                      ) : null}
                                    </div>
                                  </div>
                                  {/* Competences validated at this event */}
                                  {expanded && dVals.map((val) => {
                                    const comp = allComps.find((c) => c.id === val.competence_id);
                                    if (!comp) return null;
                                    const compExpanded = expandedCompetences.has(val.id);
                                    return (
                                      <div
                                        key={val.id}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => toggleCompetenceExpanded(val.id)}
                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCompetenceExpanded(val.id); } }}
                                        aria-expanded={compExpanded}
                                        style={{ cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 11, padding: '11px 16px 11px 40px', borderTop: '1px solid #f4f6f9', borderLeft: '3px solid #d1fae5' }}
                                      >
                                        <span style={{ flexShrink: 0, marginTop: 1, width: 22, height: 22, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, background: '#059669', color: '#fff', border: '1.5px solid #059669' }}>✓</span>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a' }}>{comp.name}</span>
                                            {compExpanded && comp.garde_only ? <Pill color="#6d28d9" bg="#f5f3ff" border="#ddd6fe">Garde uniquement</Pill> : null}
                                          </div>
                                          {compExpanded && comp.description ? (
                                            <div style={{ marginTop: 2, fontSize: 12, color: '#64748b', lineHeight: 1.45 }}>{comp.description}</div>
                                          ) : null}
                                        </div>
                                      </div>
                                    );
                                  })}
                                  {expanded && dVals.length === 0 ? (
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

                        {/* Compétences à valider (lecture seule — validées via une doublure) */}
                        {todoComps.length > 0 ? (
                          <div style={{ padding: '14px 18px 18px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 11 }}>
                              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: '#94a3b8' }}>
                                Compétences à valider
                              </div>
                              <span style={{ fontSize: 11.5, color: '#94a3b8' }}>À cocher lors d&apos;une doublure</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {todoComps.map((c) => {
                                const compExpanded = expandedCompetences.has(c.id);
                                return (
                                  <div
                                    key={c.id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => toggleCompetenceExpanded(c.id)}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCompetenceExpanded(c.id); } }}
                                    aria-expanded={compExpanded}
                                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 12, border: '1px solid #e7e9ee', background: '#fff', borderRadius: 12, padding: '12px 14px' }}
                                  >
                                    <span style={{ flexShrink: 0, marginTop: 1, width: 24, height: 24, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, background: '#f1f5f9', color: '#94a3b8', border: '1.5px solid #e2e8f0' }}>–</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{c.name}</span>
                                        {compExpanded && c.garde_only ? <Pill color="#6d28d9" bg="#f5f3ff" border="#ddd6fe">Garde uniquement</Pill> : null}
                                      </div>
                                      {compExpanded && c.description ? (
                                        <div style={{ marginTop: 3, fontSize: 12.5, color: '#64748b', lineHeight: 1.45 }}>{c.description}</div>
                                      ) : null}
                                    </div>
                                  </div>
                                );
                              })}
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
                  const phDoublures = doublures.filter((d) => d.phase_id === phase.id).sort(compareDoublureChrono);
                  const phComps = (phase.competences ?? []) as CursusCompetence[];
                  const doneComps = phComps.filter((c) => validatedIds.has(c.id));
                  const isComplete = doneComps.length === phComps.length && phComps.length > 0;
                  const pillBg = isComplete ? '#d1fae5' : '#f1f5f9';
                  const pillColor = isComplete ? '#059669' : '#94a3b8';

                  return (
                    <div
                      key={phase.id}
                      id={`phase-anchor-${phase.id}`}
                      style={{ background: '#fff', border: '1px solid #e7e9ee', borderRadius: 16, boxShadow: '0 1px 3px rgba(15,23,42,.04)', marginBottom: 16, overflow: 'hidden', scrollMarginTop: 80 }}
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
                        {!readOnly ? <DeclareDoublureButton onClick={() => openDoublureModal(phase.id)} /> : null}
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
                                <span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>À valider en doublure</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </>
        ) : null}

      {/* ── Declare doublure wizard ── */}
      {modal ? (() => {
        const setModalDoublure = setModal as React.Dispatch<React.SetStateAction<ModalState>>;
        const isLast = modal.step === STEP_LABELS.length - 1;
        const comps = selectableComps(modal.phaseId);
        return (
          <Modal
            title="Déclarer une doublure"
            subtitle={`Étape ${modal.step + 1}/${STEP_LABELS.length} · ${STEP_LABELS[modal.step]}`}
            onClose={() => setModal(null)}
            footer={
              <>
                <button
                  type="button"
                  onClick={() => modal.step === 0 ? setModal(null) : setModal((m) => m ? { ...m, step: m.step - 1 } : m)}
                  style={{ cursor: 'pointer', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}
                >
                  {modal.step === 0 ? 'Annuler' : '‹ Précédent'}
                </button>
                {isLast ? (
                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={submitting}
                    style={{ cursor: submitting ? 'not-allowed' : 'pointer', border: 'none', background: '#059669', color: '#fff', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', opacity: submitting ? 0.5 : 1 }}
                  >
                    {submitting ? 'Enregistrement…' : 'Confirmer la doublure'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setModal((m) => m && canProceed(m) ? { ...m, step: m.step + 1 } : m)}
                    disabled={!canProceed(modal)}
                    style={{ cursor: !canProceed(modal) ? 'not-allowed' : 'pointer', border: 'none', background: '#0f172a', color: '#fff', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', opacity: !canProceed(modal) ? 0.5 : 1 }}
                  >
                    Suivant ›
                  </button>
                )}
              </>
            }
          >
            {/* Step progress */}
            <div style={{ display: 'flex', gap: 5 }}>
              {STEP_LABELS.map((_, i) => (
                <div
                  key={i}
                  style={{ flex: 1, height: 5, borderRadius: 4, background: i <= modal.step ? '#059669' : '#e2e8f0' }}
                />
              ))}
            </div>

            {error ? (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 13px', fontSize: 12.5, color: '#dc2626' }}>
                {error}
              </div>
            ) : null}

            {/* Page 1 — Événement */}
            {modal.step === 0 ? (
              <EventField modal={modal} setModal={setModalDoublure} />
            ) : null}

            {/* Page 2 — Doubleur */}
            {modal.step === 1 ? (
              <SupervisorField modal={modal} setModal={setModalDoublure} />
            ) : null}

            {/* Page 3 — Commentaires */}
            {modal.step === 2 ? (
              <>
                <div>
                  <FieldLabel>Commentaire du doubleur <span style={{ color: '#94a3b8', fontWeight: 600 }}>(optionnel)</span></FieldLabel>
                  <textarea
                    value={modal.supervisorComment}
                    onChange={(e) => setModal((m) => m ? { ...m, supervisorComment: e.target.value } : m)}
                    placeholder="Retour du doubleur sur la doublure…"
                    rows={3}
                    style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 9, padding: '10px 12px', fontSize: 14, color: '#0f172a', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                  />
                </div>
                <div>
                  <FieldLabel>Commentaire personnel <span style={{ color: '#94a3b8', fontWeight: 600 }}>(optionnel)</span></FieldLabel>
                  <textarea
                    value={modal.personalComment}
                    onChange={(e) => setModal((m) => m ? { ...m, personalComment: e.target.value } : m)}
                    placeholder="Vos remarques, ressenti, points à retravailler…"
                    rows={3}
                    style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 9, padding: '10px 12px', fontSize: 14, color: '#0f172a', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                  />
                </div>
              </>
            ) : null}

            {/* Page 4 — Compétences validées */}
            {modal.step === 3 ? (
              <div>
                <FieldLabel>Compétences validées lors de cette doublure <span style={{ color: '#94a3b8', fontWeight: 600 }}>(optionnel)</span></FieldLabel>
                {comps.length === 0 ? (
                  <p style={{ fontSize: 13, color: '#94a3b8', margin: '4px 0 0' }}>
                    Toutes les compétences de cette phase sont déjà validées.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {comps.map((c) => {
                      const checked = modal.selectedCompetences.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => toggleSelectedComp(c.id)}
                          style={{ cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 11, border: `1.5px solid ${checked ? '#a7f3d0' : '#e7e9ee'}`, background: checked ? '#f6fdfa' : '#fff', borderRadius: 11, padding: '11px 13px', fontFamily: 'inherit' }}
                        >
                          <span style={{ flexShrink: 0, marginTop: 1, width: 22, height: 22, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, background: checked ? '#059669' : '#f1f5f9', color: checked ? '#fff' : '#cbd5e1', border: `1.5px solid ${checked ? '#059669' : '#e2e8f0'}` }}>
                            {checked ? '✓' : ''}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a' }}>{c.name}</span>
                              {c.garde_only ? <Pill color="#6d28d9" bg="#f5f3ff" border="#ddd6fe">Garde uniquement</Pill> : null}
                            </div>
                            {c.description ? (
                              <div style={{ marginTop: 2, fontSize: 12, color: '#64748b', lineHeight: 1.45 }}>{c.description}</div>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}
          </Modal>
        );
      })() : null}
    </div>
  );
}
