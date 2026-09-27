'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import type {
  Cursus,
  CursusPhase,
  CursusCompetence,
  CursusRule,
  VolunteerCursus,
  Doublure,
  DoublureNote,
  CompetenceValidation,
  SupervisedDoublure,
} from '@/lib/types';
import {
  getAllCursus,
  getCursusWithDetails,
  getVolunteerCursus,
  getDoubluresForVolunteerCursus,
  getValidationsForVolunteerCursus,
  getDoublureNotes,
  getDoublure,
  getPhaseCompetences,
  listSupervisedDoublures,
  declareDoublure,
  updateDoublure,
  deleteDoublure,
  notifyDoublureSupervisor,
  saveDoublureNote,
  declareCompetenceValidation,
  updateCompetenceValidation,
  deleteCompetenceValidation,
} from '@/lib/queries/cursus';
import { usePermissions } from '@/lib/permissions/permissions-context';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { MarkdownEditor } from '@/components/ui/markdown-editor';
import { MarkdownText } from '@/components/ui/markdown-text';

// ── Types ─────────────────────────────────────────────────────

type CursusDetail = Cursus & { rules: CursusRule[]; phases: CursusPhase[] };
type ViewMode = 'parcours' | 'carnet';

type EventOption = { id: string; name: string; sub: string; date?: string };
type SupOption = { id: string; name: string; sub: string };

// Déclaration d'une doublure en 4 étapes : événement, doubleur, commentaires,
// compétences validées.
const STEP_LABELS = ['Événement', 'Doubleur', 'Commentaires', 'Compétences validées'];

// Rôle du viewer vis-à-vis d'une doublure : détermine les champs éditables
// et les notes visibles (cf. migration doublure_notes).
type DoublureRole = 'trainee' | 'supervisor' | 'manager';

type ModalState = {
  phaseId: string;
  editingId: string | null;
  role: DoublureRole;
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
  supMode: 'search' | 'manual' | 'chosen' | 'none';
  supQuery: string;
  supResults: SupOption[];
  chosenSup: SupOption | null;
  // manual sup
  supName: string;
  supAntenne: string;
  // comments
  supervisorComment: string;
  personalComment: string;
  supervisorNote: string;
  // validated competences
  selectedCompetences: string[];
};

const MODAL_INIT: Omit<ModalState, 'phaseId' | 'role'> = {
  editingId: null,
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
  supervisorNote: '',
  selectedCompetences: [],
};

// ── Helpers ────────────────────────────────────────────────────

function fmt(d: string | null | undefined) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Validations rattachées à une doublure. Les anciennes validations sans
// doublure_id sont rattachées par nom d'événement.
function linkedValidationsOf(d: Doublure, validations: CompetenceValidation[]): CompetenceValidation[] {
  return validations.filter(
    (v) => v.doublure_id === d.id || (!v.doublure_id && !!d.event_name && v.event_name === d.event_name)
  );
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
            background: i < validated ? '#059669' : '#E6EAF2',
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
        background: 'rgba(12,19,38,.55)',
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
          boxShadow: '0 24px 60px rgba(12,19,38,.3)',
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
            borderBottom: '1px solid #EEF1F6',
          }}
        >
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#16203A' }}>{title}</div>
            {subtitle ? (
              <div style={{ marginTop: 3, fontSize: 12.5, color: '#5B6478' }}>{subtitle}</div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              flexShrink: 0,
              cursor: 'pointer',
              border: 'none',
              background: '#F7F9FC',
              color: '#5B6478',
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
            borderTop: '1px solid #EEF1F6',
            background: '#F7F9FC',
          }}
        >
          {footer ?? (
            <>
              <button
                type="button"
                onClick={onClose}
                style={{
                  cursor: 'pointer',
                  border: '1px solid #E6EAF2',
                  background: '#fff',
                  color: '#5B6478',
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
        border: '1px solid #A6AEBE',
        borderRadius: 9,
        padding: '10px 12px',
        fontSize: 14,
        color: '#16203A',
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

// Discreet round "+" button to declare an event.
function DeclareDoublureButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Déclarer un événement"
      title="Déclarer un événement"
      style={{ cursor: 'pointer', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, border: '1px solid #E6EAF2', background: '#fff', color: '#5B6478', borderRadius: '50%', fontSize: 17, fontWeight: 500, fontFamily: 'inherit', lineHeight: 1 }}
    >
      +
    </button>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12.5, fontWeight: 700, color: '#5B6478', marginBottom: 7 }}>
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
            border: '1.5px solid #BDE7CE',
            background: '#E9F7EF',
            borderRadius: 10,
            padding: '10px 12px',
          }}
        >
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#16203A' }}>{modal.chosenEvent.name}</div>
            <div style={{ fontSize: 12, color: '#5B6478' }}>{modal.chosenEvent.sub}</div>
          </div>
          <button
            type="button"
            onClick={() => setModal((m) => ({ ...m, eventMode: 'search', chosenEvent: null }))}
            style={{ cursor: 'pointer', border: '1px solid #A6AEBE', background: '#fff', color: '#5B6478', borderRadius: 8, padding: '6px 11px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}
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
          style={{ marginTop: 8, cursor: 'pointer', border: 'none', background: 'transparent', color: '#00378F', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', padding: 0 }}
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
              style={{ cursor: 'pointer', textAlign: 'left', border: '1px solid #E6EAF2', background: '#fff', borderRadius: 9, padding: '9px 11px', fontFamily: 'inherit' }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: '#16203A' }}>{e.name}</div>
              <div style={{ fontSize: 11.5, color: '#8A93A6' }}>{e.sub}</div>
            </button>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setModal((m) => ({ ...m, eventMode: 'manual' }))}
        style={{ marginTop: 8, cursor: 'pointer', border: 'none', background: 'transparent', color: '#00378F', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', padding: 0 }}
      >
        + Événement hors timeline
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
            border: '1.5px solid #BDE7CE',
            background: '#E9F7EF',
            borderRadius: 10,
            padding: '10px 12px',
          }}
        >
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#16203A' }}>{modal.chosenSup.name}</div>
            <div style={{ fontSize: 12, color: '#5B6478' }}>{modal.chosenSup.sub}</div>
          </div>
          <button
            type="button"
            onClick={() => setModal((m) => ({ ...m, supMode: 'search', chosenSup: null }))}
            style={{ cursor: 'pointer', border: '1px solid #A6AEBE', background: '#fff', color: '#5B6478', borderRadius: 8, padding: '6px 11px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}
          >
            Changer
          </button>
        </div>
      </div>
    );
  }

  if (modal.supMode === 'none') {
    return (
      <div>
        <FieldLabel>Encadré par</FieldLabel>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            border: '1.5px solid #E6EAF2',
            background: '#F7F9FC',
            borderRadius: 10,
            padding: '10px 12px',
          }}
        >
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#5B6478' }}>Personne · auto-événement</div>
          <button
            type="button"
            onClick={() => setModal((m) => ({ ...m, supMode: 'search' }))}
            style={{ cursor: 'pointer', border: '1px solid #A6AEBE', background: '#fff', color: '#5B6478', borderRadius: 8, padding: '6px 11px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}
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
          style={{ marginTop: 8, cursor: 'pointer', border: 'none', background: 'transparent', color: '#00378F', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', padding: 0 }}
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
              style={{ cursor: 'pointer', textAlign: 'left', border: '1px solid #E6EAF2', background: '#fff', borderRadius: 9, padding: '9px 11px', fontFamily: 'inherit' }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: '#16203A' }}>{s.name}</div>
              <div style={{ fontSize: 11.5, color: '#8A93A6' }}>{s.sub}</div>
            </button>
          ))}
        </div>
      ) : null}
      <div style={{ marginTop: 8, display: 'flex', gap: 14 }}>
        <button
          type="button"
          onClick={() => setModal((m) => ({ ...m, supMode: 'manual' }))}
          style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: '#00378F', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', padding: 0 }}
        >
          + Saisir un superviseur hors liste
        </button>
        <button
          type="button"
          onClick={() => setModal((m) => ({ ...m, supMode: 'none', chosenSup: null, supName: '', supAntenne: '' }))}
          style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: '#5B6478', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', padding: 0 }}
        >
          Personne · auto-événement
        </button>
      </div>
    </div>
  );
}

