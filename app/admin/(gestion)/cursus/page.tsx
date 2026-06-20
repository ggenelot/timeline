'use client';

import { useEffect, useState } from 'react';
import type {
  Cursus,
  CursusRule,
  CursusPhase,
  CursusCompetence,
} from '@/lib/types';
import {
  getAllCursus,
  getCursusWithDetails,
  upsertCursus,
  upsertCursusRule,
  deleteCursusRule,
  upsertCursusPhase,
  upsertCursusCompetence,
  deleteCursusCompetence,
} from '@/lib/queries/cursus';

type CursusDetail = Cursus & { rules: CursusRule[]; phases: CursusPhase[] };

// ── Tiny helpers ──────────────────────────────────────────────

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-700">{label}</label>
      <input
        type={type}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
      {children}
    </h3>
  );
}

// ── Identité card editor ──────────────────────────────────────

function IdentityEditor({
  cursus,
  onSaved,
}: {
  cursus: CursusDetail;
  onSaved: (c: Cursus) => void;
}) {
  const [code, setCode] = useState(cursus.code);
  const [name, setName] = useState(cursus.name);
  const [category, setCategory] = useState(cursus.category ?? '');
  const [level, setLevel] = useState(String(cursus.level ?? ''));
  const [formationLabel, setFormationLabel] = useState(cursus.formation_label ?? '');
  const [formationRequired, setFormationRequired] = useState(cursus.formation_required);
  const [signoffRole, setSignoffRole] = useState(cursus.signoff_role);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await upsertCursus({
        id: cursus.id,
        code,
        name,
        category: category || null,
        level: level ? Number(level) : null,
        formation_label: formationLabel || null,
        formation_required: formationRequired,
        signoff_role: signoffRole,
      });
      onSaved(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Input label="Code" value={code} onChange={setCode} placeholder="ex : CE" />
        <Input label="Niveau" value={level} onChange={setLevel} type="number" placeholder="1–5" />
      </div>
      <Input label="Nom complet" value={name} onChange={setName} placeholder="Chef d'Équipe" />
      <Input label="Catégorie" value={category} onChange={setCategory} placeholder="Opérationnel" />
      <Input label="Formation" value={formationLabel} onChange={setFormationLabel} placeholder="Nom de la formation associée" />
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="rounded border-slate-300 text-emerald-600"
            checked={formationRequired}
            onChange={(e) => setFormationRequired(e.target.checked)}
          />
          Formation obligatoire
        </label>
      </div>
      <Input
        label="Rôle signataire"
        value={signoffRole}
        onChange={setSignoffRole}
        placeholder="Président-Délégué"
      />
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {saved ? 'Enregistré ✓' : saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  );
}

// ── Rules editor ──────────────────────────────────────────────

function RulesEditor({
  cursusId,
  rules: initialRules,
}: {
  cursusId: string;
  rules: CursusRule[];
}) {
  const [rules, setRules] = useState<CursusRule[]>(initialRules);
  const [newText, setNewText] = useState('');
  const [newAuto, setNewAuto] = useState(false);
  const [saving, setSaving] = useState(false);

  async function addRule() {
    if (!newText.trim()) return;
    setSaving(true);
    try {
      const created = await upsertCursusRule({
        cursus_id: cursusId,
        text: newText.trim(),
        auto: newAuto,
        order_idx: rules.length,
      });
      setRules((prev) => [...prev, created]);
      setNewText('');
      setNewAuto(false);
    } finally {
      setSaving(false);
    }
  }

  async function removeRule(id: string) {
    await deleteCursusRule(id);
    setRules((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {rules.map((r) => (
          <li
            key={r.id}
            className="flex items-start gap-3 rounded-lg bg-slate-50 px-3 py-2.5"
          >
            <span className="mt-0.5 text-slate-400">{r.auto ? '⚡' : '•'}</span>
            <span className="flex-1 text-sm text-slate-700">{r.text}</span>
            <button
              type="button"
              onClick={() => removeRule(r.id)}
              className="shrink-0 text-xs text-slate-400 hover:text-red-500"
              aria-label="Supprimer la règle"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            placeholder="Nouvelle règle…"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRule(); } }}
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 whitespace-nowrap">
          <input
            type="checkbox"
            className="rounded border-slate-300 text-emerald-600"
            checked={newAuto}
            onChange={(e) => setNewAuto(e.target.checked)}
          />
          Automatique
        </label>
        <button
          type="button"
          onClick={addRule}
          disabled={saving || !newText.trim()}
          className="shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
        >
          Ajouter
        </button>
      </div>
    </div>
  );
}

// ── Competence item ───────────────────────────────────────────

function CompetenceRow({
  comp,
  onDelete,
}: {
  comp: CursusCompetence;
  onDelete: (id: string) => void;
}) {
  return (
    <li className="flex items-start gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
      <span className="mt-0.5 shrink-0 text-xs text-slate-400">{comp.order_idx + 1}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800">
          {comp.name}
          {comp.garde_only ? (
            <span className="ml-1.5 text-xs font-normal text-orange-500">(garde)</span>
          ) : null}
        </p>
        {comp.description ? (
          <p className="mt-0.5 text-xs text-slate-500">{comp.description}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onDelete(comp.id)}
        className="shrink-0 text-xs text-slate-400 hover:text-red-500"
        aria-label="Supprimer la compétence"
      >
        ✕
      </button>
    </li>
  );
}

// ── Phase editor ──────────────────────────────────────────────

function PhaseEditor({
  phase: initialPhase,
  cursusId,
  onPhaseUpdated,
}: {
  phase: CursusPhase;
  cursusId: string;
  onPhaseUpdated: (p: CursusPhase) => void;
}) {
  const [phase, setPhase] = useState<CursusPhase>(initialPhase);
  const [newCompName, setNewCompName] = useState('');
  const [newCompDesc, setNewCompDesc] = useState('');
  const [newCompGarde, setNewCompGarde] = useState(false);
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const comps = phase.competences ?? [];

  async function savePhaseField(field: Partial<CursusPhase>) {
    const updated = await upsertCursusPhase({ ...phase, ...field, cursus_id: cursusId });
    const merged = { ...updated, competences: phase.competences };
    setPhase(merged);
    onPhaseUpdated(merged);
  }

  async function addCompetence() {
    if (!newCompName.trim()) return;
    setAdding(true);
    try {
      const created = await upsertCursusCompetence({
        phase_id: phase.id,
        name: newCompName.trim(),
        description: newCompDesc.trim() || null,
        garde_only: newCompGarde,
        order_idx: comps.length,
      });
      const merged = { ...phase, competences: [...comps, created] };
      setPhase(merged);
      onPhaseUpdated(merged);
      setNewCompName('');
      setNewCompDesc('');
      setNewCompGarde(false);
    } finally {
      setAdding(false);
    }
  }

  async function deleteComp(id: string) {
    await deleteCursusCompetence(id);
    const merged = { ...phase, competences: comps.filter((c) => c.id !== id) };
    setPhase(merged);
    onPhaseUpdated(merged);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-slate-50"
      >
        <span className={`text-slate-400 transition-transform ${expanded ? 'rotate-90' : ''}`}>
          ▶
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            phase.kind === 'pre'
              ? 'bg-orange-100 text-orange-700'
              : 'bg-slate-100 text-slate-600'
          }`}
        >
          {phase.kind === 'pre' ? 'Pré' : 'Post'}
        </span>
        <span className="font-semibold text-slate-900">{phase.label}</span>
        <span className="ml-auto text-xs text-slate-400">
          {comps.length} compétence{comps.length !== 1 ? 's' : ''}
        </span>
      </button>

      {expanded ? (
        <div className="border-t border-slate-100 px-5 pb-5 pt-4 space-y-5">
          {/* Phase config */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Label</label>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                value={phase.label}
                onChange={(e) => setPhase((p) => ({ ...p, label: e.target.value }))}
                onBlur={() => savePhaseField({ label: phase.label })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Min doublures</label>
              <input
                type="number"
                min={0}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                value={phase.min_doublures}
                onChange={(e) => setPhase((p) => ({ ...p, min_doublures: Number(e.target.value) }))}
                onBlur={() => savePhaseField({ min_doublures: phase.min_doublures })}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Sous-titre</label>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              value={phase.sub ?? ''}
              onChange={(e) => setPhase((p) => ({ ...p, sub: e.target.value }))}
              onBlur={() => savePhaseField({ sub: phase.sub })}
              placeholder="Description courte de la phase"
            />
          </div>
          <div className="flex items-center gap-5">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="rounded border-slate-300 text-amber-500"
                checked={phase.provisional}
                onChange={(e) => {
                  const val = e.target.checked;
                  setPhase((p) => ({ ...p, provisional: val }));
                  savePhaseField({ provisional: val });
                }}
              />
              Phase provisoire
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="rounded border-slate-300 text-emerald-600"
                checked={phase.require_externe}
                onChange={(e) => {
                  const val = e.target.checked;
                  setPhase((p) => ({ ...p, require_externe: val }));
                  savePhaseField({ require_externe: val });
                }}
              />
              Doublure externe requise
            </label>
          </div>

          {/* Competences list */}
          <div>
            <SectionTitle>Compétences ({comps.length})</SectionTitle>
            {comps.length > 0 ? (
              <ul className="mb-3 space-y-1.5">
                {comps.map((c: CursusCompetence) => (
                  <CompetenceRow key={c.id} comp={c} onDelete={deleteComp} />
                ))}
              </ul>
            ) : (
              <p className="mb-3 text-sm text-slate-500">Aucune compétence.</p>
            )}
            {/* Add competence */}
            <div className="rounded-lg border border-dashed border-slate-300 p-3 space-y-2">
              <input
                className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
                placeholder="Nom de la compétence…"
                value={newCompName}
                onChange={(e) => setNewCompName(e.target.value)}
              />
              <input
                className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
                placeholder="Description (optionnel)"
                value={newCompDesc}
                onChange={(e) => setNewCompDesc(e.target.value)}
              />
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 text-orange-500"
                    checked={newCompGarde}
                    onChange={(e) => setNewCompGarde(e.target.checked)}
                  />
                  Garde uniquement
                </label>
                <button
                  type="button"
                  onClick={addCompetence}
                  disabled={adding || !newCompName.trim()}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {adding ? 'Ajout…' : '+ Ajouter'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Main admin page ────────────────────────────────────────────

export default function AdminCursusPage() {
  const [allCursus, setAllCursus] = useState<Cursus[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CursusDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New cursus form
  const [showNewForm, setShowNewForm] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newPhaseLabel, setNewPhaseLabel] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const list = await getAllCursus();
        setAllCursus(list);
        if (list.length > 0) setSelectedId(list[0].id);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    async function loadDetail() {
      try {
        const d = await getCursusWithDetails(selectedId!);
        setDetail(d);
      } catch (e) {
        setError((e as Error).message);
      }
    }
    loadDetail();
  }, [selectedId]);

  async function createCursus(e: React.FormEvent) {
    e.preventDefault();
    if (!newCode.trim() || !newName.trim()) return;
    setCreating(true);
    try {
      const created = await upsertCursus({ code: newCode.trim(), name: newName.trim() });
      if (newPhaseLabel.trim()) {
        await upsertCursusPhase({
          cursus_id: created.id,
          kind: 'pre',
          label: newPhaseLabel.trim(),
          order_idx: 0,
        });
      }
      setAllCursus((prev) => [...prev, created]);
      setSelectedId(created.id);
      setShowNewForm(false);
      setNewCode('');
      setNewName('');
      setNewPhaseLabel('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  function handlePhaseUpdated(updated: CursusPhase) {
    setDetail((d) =>
      d
        ? {
            ...d,
            phases: d.phases.map((p) => (p.id === updated.id ? updated : p)),
          }
        : d
    );
  }

  async function addPhase(kind: 'pre' | 'post') {
    if (!detail) return;
    try {
      const label = kind === 'pre' ? 'Pré-doublure' : 'Post-doublure';
      const created = await upsertCursusPhase({
        cursus_id: detail.id,
        kind,
        label,
        order_idx: detail.phases.filter((p) => p.kind === kind).length,
      });
      setDetail((d) => d ? { ...d, phases: [...d.phases, { ...created, competences: [] }] } : d);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-slate-500">Chargement…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Configuration des cursus</h1>
          <p className="mt-1 text-sm text-slate-600">
            Gérez les cursus de doublure, leurs phases et leurs compétences.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNewForm((v) => !v)}
          className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          + Nouveau cursus
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {/* New cursus mini form */}
      {showNewForm ? (
        <form
          onSubmit={createCursus}
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-3"
        >
          <p className="text-sm font-semibold text-emerald-800">Nouveau cursus</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Code" value={newCode} onChange={setNewCode} placeholder="ex : CE" />
            <Input label="Nom" value={newName} onChange={setNewName} placeholder="Chef d'Équipe" />
          </div>
          <Input
            label="Première phase (optionnel)"
            value={newPhaseLabel}
            onChange={setNewPhaseLabel}
            placeholder="Pré-doublure"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowNewForm(false)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={creating || !newCode.trim() || !newName.trim()}
              className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {creating ? 'Création…' : 'Créer'}
            </button>
          </div>
        </form>
      ) : null}

      {/* Cursus tabs */}
      {allCursus.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto">
          {allCursus.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedId(c.id)}
              className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                selectedId === c.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {c.code}
            </button>
          ))}
        </div>
      ) : null}

      {detail ? (
        <div className="space-y-6">
          {/* Identity */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <SectionTitle>Carte d&apos;identité</SectionTitle>
            <IdentityEditor
              cursus={detail}
              onSaved={(updated) =>
                setDetail((d) => (d ? { ...d, ...updated } : d))
              }
            />
          </div>

          {/* Rules */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <SectionTitle>Règles ({detail.rules.length})</SectionTitle>
            <RulesEditor cursusId={detail.id} rules={detail.rules} />
          </div>

          {/* Phases */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <SectionTitle>Phases ({detail.phases.length})</SectionTitle>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => addPhase('pre')}
                  className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-700 hover:bg-orange-100"
                >
                  + Pré-doublure
                </button>
                <button
                  type="button"
                  onClick={() => addPhase('post')}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  + Post-doublure
                </button>
              </div>
            </div>
            {detail.phases.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center">
                <p className="text-slate-500">Aucune phase configurée.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {detail.phases
                  .sort((a, b) => a.order_idx - b.order_idx)
                  .map((phase) => (
                    <PhaseEditor
                      key={phase.id}
                      phase={phase}
                      cursusId={detail.id}
                      onPhaseUpdated={handlePhaseUpdated}
                    />
                  ))}
              </div>
            )}
          </div>
        </div>
      ) : allCursus.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
          <p className="text-slate-500">Aucun cursus configuré. Créez-en un pour commencer.</p>
        </div>
      ) : null}
    </div>
  );
}
