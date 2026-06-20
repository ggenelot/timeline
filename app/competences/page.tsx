'use client';

import { useEffect, useState } from 'react';
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

type DoublureForm = {
  phase_id: string;
  event_name: string;
  event_date: string;
  event_lieu: string;
  is_external: boolean;
  supervisor_name: string;
  supervisor_antenne: string;
  message: string;
  is_pending: boolean;
};

type ValidationForm = {
  competence_id: string;
  event_name: string;
  event_date: string;
  event_lieu: string;
  supervisor_name: string;
  supervisor_antenne: string;
};

const EMPTY_DOUBLURE_FORM: DoublureForm = {
  phase_id: '',
  event_name: '',
  event_date: '',
  event_lieu: '',
  is_external: false,
  supervisor_name: '',
  supervisor_antenne: '',
  message: '',
  is_pending: false,
};

const EMPTY_VALIDATION_FORM: ValidationForm = {
  competence_id: '',
  event_name: '',
  event_date: '',
  event_lieu: '',
  supervisor_name: '',
  supervisor_antenne: '',
};

// ── Small UI helpers ─────────────────────────────────────────

function Badge({
  children,
  variant = 'default',
}: {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'pending';
}) {
  const cls = {
    default: 'bg-slate-100 text-slate-600',
    success: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-orange-100 text-orange-700',
    pending: 'bg-amber-100 text-amber-700',
  }[variant];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max === 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-200">
      <div
        className="h-1.5 rounded-full bg-emerald-500 transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ── Modal overlay ────────────────────────────────────────────

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-6 py-4">{children}</div>
      </div>
    </div>
  );
}

// ── Event form fields (shared by doublure + validation) ──────