// ── Doublures encadrées ───────────────────────────────────────

function SupervisedDoubluresCard({ items, onChanged }: { items: SupervisedDoublure[]; onChanged: () => void }) {
  const [showDone, setShowDone] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const toComment = items.filter((d) => !d.has_pedago_comment);
  const done = items.filter((d) => d.has_pedago_comment);

  function row(d: SupervisedDoublure) {
    return (
      <button
        key={d.doublure_id}
        type="button"
        onClick={() => setOpenId(d.doublure_id)}
        style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 12, padding: '11px 18px', border: 'none', borderBottom: '1px solid #EEF1F6', background: '#fff', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
      >
        <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 800, color: '#5B6478', background: '#F4F6FA', border: '1px solid #E5E9F0', borderRadius: 7, padding: '3px 8px' }}>
          {d.cursus_code}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#16203A' }}>{d.trainee_name ?? '—'}</div>
          <div style={{ fontSize: 12, color: '#8A93A6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {[d.phase_label, d.event_name].filter(Boolean).join(' · ')}
          </div>
        </div>
        {d.has_pedago_comment ? (
          <Pill color="#12805A" bg="#E9F7EF" border="#BDE7CE">Commentée</Pill>
        ) : (
          <Pill color="#b45309" bg="#FEF3E2" border="#F6DFB0">À commenter</Pill>
        )}
        <span style={{ flexShrink: 0, fontSize: 12, color: '#8A93A6', fontVariantNumeric: 'tabular-nums' }}>{fmt(d.event_date)}</span>
      </button>
    );
  }

  const opened = items.find((d) => d.doublure_id === openId) ?? null;

  return (
    <div style={{ background: '#fff', border: '1px solid #E6EAF2', borderRadius: 16, boxShadow: '0 1px 3px rgba(20,32,58,.06)', marginBottom: 20, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '14px 18px', borderBottom: '1px solid #EEF1F6' }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: '#16203A' }}>Événements que j&apos;encadre</span>
        {toComment.length > 0 ? (
          <Pill color="#b45309" bg="#FEF3E2" border="#F6DFB0">
            {toComment.length} à commenter
          </Pill>
        ) : null}
      </div>
      {toComment.map(row)}
      {toComment.length === 0 ? (
        <div style={{ padding: '12px 18px', fontSize: 12.5, color: '#8A93A6', borderBottom: done.length > 0 ? '1px solid #EEF1F6' : 'none' }}>
          Tous vos événements sont commentés.
        </div>
      ) : null}
      {showDone ? done.map(row) : null}
      {done.length > 0 ? (
        <button
          type="button"
          onClick={() => setShowDone((v) => !v)}
          style={{ display: 'block', width: '100%', cursor: 'pointer', border: 'none', background: '#F7F9FC', color: '#00378F', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', padding: '10px 18px' }}
        >
          {showDone ? 'Masquer les événements commentés' : `Voir les ${done.length} événement${done.length > 1 ? 's' : ''} déjà commenté${done.length > 1 ? 's' : ''}`}
        </button>
      ) : null}
      {opened ? (
        <SupervisorDoublureModal
          item={opened}
          onClose={() => setOpenId(null)}
          onSaved={() => { setOpenId(null); onChanged(); }}
        />
      ) : null}
    </div>
  );
}

// Formulaire du doubleur : commentaire pédagogique, note privée pour l'admin
// formation et compétences validées lors de la doublure — sans accès au
// carnet complet du stagiaire.
function SupervisorDoublureModal({
  item,
  onClose,
  onSaved,
}: {
  item: SupervisedDoublure;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [doublure, setDoublure] = useState<Doublure | null>(null);
  const [comps, setComps] = useState<CursusCompetence[]>([]);
  const [validations, setValidations] = useState<CompetenceValidation[]>([]);
  const [pedago, setPedago] = useState('');
  const [privateNote, setPrivateNote] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const d = await getDoublure(item.doublure_id);
        const [phaseComps, vals, nts] = await Promise.all([
          getPhaseCompetences(d.phase_id),
          getValidationsForVolunteerCursus(d.volunteer_cursus_id),
          getDoublureNotes([d.id]),
        ]);
        if (cancelled) return;
        setDoublure(d);
        setComps(phaseComps);
        setValidations(vals);
        setPedago(d.supervisor_comment ?? '');
        setPrivateNote(nts.find((n) => n.kind === 'doubleur')?.body ?? '');
        setSelected(linkedValidationsOf(d, vals).map((v) => v.competence_id));
      } catch (e) {
        if (!cancelled) setLoadError((e as Error).message);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [item.doublure_id]);

  const linked = doublure ? linkedValidationsOf(doublure, validations) : [];
  const linkedIds = new Set(linked.map((v) => v.competence_id));
  // Compétences déjà validées lors d'une autre doublure : affichées mais figées.
  const validatedElsewhere = new Set(validations.map((v) => v.competence_id).filter((id) => !linkedIds.has(id)));

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function save() {
    if (!doublure) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Session expirée, veuillez vous reconnecter.');
      await updateDoublure(doublure.id, { supervisor_comment: pedago.trim() ? pedago : null });
      await saveDoublureNote(doublure.id, 'doubleur', privateNote);
      const copy = {
        doublure_id: doublure.id,
        mission_id: doublure.mission_id,
        event_name: doublure.event_name,
        event_date: doublure.event_date,
        event_lieu: doublure.event_lieu,
        supervisor_id: doublure.supervisor_id,
        supervisor_name: doublure.supervisor_name,
        supervisor_antenne: doublure.supervisor_antenne,
      };
      for (const val of linked) {
        if (!selected.includes(val.competence_id)) await deleteCompetenceValidation(val.id);
      }
      for (const compId of selected) {
        if (linkedIds.has(compId)) continue;
        await declareCompetenceValidation({
          volunteer_cursus_id: doublure.volunteer_cursus_id,
          competence_id: compId,
          ...copy,
          declared_by: user.id,
        });
      }
      onSaved();
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const hint = (text: string) => <span style={{ color: '#8A93A6', fontWeight: 600 }}>{text}</span>;

  return (
    <Modal
      title={item.trainee_name ?? 'Événement'}
      subtitle={[item.cursus_code, item.phase_label, item.event_name, fmt(item.event_date)].filter(Boolean).join(' · ')}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            style={{ cursor: 'pointer', border: '1px solid #E6EAF2', background: '#fff', color: '#5B6478', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !doublure}
            style={{ cursor: saving || !doublure ? 'not-allowed' : 'pointer', border: 'none', background: '#059669', color: '#fff', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', opacity: saving || !doublure ? 0.5 : 1 }}
          >
            {saving ? 'Enregistrement…' : 'Valider'}
          </button>
        </>
      }
    >
      {loadError ? (
        <div style={{ background: '#FDEAEA', border: '1px solid #F3C6C6', borderRadius: 10, padding: '10px 13px', fontSize: 12.5, color: '#D14343' }}>{loadError}</div>
      ) : !doublure ? (
        <p style={{ fontSize: 13, color: '#8A93A6', margin: 0 }}>Chargement…</p>
      ) : (
        <>
          {saveError ? (
            <div style={{ background: '#FDEAEA', border: '1px solid #F3C6C6', borderRadius: 10, padding: '10px 13px', fontSize: 12.5, color: '#D14343' }}>{saveError}</div>
          ) : null}
          <div>
            <FieldLabel>Commentaire pédagogique {hint('· visible par le stagiaire et l\'admin formation')}</FieldLabel>
            <MarkdownEditor
              value={pedago}
              onChange={setPedago}
              placeholder="Votre retour au stagiaire : points forts, axes de progression…"
              rows={4}
            />
          </div>
          <div>
            <FieldLabel>Commentaire pour l&apos;admin formation {hint('· jamais visible par le stagiaire')}</FieldLabel>
            <MarkdownEditor
              value={privateNote}
              onChange={setPrivateNote}
              placeholder="Observations réservées à l'équipe formation…"
              rows={3}
            />
          </div>
          <div>
            <FieldLabel>Compétences validées lors de cet événement</FieldLabel>
            {comps.length === 0 ? (
              <p style={{ fontSize: 13, color: '#8A93A6', margin: '4px 0 0' }}>Aucune compétence dans cette phase.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {comps.map((c) => {
                  const locked = validatedElsewhere.has(c.id);
                  const checked = locked || selected.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={locked}
                      onClick={() => toggle(c.id)}
                      style={{ cursor: locked ? 'default' : 'pointer', textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 11, border: `1.5px solid ${checked && !locked ? '#BDE7CE' : '#E6EAF2'}`, background: locked ? '#F7F9FC' : checked ? '#E9F7EF' : '#fff', borderRadius: 11, padding: '10px 13px', fontFamily: 'inherit', opacity: locked ? 0.7 : 1 }}
                    >
                      <span style={{ flexShrink: 0, marginTop: 1, width: 22, height: 22, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, background: checked ? (locked ? '#A6AEBE' : '#059669') : '#F7F9FC', color: checked ? '#fff' : '#A6AEBE', border: `1.5px solid ${checked ? (locked ? '#A6AEBE' : '#059669') : '#E6EAF2'}` }}>
                        {checked ? '✓' : ''}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#16203A' }}>{c.name}</div>
                        {locked ? (
                          <div style={{ marginTop: 2, fontSize: 12, color: '#8A93A6' }}>Déjà validée lors d&apos;un autre événement</div>
                        ) : c.description ? (
                          <div style={{ marginTop: 2, fontSize: 12, color: '#5B6478', lineHeight: 1.45 }}>{c.description}</div>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}

// ── Main page ─────────────────────────────────────────────────

export default function CompetencesPage() {
  const [profileId, setProfileId] = useState<string | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  // Carnet d'un autre bénévole via ?profile=<id>&cursus=<id> : modifiable par
  // l'admin formation (cursus/can_manage), et par le doubleur pour les seules
  // doublures qu'il encadre ; lecture seule sinon.
  const [isOther, setIsOther] = useState(false);
  const { can, loading: permissionsLoading } = usePermissions();
  const canManage = can('cursus', 'can_manage');
  const canSeeOthers = can('cursus', 'can_see');
  const [notes, setNotes] = useState<DoublureNote[]>([]);
  const [supervised, setSupervised] = useState<SupervisedDoublure[]>([]);
  const [viewingName, setViewingName] = useState<string | null>(null);
  const [subjectName, setSubjectName] = useState<string | null>(null);
  const [pendingPrint, setPendingPrint] = useState(false);
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
      const viewer = session.user.id;
      setViewerId(viewer);

      // Cible : un autre bénévole si ?profile= est fourni et diffère du viewer.
      const params = new URLSearchParams(window.location.search);
      const targetParam = params.get('profile');
      const cursusParam = params.get('cursus');
      const other = !!targetParam && targetParam !== viewer;
      const pid = other ? targetParam! : viewer;
      setProfileId(pid);
      setIsOther(other);
      const doublureParam = params.get('doublure');
      if (doublureParam) setExpandedDoublures(new Set([doublureParam]));

      try {
        const [cursusAll, vcAll, supervisedAll] = await Promise.all([
          getAllCursus(),
          getVolunteerCursus(pid),
          listSupervisedDoublures().catch(() => [] as SupervisedDoublure[]),
        ]);
        setAllCursus(cursusAll);
        setSupervised(supervisedAll);
        setVolunteerCursus(vcAll);
        // Présélection du cursus demandé, sinon le premier disponible.
        const target = cursusParam ? vcAll.find((v) => v.cursus_id === cursusParam) : null;
        if (target) setSelectedVCId(target.id);
        else if (vcAll.length > 0) setSelectedVCId(vcAll[0].id);

        if (other) {
          const { data: targetProfile } = await supabase
            .from('profiles')
            .select('full_name,email')
            .eq('id', pid)
            .maybeSingle();
          // Un doubleur ne peut pas lire la fiche profil du stagiaire : le nom
          // vient alors de la liste des doublures qu'il encadre.
          const fromSupervised = supervisedAll.find((sd) => sd.trainee_id === pid)?.trainee_name;
          const name = targetProfile?.full_name ?? targetProfile?.email ?? fromSupervised ?? null;
          setViewingName(name ?? 'ce bénévole');
          setSubjectName(name);
        } else {
          const { data: ownProfile } = await supabase
            .from('profiles')
            .select('full_name,email')
            .eq('id', pid)
            .maybeSingle();
          setSubjectName(ownProfile?.full_name ?? ownProfile?.email ?? null);
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const reloadDoublures = useCallback(async (vcId: string) => {
    const [dbl, val] = await Promise.all([
      getDoubluresForVolunteerCursus(vcId),
      getValidationsForVolunteerCursus(vcId),
    ]);
    const nts = await getDoublureNotes(dbl.map((d) => d.id));
    setDoublures(dbl);
    setValidations(val);
    setNotes(nts);
  }, []);

  useEffect(() => {
    if (!selectedVCId) { setCursusDetail(null); setDoublures([]); setValidations([]); setNotes([]); return; }
    const vc = volunteerCursus.find((v) => v.id === selectedVCId);
    if (!vc) return;
    async function loadDetail() {
      try {
        const [detail] = await Promise.all([
          getCursusWithDetails(vc!.cursus_id),
          reloadDoublures(selectedVCId!),
        ]);
        setCursusDetail(detail);
      } catch (e) {
        setError((e as Error).message);
      }
    }
    loadDetail();
  }, [selectedVCId, volunteerCursus, reloadDoublures]);

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

  function linkedValidations(d: Doublure): CompetenceValidation[] {
    return linkedValidationsOf(d, validations);
  }

  // Export PDF : l'impression ne montre que la vue « carnet » (cf. CSS
  // .no-print / .print-only) ; si l'utilisateur est sur « parcours » on bascule
  // d'abord la vue, puis on imprime une fois le carnet effectivement rendu.
  useEffect(() => {
    if (!pendingPrint || view !== 'carnet') return;
    setPendingPrint(false);
    const raf = requestAnimationFrame(() => window.print());
    return () => cancelAnimationFrame(raf);
  }, [pendingPrint, view]);

  function handleExportPdf() {
    if (view === 'carnet') {
      window.print();
    } else {
      setView('carnet');
      setPendingPrint(true);
    }
  }

  const canDeclare = !isOther || canManage;

  function roleFor(d: Doublure | null): DoublureRole | null {
    if (canManage) return 'manager';
    if (!isOther) return 'trainee';
    if (d && viewerId && d.supervisor_id === viewerId) return 'supervisor';
    return null;
  }

  function canDeleteDoublure(): boolean {
    return !isOther || canManage;
  }

  function noteFor(doublureId: string, kind: DoublureNote['kind']): string | null {
    return notes.find((n) => n.doublure_id === doublureId && n.kind === kind)?.body ?? null;
  }

  async function handleConfirm() {
    if (!modal || !selectedVCId || !viewerId) return;
    if (modal.editingId) return handleUpdate(modal);
    if (!canDeclare) return;
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
        supervisor_comment: modal.supervisorComment || null,
        is_pending: false,
        declared_by: viewerId,
      });
      if (modal.personalComment.trim()) {
        await saveDoublureNote(createdDoublure.id, 'stagiaire', modal.personalComment);
      }
      if (modal.role === 'manager' && modal.supervisorNote.trim()) {
        await saveDoublureNote(createdDoublure.id, 'doubleur', modal.supervisorNote);
      }
      for (const compId of modal.selectedCompetences) {
        const val = await declareCompetenceValidation({
          volunteer_cursus_id: selectedVCId,
          competence_id: compId,
          doublure_id: createdDoublure.id,
          ...evForValidation,
          ...sup,
          declared_by: viewerId,
        });
        createdVals.push(val);
      }
      if (createdDoublure.supervisor_id) void notifyDoublureSupervisor(createdDoublure.id);
      await reloadDoublures(selectedVCId);
      setModal(null);
    } catch (e) {
      // Roll back partial inserts so a retry doesn't leave duplicate/orphan rows
      // (les notes partent en cascade avec la doublure).
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

  async function handleUpdate(m: ModalState) {
    const d = doublures.find((x) => x.id === m.editingId);
    if (!d || !selectedVCId || !viewerId) return;
    setError(null);
    setSubmitting(true);
    try {
      const ev = getEventData(m);
      // Le doubleur ne peut pas changer qui encadre la doublure (RLS).
      const sup = m.role === 'supervisor'
        ? { supervisor_id: d.supervisor_id, supervisor_name: d.supervisor_name, supervisor_antenne: d.supervisor_antenne }
        : getSupData(m);
      const { is_external: _omitExternal, ...evForValidation } = ev;
      await updateDoublure(d.id, {
        ...ev,
        ...sup,
        supervisor_comment: m.supervisorComment || null,
      });
      if (sup.supervisor_id && sup.supervisor_id !== d.supervisor_id) void notifyDoublureSupervisor(d.id);
      if (m.role !== 'supervisor') await saveDoublureNote(d.id, 'stagiaire', m.personalComment);
      if (m.role !== 'trainee') await saveDoublureNote(d.id, 'doubleur', m.supervisorNote);

      const selected = new Set(m.selectedCompetences);
      const linked = linkedValidations(d);
      for (const val of linked) {
        if (!selected.has(val.competence_id)) {
          await deleteCompetenceValidation(val.id);
        } else {
          await updateCompetenceValidation(val.id, { doublure_id: d.id, ...evForValidation, ...sup });
        }
      }
      const linkedCompIds = new Set(linked.map((v) => v.competence_id));
      for (const compId of m.selectedCompetences) {
        if (linkedCompIds.has(compId)) continue;
        await declareCompetenceValidation({
          volunteer_cursus_id: selectedVCId,
          competence_id: compId,
          doublure_id: d.id,
          ...evForValidation,
          ...sup,
          declared_by: viewerId,
        });
      }
      await reloadDoublures(selectedVCId);
      setModal(null);
    } catch (e) {
      setError((e as Error).message);
      // Rechargement pour refléter ce qui a été enregistré avant l'erreur.
      try { await reloadDoublures(selectedVCId); } catch { /* affichage déjà en erreur */ }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteDoublure(d: Doublure) {
    if (!selectedVCId || !canDeleteDoublure()) return;
    const linked = validations.filter((v) => v.doublure_id === d.id);
    const msg = linked.length > 0
      ? `Supprimer cet événement et les ${linked.length} compétence${linked.length > 1 ? 's' : ''} validée${linked.length > 1 ? 's' : ''} lors de celui-ci ?`
      : 'Supprimer cet événement ?';
    if (!window.confirm(msg)) return;
    setError(null);
    try {
      for (const val of linked) await deleteCompetenceValidation(val.id);
      await deleteDoublure(d.id);
      await reloadDoublures(selectedVCId);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function openDoublureModal(phaseId: string) {
    if (!canDeclare) return;
    setError(null);
    setModal({ ...MODAL_INIT, phaseId, role: canManage ? 'manager' : 'trainee' });
  }

  function openEditModal(d: Doublure) {
    const role = roleFor(d);
    if (!role) return;
    setError(null);
    setModal({
      ...MODAL_INIT,
      phaseId: d.phase_id,
      editingId: d.id,
      role,
      eventMode: d.mission_id ? 'chosen' : 'manual',
      chosenEvent: d.mission_id
        ? { id: d.mission_id, name: d.event_name ?? 'Événement', sub: fmt(d.event_date), date: d.event_date ?? undefined }
        : null,
      evName: d.mission_id ? '' : d.event_name ?? '',
      evDate: d.mission_id ? '' : d.event_date ?? '',
      evAntenne: d.mission_id ? '' : d.event_lieu ?? '',
      supMode: d.supervisor_id ? 'chosen' : 'manual',
      chosenSup: d.supervisor_id ? { id: d.supervisor_id, name: d.supervisor_name ?? '—', sub: '' } : null,
      supName: d.supervisor_id ? '' : d.supervisor_name ?? '',
      supAntenne: d.supervisor_id ? '' : d.supervisor_antenne ?? '',
      supervisorComment: d.supervisor_comment ?? '',
      personalComment: noteFor(d.id, 'stagiaire') ?? '',
      supervisorNote: noteFor(d.id, 'doubleur') ?? '',
      selectedCompetences: linkedValidations(d).map((v) => v.competence_id),
    });
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
  // celles non encore validées, plus celles déjà validées par la doublure
  // en cours de modification.
  function selectableComps(phaseId: string, editingId: string | null): CursusCompetence[] {
    const phase = cursusDetail?.phases.find((p) => p.id === phaseId);
    const editing = editingId ? doublures.find((d) => d.id === editingId) : null;
    const ownIds = new Set(editing ? linkedValidations(editing).map((v) => v.competence_id) : []);
    return ((phase?.competences ?? []) as CursusCompetence[]).filter((c) => !validatedIds.has(c.id) || ownIds.has(c.id));
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
      return (m.supMode === 'chosen' && !!m.chosenSup) || m.supName.trim().length > 0 || m.supMode === 'none';
    }
    return true;
  }

  // ── Render ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '40vh', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#8A93A6' }}>Chargement…</p>
      </div>
    );
  }

  const selectedCursusCode = currentCursusData?.code ?? '';
  const selectedCursusName = currentCursusData?.name ?? '';

  // Le carnet complet d'un autre bénévole est réservé à cursus/can_see
  // (et can_manage) ; un doubleur passe par « Doublures que j'encadre ».
  if (isOther && (permissionsLoading || !canSeeOthers)) {
    return (
      <div style={{ paddingBottom: 48 }}>
        {permissionsLoading ? (
          <p style={{ color: '#8A93A6' }}>Chargement…</p>
        ) : (
          <div style={{ background: '#fff', border: '1px solid #E6EAF2', borderRadius: 18 }}>
            <EmptyState
              tone="brand"
              icon="lock"
              title="Accès réservé"
              text="Le carnet d'événements d'un autre bénévole est réservé à l'équipe formation. Vos événements encadrés se commentent depuis votre page Suivi des compétences."
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 48 }}>

        {/* Breadcrumb */}
        <div className="no-print" style={{ fontSize: 12.5, color: '#8A93A6', fontWeight: 600, marginBottom: 18 }}>
          <Link href="/missions" style={{ color: '#8A93A6', textDecoration: 'none' }}>Missions</Link>
          <span style={{ color: '#A6AEBE' }}> › </span>
          <span>Suivi des compétences</span>
          {selectedCursusName ? (
            <>
              <span style={{ color: '#A6AEBE' }}> › </span>
              <span style={{ color: '#5B6478' }}>{selectedCursusName}</span>
            </>
          ) : null}
        </div>

        {error ? (
          <div className="no-print" style={{ background: '#FDEAEA', border: '1px solid #F3C6C6', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#D14343' }}>
            {error}
          </div>
        ) : null}

        {isOther ? (
          <div className="no-print" style={{ background: '#E7EEFB', border: '1px solid #CFDDF6', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#1E3C87', fontWeight: 600 }}>
            {canManage
              ? `Vous gérez le carnet d'événements de ${viewingName ?? 'ce bénévole'} en tant qu'admin formation : vous pouvez déclarer, modifier et supprimer ses événements.`
              : doublures.some((d) => d.supervisor_id === viewerId)
                ? `Vous consultez le carnet d'événements de ${viewingName ?? 'ce bénévole'} : vous pouvez modifier les événements que vous avez encadrés (commentaires et compétences).`
                : `Vous consultez le carnet d'événements de ${viewingName ?? 'ce bénévole'} en lecture seule.`}
          </div>
        ) : null}

        {!isOther && supervised.length > 0 ? (
          <div className="no-print">
            <SupervisedDoubluresCard
              items={supervised}
              onChanged={() => { listSupervisedDoublures().then(setSupervised).catch(() => {}); }}
            />
          </div>
        ) : null}

        {/* Cursus tab selector : en cours en plein, terminés en plus léger */}
        <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {inProgressCursus.map((vc) => {
            const c = allCursus.find((x) => x.id === vc.cursus_id);
            return (
              <button
                key={vc.id}
                type="button"
                onClick={() => setSelectedVCId(vc.id)}
                style={{
                  cursor: 'pointer',
                  border: selectedVCId === vc.id ? 'none' : '1px solid #E6EAF2',
                  borderRadius: 99,
                  padding: '7px 16px',
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: 'inherit',
                  background: selectedVCId === vc.id ? '#16203A' : '#fff',
                  color: selectedVCId === vc.id ? '#fff' : '#5B6478',
                }}
              >
                {c?.code ?? vc.cursus_id}
              </button>
            );
          })}
          {completedCursus.length > 0 ? (
            <>
              {inProgressCursus.length > 0 ? (
                <span style={{ width: 1, height: 18, background: '#E6EAF2', margin: '0 2px' }} />
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
                      border: selectedVCId === vc.id ? 'none' : '1px solid #EEF1F6',
                      borderRadius: 99,
                      padding: '5px 13px',
                      fontSize: 12,
                      fontWeight: 600,
                      fontFamily: 'inherit',
                      background: selectedVCId === vc.id ? '#5B6478' : 'transparent',
                      color: selectedVCId === vc.id ? '#fff' : '#8A93A6',
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
          <div style={{ background: '#fff', border: '1px solid #E6EAF2', borderRadius: 18 }}>
            <EmptyState
              tone="brand"
              icon="workspace_premium"
              title="Aucun cursus d'événements"
              text={
                isOther
                  ? `${viewingName ?? 'Ce bénévole'} n'est inscrit dans aucun cursus d'événements.`
                  : "Vous n'êtes inscrit dans aucun cursus d'événements. Un administrateur peut vous y inscrire."
              }
            />
          </div>
        ) : cursusDetail ? (
          <>
            {/* ── Header card ── */}
            <div
              style={{
                background: '#fff',
                border: '1px solid #E6EAF2',
                borderRadius: 18,
                boxShadow: '0 2px 10px rgba(20,32,58,.08)',
                padding: '22px 24px',
                marginBottom: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div className="print-only" style={{ fontSize: 12, fontWeight: 700, color: '#5B6478', marginBottom: 6 }}>
                    Cahier de doublure · {subjectName ?? viewingName ?? 'Bénévole'} · Exporté le {fmt(new Date().toISOString())}
                  </div>
                  {cursusDetail.category || cursusDetail.level ? (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#00378F', marginBottom: 7 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#00378F', display: 'inline-block' }} />
                      {[cursusDetail.category, cursusDetail.level ? `Niveau ${cursusDetail.level}` : null].filter(Boolean).join(' · ')}
                    </div>
                  ) : null}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 11 }}>
                    <h1 style={{ margin: 0, fontSize: 27, fontWeight: 800, color: '#16203A', letterSpacing: '-0.02em' }}>
                      {cursusDetail.name}
                    </h1>
                    <span
                      style={{ fontSize: 13, fontWeight: 700, color: '#1E3C87', background: '#E7EEFB', border: '1px solid #CFDDF6', borderRadius: 7, padding: '3px 9px' }}
                    >
                      {cursusDetail.code}
                    </span>
                  </div>
                </div>
                <div style={{ flexShrink: 0, textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-display-active)', fontSize: 32, color: '#16203A', lineHeight: 1 }}>
                    {validatedIds.size}
                    <span style={{ fontSize: 19, color: '#8A93A6' }}>/{allComps.length}</span>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#5B6478', marginTop: 4 }}>compétences validées</div>
                </div>
              </div>

              {/* Segmented progress bar */}
              {allComps.length > 0 ? (
                <>
                  <SegmentedBar total={allComps.length} validated={allComps.filter((c) => validatedIds.has(c.id)).length} />
                  <div style={{ display: 'flex', gap: 16, marginTop: 11, fontSize: 12, color: '#5B6478' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 3, background: '#059669', display: 'inline-block' }} />
                      Validée (autodéclarée)
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 3, background: '#E6EAF2', display: 'inline-block' }} />
                      À valider
                    </span>
                  </div>
                </>
              ) : null}
            </div>

            {/* ── Phase stepper grid ── */}
            {cursusDetail.phases.length > 0 ? (
              <div
                className="no-print"
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
                  const badgeBg = isComplete ? '#059669' : isActive ? '#16203A' : '#F7F9FC';
                  const badgeColor = isComplete || isActive ? '#fff' : '#8A93A6';
                  const borderColor = isComplete ? '#BDE7CE' : isActive ? '#A6AEBE' : '#E6EAF2';
                  const titleColor = isActive ? '#16203A' : isComplete ? '#059669' : '#8A93A6';
                  const pillBg = isComplete ? '#E9F7EF' : '#F7F9FC';
                  const pillColor = isComplete ? '#059669' : '#8A93A6';

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
                        <div style={{ marginTop: 8, fontSize: 11.5, color: '#8A93A6', lineHeight: 1.4 }}>{ph.sub}</div>
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
            <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: '#8A93A6' }}>Affichage</span>
                <div style={{ display: 'inline-flex', background: '#fff', border: '1px solid #E6EAF2', borderRadius: 10, padding: 3 }}>
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
                        background: view === v ? '#16203A' : 'transparent',
                        color: view === v ? '#fff' : '#5B6478',
                      }}
                    >
                      {v === 'parcours' ? 'Parcours' : 'Carnet'}
                    </button>
                  ))}
                </div>
              </div>
              <Button variant="ghost" size="sm" icon="picture_as_pdf" onClick={handleExportPdf}>
                Exporter le cahier en PDF
              </Button>
            </div>

            {/* ══════════════ PARCOURS VIEW ══════════════ */}
            {view === 'parcours' ? (
              <div className="no-print" style={{ position: 'relative', paddingLeft: 38 }}>
                {/* vertical timeline line */}
                <div style={{ position: 'absolute', left: 13, top: 6, bottom: 14, width: 2, background: '#E6EAF2' }} />

                {cursusDetail.phases.map((phase, i) => {
                  const phDoublures = doublures.filter((d) => d.phase_id === phase.id).sort(compareDoublureChrono);
                  const phComps = (phase.competences ?? []) as CursusCompetence[];
                  const doneComps = phComps.filter((c) => validatedIds.has(c.id));
                  const todoComps = phComps.filter((c) => !validatedIds.has(c.id));
                  const isComplete = doneComps.length === phComps.length && phComps.length > 0 && phDoublures.length >= phase.min_doublures && phDoublures.filter((d) => d.is_external).length >= phase.min_externe;
                  const nodeBg = isComplete ? '#059669' : i === 0 ? '#16203A' : '#E6EAF2';
                  const cardBorderColor = isComplete ? '#BDE7CE' : '#E6EAF2';
                  const pillBg = isComplete ? '#E9F7EF' : doneComps.length > 0 ? '#E7EEFB' : '#F7F9FC';
                  const pillColor = isComplete ? '#059669' : doneComps.length > 0 ? '#1E3C87' : '#8A93A6';

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
                          border: '2px solid #F7F9FC',
                          boxShadow: '0 0 0 4px #F7F9FC',
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
                          boxShadow: '0 1px 3px rgba(20,32,58,.06)',
                          overflow: 'hidden',
                        }}
                      >
                        {/* phase header */}
                        <div style={{ padding: '15px 18px 14px', borderBottom: '1px solid #EEF1F6' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 15.5, fontWeight: 800, color: '#16203A' }}>{phase.label}</span>
                              {phase.provisional ? (
                                <Pill color="#b45309" bg="#FEF3E2" border="#F6DFB0">Contenu provisoire</Pill>
                              ) : null}
                            </div>
                            <div
                              style={{ fontSize: 12, fontWeight: 700, color: pillColor, background: pillBg, borderRadius: 6, padding: '2px 9px' }}
                            >
                              {doneComps.length}/{phComps.length} compétences
                            </div>
                          </div>
                          {phase.sub ? (
                            <div style={{ marginTop: 5, fontSize: 13, color: '#5B6478' }}>
                              {phase.sub} · {phDoublures.length}/{phase.min_doublures} événement{phase.min_doublures > 1 ? 's' : ''}
                              {phase.min_externe > 0 ? ` (dont ${phase.min_externe} externe${phase.min_externe > 1 ? 's' : ''})` : ''}
                            </div>
                          ) : null}
                        </div>

                        {/* Doublures & événements section */}
                        <div style={{ padding: '15px 18px 6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 11 }}>
                            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: '#8A93A6' }}>
                              Événements
                            </span>
                            {canDeclare ? <DeclareDoublureButton onClick={() => openDoublureModal(phase.id)} /> : null}
                          </div>

                          {/* Events with their competences */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginBottom: 6 }}>
                            {phDoublures.map((d) => {
                              const dVals = linkedValidations(d);
                              const dRole = roleFor(d);
                              const traineeNote = noteFor(d.id, 'stagiaire');
                              const privateNote = noteFor(d.id, 'doubleur');
                              const expanded = expandedDoublures.has(d.id);
                              return (
                                <div key={d.id} style={{ border: '1px solid #E6EAF2', borderRadius: 13, background: '#fff', overflow: 'hidden' }}>
                                  {/* event header — click anywhere to expand/collapse */}
                                  <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => toggleDoublureExpanded(d.id)}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleDoublureExpanded(d.id); } }}
                                    aria-expanded={expanded}
                                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 11, padding: '12px 14px', background: '#F7F9FC', borderBottom: expanded ? '1px solid #EEF1F6' : 'none' }}
                                  >
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: 14, fontWeight: 800, color: '#16203A' }}>{d.event_name ?? 'Événement'}</span>
                                        {expanded ? (
                                          <>
                                            {d.is_external ? <Pill color="#8E1279" bg="#F8E6F4" border="#E9C9E4">Externe</Pill> : null}
                                            {d.mission_id ? <Pill color="#1E3C87" bg="#E7EEFB" border="#CFDDF6">Événement timeline</Pill> : null}
                                            {d.is_pending ? <Pill color="#b45309" bg="#FEF3E2" border="#F6DFB0">En attente</Pill> : null}
                                            <span style={{ marginLeft: 'auto', fontSize: 12, color: '#8A93A6', fontVariantNumeric: 'tabular-nums' }}>{fmt(d.event_date)}</span>
                                          </>
                                        ) : (
                                          dVals.length > 0 ? (
                                            <span
                                              aria-label={`${dVals.length} compétence${dVals.length > 1 ? 's' : ''} signée${dVals.length > 1 ? 's' : ''} sur cet événement`}
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
                                            <div style={{ marginTop: 3, fontSize: 12, color: '#8A93A6' }}>{d.event_lieu}</div>
                                          ) : null}
                                          {d.supervisor_name ? (
                                            <div style={{ marginTop: 5, fontSize: 12, color: '#5B6478' }}>
                                              Encadré par <strong>{d.supervisor_name}</strong>
                                              {d.supervisor_antenne ? ` · ${d.supervisor_antenne}` : ''}
                                            </div>
                                          ) : null}
                                          {d.supervisor_comment ? (
                                            <div style={{ marginTop: 6, fontSize: 12, color: '#5B6478', lineHeight: 1.45 }}>
                                              <div style={{ fontSize: 11, fontWeight: 700, color: '#8A93A6' }}>Commentaire pédagogique du doubleur</div>
                                              <MarkdownText>{d.supervisor_comment}</MarkdownText>
                                            </div>
                                          ) : null}
                                          {traineeNote ? (
                                            <div style={{ marginTop: 6, fontSize: 12, color: '#5B6478', lineHeight: 1.45 }}>
                                              <div style={{ fontSize: 11, fontWeight: 700, color: '#8A93A6' }}>
                                                {isOther ? 'Note du stagiaire' : 'Note perso'} <span style={{ fontWeight: 600 }}>· visible par le stagiaire et l&apos;admin formation</span>
                                              </div>
                                              <MarkdownText>{traineeNote}</MarkdownText>
                                            </div>
                                          ) : null}
                                          {privateNote ? (
                                            <div style={{ marginTop: 6, fontSize: 12, color: '#5B6478', lineHeight: 1.45, background: '#F5EDFA', border: '1px solid #E3D6EF', borderRadius: 8, padding: '6px 9px' }}>
                                              <div style={{ fontSize: 11, fontWeight: 700, color: '#7A2E86' }}>
                                                Note privée du doubleur <span style={{ fontWeight: 600 }}>· visible par le doubleur et l&apos;admin formation</span>
                                              </div>
                                              <MarkdownText>{privateNote}</MarkdownText>
                                            </div>
                                          ) : null}
                                          {dRole || canDeleteDoublure() ? (
                                            <div style={{ marginTop: 9, display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                                              {dRole ? (
                                                <button
                                                  type="button"
                                                  onClick={(e) => { e.stopPropagation(); openEditModal(d); }}
                                                  onKeyDown={(e) => e.stopPropagation()}
                                                  style={{ cursor: 'pointer', border: '1px solid #A6AEBE', background: '#fff', color: '#16203A', borderRadius: 8, padding: '5px 11px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}
                                                >
                                                  {dRole === 'supervisor' ? 'Commenter / modifier' : 'Modifier'}
                                                </button>
                                              ) : null}
                                              {canDeleteDoublure() ? (
                                                <button
                                                  type="button"
                                                  onClick={(e) => { e.stopPropagation(); handleDeleteDoublure(d); }}
                                                  onKeyDown={(e) => e.stopPropagation()}
                                                  style={{ cursor: 'pointer', border: '1px solid #F5C6C6', background: '#fff', color: '#D14343', borderRadius: 8, padding: '5px 11px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}
                                                >
                                                  Supprimer
                                                </button>
                                              ) : null}
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
                                        style={{ cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 11, padding: '11px 16px 11px 40px', borderTop: '1px solid #EEF1F6', borderLeft: '3px solid #E9F7EF' }}
                                      >
                                        <span style={{ flexShrink: 0, marginTop: 1, width: 22, height: 22, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, background: '#059669', color: '#fff', border: '1.5px solid #059669' }}>✓</span>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#16203A' }}>{comp.name}</span>
                                            {compExpanded && comp.garde_only ? <Pill color="#8E1279" bg="#F8E6F4" border="#E9C9E4">Garde uniquement</Pill> : null}
                                          </div>
                                          {compExpanded && comp.description ? (
                                            <div style={{ marginTop: 2, fontSize: 12, color: '#5B6478', lineHeight: 1.45 }}>{comp.description}</div>
                                          ) : null}
                                        </div>
                                      </div>
                                    );
                                  })}
                                  {expanded && dVals.length === 0 ? (
                                    <div style={{ padding: '11px 14px', fontSize: 12.5, color: '#8A93A6' }}>Aucune compétence validée sur cet événement.</div>
                                  ) : null}
                                </div>
                              );
                            })}

                            {phDoublures.length === 0 ? (
                              <div style={{ fontSize: 12.5, color: '#8A93A6' }}>Aucun événement déclaré pour l&apos;instant.</div>
                            ) : null}
                          </div>
                        </div>

                        {/* Compétences à valider (lecture seule — validées via une doublure) */}
                        {todoComps.length > 0 ? (
                          <div style={{ padding: '14px 18px 18px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 11 }}>
                              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: '#8A93A6' }}>
                                Compétences à valider
                              </div>
                              <span style={{ fontSize: 11.5, color: '#8A93A6' }}>À cocher lors d&apos;un événement</span>
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
                                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 12, border: '1px solid #E6EAF2', background: '#fff', borderRadius: 12, padding: '12px 14px' }}
                                  >
                                    <span style={{ flexShrink: 0, marginTop: 1, width: 24, height: 24, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, background: '#F7F9FC', color: '#8A93A6', border: '1.5px solid #E6EAF2' }}>–</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: 14, fontWeight: 700, color: '#16203A' }}>{c.name}</span>
                                        {compExpanded && c.garde_only ? <Pill color="#8E1279" bg="#F8E6F4" border="#E9C9E4">Garde uniquement</Pill> : null}
                                      </div>
                                      {compExpanded && c.description ? (
                                        <div style={{ marginTop: 3, fontSize: 12.5, color: '#5B6478', lineHeight: 1.45 }}>{c.description}</div>
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
                  <div style={{ background: '#fff', border: '1px solid #E6EAF2', borderRadius: 14, padding: '16px 18px', marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: '#8A93A6', marginBottom: 11 }}>
                      Règles du cursus d&apos;événements
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '9px 22px' }}>
                      {cursusDetail.rules.map((r) => (
                        <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13, color: '#5B6478', lineHeight: 1.45 }}>
                          <span
                            style={{ flexShrink: 0, marginTop: 1, width: 17, height: 17, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, background: r.auto ? '#16203A' : '#E6EAF2', color: r.auto ? '#fff' : '#5B6478' }}
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
                  const pillBg = isComplete ? '#E9F7EF' : '#F7F9FC';
                  const pillColor = isComplete ? '#059669' : '#8A93A6';

                  return (
                    <div
                      key={phase.id}
                      id={`phase-anchor-${phase.id}`}
                      style={{ background: '#fff', border: '1px solid #E6EAF2', borderRadius: 16, boxShadow: '0 1px 3px rgba(20,32,58,.06)', marginBottom: 16, overflow: 'hidden', scrollMarginTop: 80 }}
                    >
                      {/* Phase header */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '14px 18px', borderBottom: '1px solid #EEF1F6' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 15, fontWeight: 800, color: '#16203A' }}>{phase.label}</span>
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: pillColor, background: pillBg, borderRadius: 6, padding: '2px 8px' }}>
                            {doneComps.length}/{phComps.length}
                          </span>
                          {phase.provisional ? <Pill color="#b45309" bg="#FEF3E2" border="#F6DFB0">Provisoire</Pill> : null}
                        </div>
                        {canDeclare ? (
                          <span className="no-print">
                            <DeclareDoublureButton onClick={() => openDoublureModal(phase.id)} />
                          </span>
                        ) : null}
                      </div>

                      {/* Doublures compact */}
                      {phDoublures.length > 0 ? (
                        <div style={{ padding: '6px 8px 4px' }}>
                          {phDoublures.map((d) => (
                            <div key={d.id} style={{ display: 'grid', gridTemplateColumns: '1fr 168px', gap: 14, alignItems: 'start', padding: '10px 12px', borderBottom: '1px solid #EEF1F6' }}>
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: 13.5, fontWeight: 700, color: '#16203A' }}>{d.event_name ?? 'Événement'}</span>
                                  {d.is_external ? <Pill color="#8E1279" bg="#F8E6F4" border="#E9C9E4">Ext.</Pill> : null}
                                  {d.mission_id ? <Pill color="#1E3C87" bg="#E7EEFB" border="#CFDDF6">Timeline</Pill> : null}
                                  {roleFor(d) ? (
                                    <button
                                      type="button"
                                      className="no-print"
                                      onClick={() => openEditModal(d)}
                                      style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: '#00378F', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', padding: 0 }}
                                    >
                                      Modifier
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 12, color: '#8A93A6', fontVariantNumeric: 'tabular-nums' }}>{fmt(d.event_date)}</div>
                                {d.supervisor_name ? (
                                  <div style={{ marginTop: 2, fontSize: 12.5, fontWeight: 700, color: '#5B6478' }}>{d.supervisor_name}</div>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {/* Competences table */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 230px 188px', gap: 12, padding: '10px 18px', background: '#F7F9FC', borderTop: phDoublures.length > 0 ? '1px solid #EEF1F6' : 'none', borderBottom: '1px solid #EEF1F6', fontSize: 11, fontWeight: 800, letterSpacing: '.03em', textTransform: 'uppercase', color: '#8A93A6' }}>
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
                            style={{ display: 'grid', gridTemplateColumns: '1fr 230px 188px', gap: 12, alignItems: 'center', padding: '13px 18px', borderBottom: '1px solid #F7F9FC', background: isDone ? '#F7F9FC' : '#fff' }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span
                                  style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, background: isDone ? '#059669' : '#F7F9FC', color: isDone ? '#fff' : '#8A93A6', border: `1.5px solid ${isDone ? '#059669' : '#E6EAF2'}` }}
                                >
                                  {isDone ? '✓' : '–'}
                                </span>
                                <span style={{ fontSize: 13.5, fontWeight: 700, color: '#16203A' }}>{c.name}</span>
                                {c.garde_only ? <Pill color="#8E1279" bg="#F8E6F4" border="#E9C9E4">Garde</Pill> : null}
                              </div>
                              {c.description ? (
                                <div style={{ marginTop: 3, marginLeft: 28, fontSize: 12, color: '#8A93A6', lineHeight: 1.4 }}>{c.description}</div>
                              ) : null}
                            </div>
                            <div style={{ fontSize: 12.5, color: '#5B6478', lineHeight: 1.4 }}>
                              {val ? [val.event_name, val.event_lieu].filter(Boolean).join(' · ') || '—' : '—'}
                            </div>
                            <div>
                              {isDone && val ? (
                                <>
                                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#5B6478' }}>{val.supervisor_name ?? '—'}</div>
                                  <div style={{ fontSize: 11.5, color: '#8A93A6' }}>{val.declared_by === viewerId ? 'déclarée par moi' : 'déclarée'}</div>
                                </>
                              ) : (
                                <span style={{ fontSize: 12, fontWeight: 600, color: '#8A93A6' }}>À valider lors d&apos;un événement</span>
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
        const isEdit = !!modal.editingId;
        const comps = selectableComps(modal.phaseId, modal.editingId);
        const hint = (text: string) => <span style={{ color: '#8A93A6', fontWeight: 600 }}>{text}</span>;
        return (
          <Modal
            title={isEdit ? 'Modifier l’événement' : 'Déclarer un événement'}
            subtitle={`Étape ${modal.step + 1}/${STEP_LABELS.length} · ${STEP_LABELS[modal.step]}`}
            onClose={() => setModal(null)}
            footer={
              <>
                <button
                  type="button"
                  onClick={() => modal.step === 0 ? setModal(null) : setModal((m) => m ? { ...m, step: m.step - 1 } : m)}
                  style={{ cursor: 'pointer', border: '1px solid #E6EAF2', background: '#fff', color: '#5B6478', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}
                >
                  {modal.step === 0 ? 'Annuler' : '‹ Précédent'}
                </button>
                {isEdit && !isLast ? (
                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={submitting || !canProceed({ ...modal, step: 0 }) || !canProceed({ ...modal, step: 1 })}
                    style={{ marginLeft: 'auto', cursor: submitting ? 'not-allowed' : 'pointer', border: '1px solid #BDE7CE', background: '#E9F7EF', color: '#12805A', borderRadius: 9, padding: '9px 14px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', opacity: submitting ? 0.5 : 1 }}
                  >
                    Enregistrer
                  </button>
                ) : null}
                {isLast ? (
                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={submitting}
                    style={{ cursor: submitting ? 'not-allowed' : 'pointer', border: 'none', background: '#059669', color: '#fff', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', opacity: submitting ? 0.5 : 1 }}
                  >
                    {submitting ? 'Enregistrement…' : isEdit ? 'Enregistrer les modifications' : 'Confirmer l’événement'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setModal((m) => m && canProceed(m) ? { ...m, step: m.step + 1 } : m)}
                    disabled={!canProceed(modal)}
                    style={{ cursor: !canProceed(modal) ? 'not-allowed' : 'pointer', border: 'none', background: '#16203A', color: '#fff', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', opacity: !canProceed(modal) ? 0.5 : 1 }}
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
                  role={isEdit ? 'button' : undefined}
                  title={isEdit ? STEP_LABELS[i] : undefined}
                  onClick={isEdit ? () => setModal((m) => (m ? { ...m, step: i } : m)) : undefined}
                  style={{ flex: 1, height: isEdit ? 7 : 5, borderRadius: 4, cursor: isEdit ? 'pointer' : 'default', background: i <= modal.step ? '#059669' : '#E6EAF2' }}
                />
              ))}
            </div>

            {error ? (
              <div style={{ background: '#FDEAEA', border: '1px solid #F3C6C6', borderRadius: 10, padding: '10px 13px', fontSize: 12.5, color: '#D14343' }}>
                {error}
              </div>
            ) : null}

            {/* Page 1 — Événement */}
            {modal.step === 0 ? (
              <EventField modal={modal} setModal={setModalDoublure} />
            ) : null}

            {/* Page 2 — Doubleur */}
            {modal.step === 1 ? (
              modal.role === 'supervisor' ? (
                <div>
                  <FieldLabel>Encadré par</FieldLabel>
                  <p style={{ fontSize: 13, color: '#5B6478', margin: 0 }}>
                    Vous êtes le doubleur de cet événement. Seuls le stagiaire et l&apos;admin formation peuvent changer le doubleur.
                  </p>
                </div>
              ) : (
                <SupervisorField modal={modal} setModal={setModalDoublure} />
              )
            ) : null}

            {/* Page 3 — Commentaires */}
            {modal.step === 2 ? (
              <>
                <div>
                  <FieldLabel>Commentaire pédagogique du doubleur {hint('· visible par le stagiaire, le doubleur et l\'admin formation')}</FieldLabel>
                  <MarkdownEditor
                    value={modal.supervisorComment}
                    onChange={(v) => setModal((m) => m ? { ...m, supervisorComment: v } : m)}
                    placeholder={modal.role === 'supervisor' ? 'Votre retour au stagiaire : points forts, axes de progression…' : 'Retour du doubleur sur l’événement…'}
                    rows={3}
                  />
                </div>
                {modal.role !== 'supervisor' ? (
                  <div>
                    <FieldLabel>
                      {modal.role === 'manager' && isOther ? 'Note du stagiaire' : 'Commentaire personnel'} {hint('· visible par le stagiaire et l\'admin formation')}
                    </FieldLabel>
                    <MarkdownEditor
                      value={modal.personalComment}
                      onChange={(v) => setModal((m) => m ? { ...m, personalComment: v } : m)}
                      placeholder="Vos remarques, ressenti, points à retravailler…"
                      rows={3}
                    />
                  </div>
                ) : null}
                {modal.role !== 'trainee' ? (
                  <div>
                    <FieldLabel>Note privée du doubleur {hint('· visible uniquement par le doubleur et l\'admin formation')}</FieldLabel>
                    <MarkdownEditor
                      value={modal.supervisorNote}
                      onChange={(v) => setModal((m) => m ? { ...m, supervisorNote: v } : m)}
                      placeholder="Observations réservées à l'équipe formation…"
                      rows={3}
                    />
                  </div>
                ) : null}
              </>
            ) : null}

            {/* Page 4 — Compétences validées */}
            {modal.step === 3 ? (
              <div>
                <FieldLabel>Compétences validées lors de cet événement <span style={{ color: '#8A93A6', fontWeight: 600 }}>(optionnel)</span></FieldLabel>
                {comps.length === 0 ? (
                  <p style={{ fontSize: 13, color: '#8A93A6', margin: '4px 0 0' }}>
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
                          style={{ cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 11, border: `1.5px solid ${checked ? '#BDE7CE' : '#E6EAF2'}`, background: checked ? '#E9F7EF' : '#fff', borderRadius: 11, padding: '11px 13px', fontFamily: 'inherit' }}
                        >
                          <span style={{ flexShrink: 0, marginTop: 1, width: 22, height: 22, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, background: checked ? '#059669' : '#F7F9FC', color: checked ? '#fff' : '#A6AEBE', border: `1.5px solid ${checked ? '#059669' : '#E6EAF2'}` }}>
                            {checked ? '✓' : ''}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 13.5, fontWeight: 700, color: '#16203A' }}>{c.name}</span>
                              {c.garde_only ? <Pill color="#8E1279" bg="#F8E6F4" border="#E9C9E4">Garde uniquement</Pill> : null}
                            </div>
                            {c.description ? (
                              <div style={{ marginTop: 2, fontSize: 12, color: '#5B6478', lineHeight: 1.45 }}>{c.description}</div>
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