function EventFields({
  eventName,
  eventDate,
  eventLieu,
  supervisorName,
  supervisorAntenne,
  onChange,
}: {
  eventName: string;
  eventDate: string;
  eventLieu: string;
  supervisorName: string;
  supervisorAntenne: string;
  onChange: (field: string, value: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-700">Nom de l&apos;événement</label>
        <input
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          value={eventName}
          onChange={(e) => onChange('event_name', e.target.value)}
          placeholder="ex : Maraude Paris 10e"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Date</label>
          <input
            type="date"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            value={eventDate}
            onChange={(e) => onChange('event_date', e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Lieu</label>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            value={eventLieu}
            onChange={(e) => onChange('event_lieu', e.target.value)}
            placeholder="Ville / antenne"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Superviseur</label>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            value={supervisorName}
            onChange={(e) => onChange('supervisor_name', e.target.value)}
            placeholder="Prénom Nom"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Antenne superviseur</label>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            value={supervisorAntenne}
            onChange={(e) => onChange('supervisor_antenne', e.target.value)}
            placeholder="ex : Paris 12e"
          />
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────

export default function CompetencesPage() {
  const [profileId, setProfileId] = useState<string | null>(null);
  const [allCursus, setAllCursus] = useState<Cursus[]>([]);
  const [volunteerCursus, setVolunteerCursus] = useState<VolunteerCursus[]>([]);

  // selected cursus detail
  const [selectedVCId, setSelectedVCId] = useState<string | null>(null);
  const [cursusDetail, setCursusDetail] = useState<CursusDetail | null>(null);
  const [doublures, setDoublures] = useState<Doublure[]>([]);
  const [validations, setValidations] = useState<CompetenceValidation[]>([]);

  const [view, setView] = useState<ViewMode>('parcours');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // modals
  const [doublureModal, setDoublureModal] = useState(false);
  const [validationModal, setValidationModal] = useState(false);
  const [doublureForm, setDoublureForm] = useState<DoublureForm>(EMPTY_DOUBLURE_FORM);
  const [validationForm, setValidationForm] = useState<ValidationForm>(EMPTY_VALIDATION_FORM);
  const [submitting, setSubmitting] = useState(false);

  // enrollment modal
  const [enrollModal, setEnrollModal] = useState(false);

  // ── Load ──────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const pid = session.user.id;
      setProfileId(pid);
      try {
        const [cursusAll, vcAll] = await Promise.all([
          getAllCursus(),
          getVolunteerCursus(pid),
        ]);
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

  // load detail when selected cursus changes
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

  // ── Doublure submit ────────────────────────────────────────

  async function handleDoublureSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedVCId || !profileId) return;
    setSubmitting(true);
    try {
      const dbl = await declareDoublure({
        volunteer_cursus_id: selectedVCId,
        phase_id: doublureForm.phase_id,
        mission_id: null,
        event_name: doublureForm.event_name || null,
        event_date: doublureForm.event_date || null,
        event_lieu: doublureForm.event_lieu || null,
        is_external: doublureForm.is_external,
        supervisor_id: null,
        supervisor_name: doublureForm.supervisor_name || null,
        supervisor_antenne: doublureForm.supervisor_antenne || null,
        message: doublureForm.message || null,
        is_pending: doublureForm.is_pending,
        declared_by: profileId,
      });
      setDoublures((prev) => [dbl, ...prev]);
      setDoublureModal(false);
      setDoublureForm(EMPTY_DOUBLURE_FORM);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteDoublure(id: string) {
    try {
      await deleteDoublure(id);
      setDoublures((prev) => prev.filter((d) => d.id !== id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // ── Validation submit ──────────────────────────────────────

  async function handleValidationSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedVCId || !profileId) return;
    setSubmitting(true);
    try {
      const val = await declareCompetenceValidation({
        volunteer_cursus_id: selectedVCId,
        competence_id: validationForm.competence_id,
        doublure_id: null,
        mission_id: null,
        event_name: validationForm.event_name || null,
        event_date: validationForm.event_date || null,
        event_lieu: validationForm.event_lieu || null,
        supervisor_id: null,
        supervisor_name: validationForm.supervisor_name || null,
        supervisor_antenne: validationForm.supervisor_antenne || null,
        declared_by: profileId,
      });
      setValidations((prev) => [...prev, val]);
      setValidationModal(false);
      setValidationForm(EMPTY_VALIDATION_FORM);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteValidation(id: string) {
    try {
      await deleteCompetenceValidation(id);
      setValidations((prev) => prev.filter((v) => v.id !== id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // ── Derived state ──────────────────────────────────────────

  const enrolledCursusIds = new Set(volunteerCursus.map((vc) => vc.cursus_id));
  const availableToEnroll = allCursus.filter((c) => !enrolledCursusIds.has(c.id));

  const validatedCompetenceIds = new Set(validations.map((v) => v.competence_id));

  function getPhaseDoublures(phaseId: string) {
    return doublures.filter((d) => d.phase_id === phaseId);
  }

  function getPhaseProgress(phase: CursusPhase) {
    const comps = phase.competences ?? [];
    const validated = comps.filter((c) => validatedCompetenceIds.has(c.id)).length;
    const phaseDoublures = getPhaseDoublures(phase.id);
    return { validated, total: comps.length, doublureCount: phaseDoublures.length };
  }

  // ── Render ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-slate-500">Chargement…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mes compétences</h1>
          <p className="mt-1 text-sm text-slate-600">
            Suivi de votre parcours de doublure et de certification.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEnrollModal(true)}
          disabled={availableToEnroll.length === 0}
          className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          + Rejoindre un cursus
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {/* No cursus enrolled */}
      {volunteerCursus.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
          <p className="text-slate-500">Vous n&apos;êtes inscrit dans aucun cursus de doublure.</p>
          <button
            type="button"
            onClick={() => setEnrollModal(true)}
            className="mt-4 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Rejoindre un cursus
          </button>
        </div>
      ) : (
        <>
          {/* Cursus tabs */}
          <div className="flex gap-2 overflow-x-auto">
            {volunteerCursus.map((vc) => (
              <button
                key={vc.id}
                type="button"
                onClick={() => setSelectedVCId(vc.id)}
                className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  selectedVCId === vc.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {(vc.cursus as Cursus)?.code ?? vc.cursus_id}
                {vc.completed_at ? ' ✓' : ''}
              </button>
            ))}
          </div>

          {cursusDetail ? (
            <>
              {/* Cursus header card */}
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-mono font-semibold text-slate-600">
                        {cursusDetail.code}
                      </span>
                      <h2 className="text-lg font-semibold text-slate-900">{cursusDetail.name}</h2>
                    </div>
                    {cursusDetail.formation_label ? (
                      <p className="mt-1 text-sm text-slate-600">
                        Formation : {cursusDetail.formation_label}
                        {cursusDetail.formation_required ? ' (obligatoire)' : ' (optionnelle)'}
                      </p>
                    ) : null}
                    {cursusDetail.signoff_role ? (
                      <p className="mt-0.5 text-xs text-slate-500">
                        Validation par : {cursusDetail.signoff_role}
                      </p>
                    ) : null}
                  </div>
                  {/* Overall progress */}
                  <div className="min-w-[120px] text-right">
                    {(() => {
                      const allComps = cursusDetail.phases.flatMap((p) => p.competences ?? []);
                      const done = allComps.filter((c) => validatedCompetenceIds.has(c.id)).length;
                      return (
                        <>
                          <p className="text-2xl font-bold text-emerald-600">
                            {done}/{allComps.length}
                          </p>
                          <p className="text-xs text-slate-500">compétences validées</p>
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Rules */}
                {cursusDetail.rules.length > 0 ? (
                  <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Règles du cursus
                    </p>
                    <ul className="space-y-1">
                      {cursusDetail.rules.map((r) => (
                        <li key={r.id} className="flex items-start gap-2 text-sm text-slate-700">
                          <span className="mt-0.5 text-slate-400">{r.auto ? '⚡' : '•'}</span>
                          {r.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>

              {/* View switcher */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
                  {(['parcours', 'carnet'] as ViewMode[]).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setView(v)}
                      className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
                        view === v
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {v === 'parcours' ? 'Parcours' : 'Carnet de doublure'}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDoublureForm({
                        ...EMPTY_DOUBLURE_FORM,
                        phase_id: cursusDetail.phases[0]?.id ?? '',
                      });
                      setDoublureModal(true);
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    + Déclarer une doublure
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const firstComp = cursusDetail.phases
                        .flatMap((p) => p.competences ?? [])
                        .find((c) => !validatedCompetenceIds.has(c.id));
                      setValidationForm({
                        ...EMPTY_VALIDATION_FORM,
                        competence_id: firstComp?.id ?? '',
                      });
                      setValidationModal(true);
                    }}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                  >
                    + Valider une compétence
                  </button>
                </div>
              </div>

              {/* ── PARCOURS view ── */}
              {view === 'parcours' ? (
                <div className="space-y-4">
                  {cursusDetail.phases.map((phase) => {
                    const { validated, total, doublureCount } = getPhaseProgress(phase);
                    return (
                      <div
                        key={phase.id}
                        className="rounded-xl border border-slate-200 bg-white overflow-hidden"
                      >
                        <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <Badge variant={phase.kind === 'pre' ? 'warning' : 'default'}>
                                {phase.kind === 'pre' ? 'Pré-doublure' : 'Post-doublure'}
                              </Badge>
                              <h3 className="font-semibold text-slate-900">{phase.label}</h3>
                            </div>
                            {phase.sub ? (
                              <p className="mt-0.5 text-xs text-slate-500">{phase.sub}</p>
                            ) : null}
                          </div>
                          <div className="text-right text-sm">
                            <span className="font-semibold text-slate-900">
                              {doublureCount}/{phase.min_doublures}
                            </span>
                            <span className="text-slate-500"> doublures</span>
                            {phase.require_externe ? (
                              <Badge variant="pending" >dont 1 externe</Badge>
                            ) : null}
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="px-5 py-3">
                          <div className="mb-1 flex justify-between text-xs text-slate-500">
                            <span>Compétences validées</span>
                            <span>
                              {validated}/{total}
                            </span>
                          </div>
                          <ProgressBar value={validated} max={total} />
                        </div>

                        {/* Competences list */}
                        {(phase.competences ?? []).length > 0 ? (
                          <ul className="divide-y divide-slate-100 px-5 pb-3">
                            {(phase.competences ?? []).map((comp: CursusCompetence) => {
                              const isDone = validatedCompetenceIds.has(comp.id);
                              const val = validations.find(
                                (v) => v.competence_id === comp.id
                              );
                              return (
                                <li key={comp.id} className="flex items-start gap-3 py-2.5">
                                  <div
                                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
                                      isDone
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : 'bg-slate-100 text-slate-400'
                                    }`}
                                  >
                                    {isDone ? '✓' : comp.order_idx + 1}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-sm ${isDone ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                                      {comp.name}
                                      {comp.garde_only ? (
                                        <span className="ml-1.5 text-xs text-orange-500">(garde)</span>
                                      ) : null}
                                    </p>
                                    {comp.description ? (
                                      <p className="mt-0.5 text-xs text-slate-500">{comp.description}</p>
                                    ) : null}
                                    {isDone && val ? (
                                      <p className="mt-0.5 text-xs text-emerald-600">
                                        Validé le {new Date(val.validated_at).toLocaleDateString('fr-FR')}
                                        {val.event_name ? ` — ${val.event_name}` : ''}
                                        {val.supervisor_name ? ` (sup. ${val.supervisor_name})` : ''}
                                      </p>
                                    ) : null}
                                  </div>
                                  {isDone && val ? (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteValidation(val.id)}
                                      className="shrink-0 text-xs text-slate-400 hover:text-red-500"
                                      aria-label="Supprimer la validation"
                                    >
                                      ✕
                                    </button>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {/* ── CARNET view ── */}
              {view === 'carnet' ? (
                <div className="space-y-3">
                  {doublures.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
                      <p className="text-slate-500">Aucune doublure déclarée.</p>
                    </div>
                  ) : (
                    doublures.map((d) => {
                      const phase = cursusDetail.phases.find((p) => p.id === d.phase_id);
                      return (
                        <div
                          key={d.id}
                          className="flex items-start gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {phase ? (
                                <Badge variant={phase.kind === 'pre' ? 'warning' : 'default'}>
                                  {phase.label}
                                </Badge>
                              ) : null}
                              {d.is_pending ? <Badge variant="pending">En attente</Badge> : null}
                              {d.is_external ? <Badge variant="default">Externe</Badge> : null}
                            </div>
                            <p className="mt-1 font-medium text-slate-900">
                              {d.event_name ?? 'Événement sans nom'}
                            </p>
                            <p className="text-sm text-slate-500">
                              {d.event_date
                                ? new Date(d.event_date).toLocaleDateString('fr-FR')
                                : 'Date inconnue'}
                              {d.event_lieu ? ` — ${d.event_lieu}` : ''}
                            </p>
                            {d.supervisor_name ? (
                              <p className="text-xs text-slate-500">
                                Superviseur : {d.supervisor_name}
                                {d.supervisor_antenne ? ` (${d.supervisor_antenne})` : ''}
                              </p>
                            ) : null}
                            {d.message ? (
                              <p className="mt-1 text-xs italic text-slate-500">&ldquo;{d.message}&rdquo;</p>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteDoublure(d.id)}
                            className="shrink-0 text-xs text-slate-400 hover:text-red-500"
                            aria-label="Supprimer la doublure"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              ) : null}
            </>
          ) : (
            <div className="text-center text-slate-500">Sélectionnez un cursus.</div>
          )}
        </>
      )}

      {/* ── Enroll modal ── */}
      {enrollModal ? (
        <Modal title="Rejoindre un cursus" onClose={() => setEnrollModal(false)}>
          {availableToEnroll.length === 0 ? (
            <p className="text-sm text-slate-600">Vous êtes déjà inscrit à tous les cursus disponibles.</p>
          ) : (
            <ul className="space-y-2">
              {availableToEnroll.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => handleEnroll(c.id)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-left hover:border-emerald-300 hover:bg-emerald-50"
                  >
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono font-semibold text-slate-600">
                        {c.code}
                      </span>
                      <span className="font-medium text-slate-900">{c.name}</span>
                    </div>
                    {c.category ? (
                      <p className="mt-0.5 text-xs text-slate-500">Catégorie : {c.category}</p>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      ) : null}

      {/* ── Declare doublure modal ── */}
      {doublureModal && cursusDetail ? (
        <Modal title="Déclarer une doublure" onClose={() => setDoublureModal(false)}>
          <form onSubmit={handleDoublureSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Phase</label>
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                value={doublureForm.phase_id}
                onChange={(e) =>
                  setDoublureForm((f) => ({ ...f, phase_id: e.target.value }))
                }
                required
              >
                <option value="">— Choisir une phase —</option>
                {cursusDetail.phases.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.kind === 'pre' ? 'Pré' : 'Post'} — {p.label}
                  </option>
                ))}
              </select>
            </div>

            <EventFields
              eventName={doublureForm.event_name}
              eventDate={doublureForm.event_date}
              eventLieu={doublureForm.event_lieu}
              supervisorName={doublureForm.supervisor_name}
              supervisorAntenne={doublureForm.supervisor_antenne}
              onChange={(field, value) =>
                setDoublureForm((f) => ({ ...f, [field]: value }))
              }
            />

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="rounded border-slate-300 text-emerald-600"
                  checked={doublureForm.is_external}
                  onChange={(e) =>
                    setDoublureForm((f) => ({ ...f, is_external: e.target.checked }))
                  }
                />
                Antenne externe
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="rounded border-slate-300 text-amber-500"
                  checked={doublureForm.is_pending}
                  onChange={(e) =>
                    setDoublureForm((f) => ({ ...f, is_pending: e.target.checked }))
                  }
                />
                En attente de confirmation
              </label>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Message (optionnel)
              </label>
              <textarea
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                rows={2}
                value={doublureForm.message}
                onChange={(e) =>
                  setDoublureForm((f) => ({ ...f, message: e.target.value }))
                }
                placeholder="Remarques, contexte…"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDoublureModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={submitting || !doublureForm.phase_id}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {submitting ? 'Enregistrement…' : 'Déclarer'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {/* ── Validate competence modal ── */}
      {validationModal && cursusDetail ? (
        <Modal title="Valider une compétence" onClose={() => setValidationModal(false)}>
          <form onSubmit={handleValidationSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Compétence</label>
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                value={validationForm.competence_id}
                onChange={(e) =>
                  setValidationForm((f) => ({ ...f, competence_id: e.target.value }))
                }
                required
              >
                <option value="">— Choisir une compétence —</option>
                {cursusDetail.phases.flatMap((p) =>
                  (p.competences ?? []).map((c: CursusCompetence) => (
                    <option
                      key={c.id}
                      value={c.id}
                      disabled={validatedCompetenceIds.has(c.id)}
                    >
                      {validatedCompetenceIds.has(c.id) ? '✓ ' : ''}
                      [{p.kind === 'pre' ? 'Pré' : 'Post'}] {c.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <EventFields
              eventName={validationForm.event_name}
              eventDate={validationForm.event_date}
              eventLieu={validationForm.event_lieu}
              supervisorName={validationForm.supervisor_name}
              supervisorAntenne={validationForm.supervisor_antenne}
              onChange={(field, value) =>
                setValidationForm((f) => ({ ...f, [field]: value }))
              }
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setValidationModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={submitting || !validationForm.competence_id}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {submitting ? 'Enregistrement…' : 'Valider'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}