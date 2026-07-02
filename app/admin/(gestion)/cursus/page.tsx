'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { supabase } from '@/lib/supabase/client';
import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Toggle } from '@/components/ui/toggle';
import { cn } from '@/lib/cn';
import type {
  Cursus,
  CursusRule,
  CursusPhase,
  CursusCompetence,
  RoleBehavior,
} from '@/lib/types';
import {
  getAllCursus,
  getCursusWithDetails,
  upsertCursus,
  deleteCursus,
  reorderCursusRules,
  reorderCursusCompetences,
  reorderCursusPhases,
  upsertCursusRule,
  deleteCursusRule,
  upsertCursusPhase,
  deleteCursusPhase,
  upsertCursusCompetence,
  deleteCursusCompetence,
} from '@/lib/queries/cursus';

// ── Types ─────────────────────────────────────────────────────

type CursusDetail = Cursus & { rules: CursusRule[]; phases: CursusPhase[] };

type SkillOption = {
  id: string;
  code: string | null;
  name: string;
  level: number | null;
  catLabel: string;
  dot: string;
};

type CompModal = {
  phaseId: string;
  compId?: string;
  name: string;
  description: string;
  gardeOnly: boolean;
};

type PhaseModal = {
  phaseId?: string;
  label: string;
  sub: string;
  minDoublures: number;
  minExterne: number;
};

// ── Drag handle ───────────────────────────────────────────────

function DragHandle({
  attributes,
  listeners,
  style,
}: {
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
  style?: React.CSSProperties;
}) {
  return (
    <span
      {...attributes}
      {...listeners}
      title="Glisser pour réordonner"
      className="shrink-0 cursor-grab touch-none leading-none"
      style={style}
    >
      <Icon name="drag_indicator" className="text-ink-3" />
    </span>
  );
}

// ── Stepper ────────────────────────────────────────────────────

function Stepper({ value, onChange, max }: { value: number; onChange: (v: number) => void; max?: number }) {
  const atMax = max !== undefined && value >= max;
  return (
    <div className="inline-flex items-center overflow-hidden rounded-[9px] border border-line-field">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        className="h-[34px] w-8 cursor-pointer bg-surface-sub text-[17px] font-bold text-ink-2"
      >
        −
      </button>
      <span className="min-w-[38px] text-center text-[15px] font-extrabold text-ink">
        {value}
      </span>
      <button
        type="button"
        onClick={() => { if (!atMax) onChange(value + 1); }}
        disabled={atMax}
        className="h-[34px] w-8 cursor-pointer bg-surface-sub text-[17px] font-bold text-ink-2 disabled:cursor-not-allowed disabled:opacity-40"
      >
        +
      </button>
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
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-[rgba(12,19,38,.55)] px-[18px] py-14"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-[520px] overflow-hidden rounded-[18px] bg-surface-card shadow-lift">
        <div className="flex items-start justify-between gap-3 border-b border-line-row px-5 pb-[14px] pt-[18px]">
          <div>
            <div className="text-[17px] font-extrabold text-ink">{title}</div>
            {subtitle ? <div className="mt-[3px] text-[12.5px] text-ink-2">{subtitle}</div> : null}
          </div>
          <button type="button" onClick={onClose} className="flex h-[30px] w-[30px] shrink-0 cursor-pointer items-center justify-center rounded-lg bg-surface-sub text-ink-2">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="flex flex-col gap-4 px-5 py-[18px]">{children}</div>
        <div className="flex items-center justify-end gap-2.5 border-t border-line-row bg-surface-sub px-5 py-[14px]">
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant="engage" onClick={onSubmit} disabled={submitDisabled}>{submitLabel}</Button>
        </div>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-[7px] text-[12.5px] font-bold text-ink-2">{children}</div>;
}

// ── Skill picker ───────────────────────────────────────────────

function SkillPicker({
  chosenSkillId,
  chosenSkill,
  onPick,
}: {
  chosenSkillId: string | null;
  chosenSkill: SkillOption | null;
  onPick: (skill: SkillOption | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SkillOption[]>([]);

  async function search(q: string) {
    setQuery(q);
    if (q.length < 1) { setResults([]); return; }
    const { data } = await supabase
      .from('skills')
      .select('id, name, code, level, category:skill_categories(name, color)')
      .or(`name.ilike.%${q}%,code.ilike.%${q}%`)
      .limit(6);
    type RawSkill = { id: string; name: string; code: string | null; level: number | null; category: { name: string; color: string }[] | null };
    setResults(
      (data ?? []).map((r: RawSkill) => {
        const cat = Array.isArray(r.category) ? r.category[0] : r.category;
        return {
          id: r.id,
          code: r.code,
          name: r.name,
          level: r.level,
          catLabel: cat?.name ?? 'Général',
          dot: cat?.color ?? '#5B6478',
        };
      })
    );
  }

  if (chosenSkillId && chosenSkill && !open) {
    return (
      <div className="flex flex-wrap items-center gap-[13px] rounded-[13px] border-[1.5px] border-[#CFDDF6] bg-[#EEF4FE] px-[15px] py-[13px]">
        <span className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] text-[12.5px] font-extrabold text-white" style={{ background: chosenSkill.dot }}>
          {chosenSkill.code ?? '?'}
        </span>
        <div className="min-w-0">
          <div className="text-base font-extrabold tracking-[-0.01em] text-ink">{chosenSkill.name}</div>
          <div className="mt-0.5 text-[12.5px] text-ink-2">
            {chosenSkill.code} · {chosenSkill.catLabel}{chosenSkill.level ? ` · Niveau ${chosenSkill.level}` : ''}
          </div>
        </div>
        <Button variant="ghost" onClick={() => { setOpen(true); setQuery(''); }} className="ml-auto px-[13px] py-[7px] text-[12.5px]">Changer</Button>
      </div>
    );
  }

  return (
    <div>
      <input
        value={query}
        onChange={(e) => search(e.target.value)}
        placeholder="Rechercher : code ou nom (ex : CE, Chef d'Équipe)…"
        className="w-full rounded-[9px] border border-line-field px-3 py-2.5 text-sm text-ink outline-none"
      />
      {results.length > 0 ? (
        <div className="mt-[7px] flex max-h-[248px] flex-col gap-[5px] overflow-y-auto">
          {results.map((o) => (
            <button key={o.id} type="button" onClick={() => { onPick(o); setOpen(false); setQuery(''); }} className="flex cursor-pointer items-center gap-[11px] rounded-[9px] border border-line bg-surface-card px-[11px] py-2 text-left">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-extrabold text-white" style={{ background: o.dot }}>{o.code ?? '?'}</span>
              <div className="min-w-0">
                <div className="text-[13.5px] text-ink-2"><span className="font-bold text-ink">{o.code ?? o.name}</span>{o.code ? ` — ${o.name}` : ''}</div>
                <div className="text-[11.5px] text-ink-3">{o.catLabel}{o.level ? ` · Niveau ${o.level}` : ''}</div>
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ── Sortable rule row ─────────────────────────────────────────

function SortableRuleRow({
  rule,
  onToggleAuto,
  onRemove,
}: {
  rule: CursusRule;
  onToggleAuto: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: rule.id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex items-center gap-[11px] rounded-[11px] border border-line-row bg-surface-sub px-[13px] py-2.5',
        isDragging ? 'opacity-60 shadow-lift' : ''
      )}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 1 : 'auto',
      }}
    >
      <DragHandle attributes={attributes} listeners={listeners} />
      <span className={cn(
        'inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold',
        rule.auto ? 'bg-[#1E3C87] text-white' : 'bg-line text-ink-3'
      )}>
        {rule.auto ? '⚡' : '·'}
      </span>
      <span className="min-w-0 flex-1 text-[13px] leading-snug text-ink-2">{rule.text}</span>
      <button type="button" onClick={onToggleAuto} className={cn(
        'shrink-0 cursor-pointer rounded-md border px-[9px] py-[3px] text-[11px] font-extrabold',
        rule.auto ? 'border-[#CFDDF6] bg-[#EEF4FE] text-[#1E3C87]' : 'border-line bg-surface-card text-ink-3'
      )}>Auto</button>
      <button type="button" onClick={onRemove} className="shrink-0 cursor-pointer bg-transparent px-1.5 py-[3px] text-[15px] text-bad" aria-label="Supprimer">✕</button>
    </div>
  );
}

// ── Sortable competence row ───────────────────────────────────

function SortableCompetenceRow({
  comp,
  onEdit,
  onRemove,
}: {
  comp: CursusCompetence;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: comp.id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex items-start gap-2.5 rounded-xl border border-line-row bg-surface-sub px-[13px] py-[11px]',
        isDragging ? 'opacity-60 shadow-lift' : ''
      )}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 1 : 'auto',
      }}
    >
      <DragHandle attributes={attributes} listeners={listeners} style={{ marginTop: 3 }} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-ink">{comp.name}</span>
          {comp.garde_only ? (
            <span className="rounded-[5px] border border-[#E3D6EF] bg-[#F5EDFA] px-[7px] py-px text-[10.5px] font-bold text-[#7A2E86]">Garde uniquement</span>
          ) : null}
        </div>
        {comp.description ? <div className="mt-[3px] text-[12.5px] leading-snug text-ink-2">{comp.description}</div> : null}
      </div>
      <span className="inline-flex shrink-0 items-center gap-1">
        <button type="button" onClick={onEdit}
          className="cursor-pointer rounded-[7px] border border-line-field bg-surface-card px-2.5 py-[5px] text-xs font-bold text-ink-2">
          Modifier
        </button>
        <button type="button" onClick={onRemove} aria-label="Supprimer"
          className="cursor-pointer bg-transparent px-1.5 py-1 text-[15px] text-bad">✕</button>
      </span>
    </div>
  );
}

// ── Sortable phase card ───────────────────────────────────────

function SortablePhaseCard({
  phase,
  index,
  sensors,
  onEditPhase,
  onDeletePhase,
  onCompDragEnd,
  onAddComp,
  onEditComp,
  onRemoveComp,
}: {
  phase: CursusPhase;
  index: number;
  sensors: ReturnType<typeof useSensors>;
  onEditPhase: () => void;
  onDeletePhase: () => void;
  onCompDragEnd: (event: DragEndEvent) => void;
  onAddComp: () => void;
  onEditComp: (comp: CursusCompetence) => void;
  onRemoveComp: (compId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: phase.id });
  const comps = (phase.competences ?? []) as CursusCompetence[];

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'relative mb-4 overflow-hidden rounded-2xl border border-line bg-surface-card',
        isDragging ? 'opacity-85 shadow-lift' : 'shadow-card'
      )}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 5 : 'auto',
      }}
    >
      {/* Phase header */}
      <div className="border-b border-line-row px-[22px] pb-[15px] pt-4">
        <div className="flex flex-wrap items-center gap-[11px]">
          <DragHandle attributes={attributes} listeners={listeners} />
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-extrabold text-white">
            {index + 1}
          </span>
          <span className="text-base font-extrabold text-ink">{phase.label}</span>
          <span className="ml-auto inline-flex items-center gap-1.5">
            <span className="mr-1 text-xs font-bold text-ink-2">
              {comps.length} compétence{comps.length !== 1 ? 's' : ''}
            </span>
            <button type="button" onClick={onEditPhase}
              className="cursor-pointer rounded-[7px] border border-line-field bg-surface-card px-2.5 py-[5px] text-xs font-bold text-ink-2">
              Modifier
            </button>
            <button type="button" onClick={onDeletePhase} aria-label="Supprimer la phase"
              className="cursor-pointer bg-transparent px-1.5 py-1 text-[15px] text-bad">✕</button>
          </span>
        </div>
        {phase.sub ? (
          <div className="mt-[9px] text-[12.5px] leading-relaxed text-ink-2">{phase.sub}</div>
        ) : null}
        {/* Doublure requirements summary */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-[7px] border border-line bg-surface-sub px-2.5 py-1 text-xs font-bold text-ink-2">
            {phase.min_doublures} doublure{phase.min_doublures !== 1 ? 's' : ''} min.
          </span>
          {phase.min_externe > 0 ? (
            <span className="rounded-[7px] border border-warn-line bg-warn-soft px-2.5 py-1 text-xs font-bold text-warn-text">
              dont {phase.min_externe} extérieure{phase.min_externe !== 1 ? 's' : ''}
            </span>
          ) : null}
        </div>
      </div>

      {/* Competences */}
      <div className="px-[22px] pb-[18px] pt-[14px]">
        <div className="mb-[11px] text-xs font-extrabold uppercase tracking-[.04em] text-ink-3">
          Compétences à valider
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onCompDragEnd}>
          <SortableContext items={comps.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-2">
              {comps.length === 0 ? (
                <div className="p-0.5 text-[12.5px] text-ink-3">Aucune compétence dans cette phase.</div>
              ) : comps.map((c) => (
                <SortableCompetenceRow key={c.id} comp={c} onEdit={() => onEditComp(c)} onRemove={() => onRemoveComp(c.id)} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <button type="button" onClick={onAddComp}
          className="mt-[11px] w-full cursor-pointer rounded-[10px] border border-dashed border-line-field bg-surface-card px-[14px] py-2.5 text-left text-[13px] font-bold text-brand">
          + Ajouter une compétence
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────

export default function AdminCursusPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [allCursus, setAllCursus] = useState<Cursus[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CursusDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [linkedSkill, setLinkedSkill] = useState<SkillOption | null>(null);
  const [savingSkill, setSavingSkill] = useState(false);
  const [rules, setRules] = useState<CursusRule[]>([]);
  const [ruleDraft, setRuleDraft] = useState('');
  const [addingRule, setAddingRule] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newSkill, setNewSkill] = useState<SkillOption | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingCursus, setDeletingCursus] = useState(false);
  const [compModal, setCompModal] = useState<CompModal | null>(null);
  const [savingComp, setSavingComp] = useState(false);
  const [phaseModal, setPhaseModal] = useState<PhaseModal | null>(null);
  const [savingPhase, setSavingPhase] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    async function checkAccess() {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        router.replace('/login');
        return;
      }
      const { data: profileData } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', authData.user.id)
        .single();
      if (profileData?.role === 'admin') {
        setAllowed(true);
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const tok = sessionData.session?.access_token ?? '';
      const res = await fetch('/api/roles/mine', { headers: { Authorization: `Bearer ${tok}` } });
      if (res.ok) {
        const { behaviors } = (await res.json()) as { behaviors: RoleBehavior[] };
        setAllowed(behaviors.some((b) => b.resource_type === 'cursus' && b.behavior_type === 'can_manage'));
      } else {
        setAllowed(false);
      }
    }
    void checkAccess();
  }, [router]);

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
        if (d) {
          setRules(d.rules);
          if (d.skill_id) {
            const { data } = await supabase
              .from('skills')
              .select('id, name, code, level, category:skill_categories(name, color)')
              .eq('id', d.skill_id)
              .single();
            if (data) {
              const cat = Array.isArray(data.category) ? (data.category as { name: string; color: string }[])[0] : (data.category as { name: string; color: string } | null);
              setLinkedSkill({
                id: data.id,
                code: data.code,
                name: data.name,
                level: data.level,
                catLabel: cat?.name ?? 'Général',
                dot: cat?.color ?? '#5B6478',
              });
            }
          } else {
            setLinkedSkill(null);
          }
        }
      } catch (e) {
        setError((e as Error).message);
      }
    }
    loadDetail();
  }, [selectedId]);

  const totalComps = detail?.phases.reduce((s, p) => s + (p.competences?.length ?? 0), 0) ?? 0;
  const totalMinDoublures = detail?.phases.reduce((s, p) => s + p.min_doublures, 0) ?? 0;

  function deriveFromSkill(skill: SkillOption) {
    const code = skill.code ?? skill.name.slice(0, 6).toUpperCase();
    return { skill_id: skill.id, code, name: skill.name, category: skill.catLabel, level: skill.level };
  }

  async function createCursusFromSkill() {
    if (!newSkill) return;
    setCreating(true);
    try {
      const created = await upsertCursus({ ...deriveFromSkill(newSkill) });
      setAllCursus((prev) => [...prev, created]);
      setDetail({ ...created, rules: [], phases: [] });
      setSelectedId(created.id);
      setShowNewModal(false);
      setNewSkill(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function handleLinkSkill(skill: SkillOption | null) {
    if (!detail) return;
    setLinkedSkill(skill);
    setSavingSkill(true);
    try {
      const derived = skill ? deriveFromSkill(skill) : { skill_id: null };
      const updated = await upsertCursus({ ...detail, ...derived });
      setDetail((d) => d ? { ...d, ...updated } : d);
      setAllCursus((prev) => prev.map((c) => c.id === updated.id ? updated : c));
    } finally {
      setSavingSkill(false);
    }
  }

  async function handleDeleteCursus() {
    if (!detail) return;
    if (allCursus.length <= 1) {
      setError('Impossible de supprimer le dernier cursus restant.');
      return;
    }
    if (!window.confirm(`Supprimer le cursus « ${detail.name} » ? Cette action est irréversible.`)) return;
    setDeletingCursus(true);
    try {
      await deleteCursus(detail.id);
      const remaining = allCursus.filter((c) => c.id !== detail.id);
      setAllCursus(remaining);
      setSelectedId(remaining[0]?.id ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeletingCursus(false);
    }
  }

  async function addRule() {
    if (!ruleDraft.trim() || !detail) return;
    setAddingRule(true);
    try {
      const created = await upsertCursusRule({ cursus_id: detail.id, text: ruleDraft.trim(), auto: false, order_idx: rules.length });
      setRules((prev) => [...prev, created]);
      setRuleDraft('');
    } finally {
      setAddingRule(false);
    }
  }

  async function toggleRuleAuto(rule: CursusRule) {
    const updated = await upsertCursusRule({ ...rule, auto: !rule.auto });
    setRules((prev) => prev.map((r) => (r.id === rule.id ? updated : r)));
  }

  async function removeRule(id: string) {
    await deleteCursusRule(id);
    setRules((prev) => prev.filter((r) => r.id !== id));
  }

  async function handleRuleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = rules.findIndex((r) => r.id === active.id);
    const newIndex = rules.findIndex((r) => r.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(rules, oldIndex, newIndex).map((r, i) => ({ ...r, order_idx: i }));
    setRules(next);
    try {
      await reorderCursusRules(next.map((r) => ({ id: r.id, order_idx: r.order_idx })));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleCompDragEnd(phaseId: string, event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const phase = detail?.phases.find((p) => p.id === phaseId);
    if (!phase) return;
    const comps = (phase.competences ?? []) as CursusCompetence[];
    const oldIndex = comps.findIndex((c) => c.id === active.id);
    const newIndex = comps.findIndex((c) => c.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(comps, oldIndex, newIndex).map((c, i) => ({ ...c, order_idx: i }));
    setDetail((d) => d ? { ...d, phases: d.phases.map((p) => p.id === phaseId ? { ...p, competences: next } : p) } : d);
    try {
      await reorderCursusCompetences(next.map((c) => ({ id: c.id, order_idx: c.order_idx })));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function openAddPhase() {
    setPhaseModal({ label: '', sub: '', minDoublures: 1, minExterne: 0 });
  }

  function openEditPhase(phase: CursusPhase) {
    setPhaseModal({ phaseId: phase.id, label: phase.label, sub: phase.sub ?? '', minDoublures: phase.min_doublures, minExterne: phase.min_externe });
  }

  async function submitPhase() {
    if (!phaseModal || !phaseModal.label.trim() || !detail) return;
    setSavingPhase(true);
    try {
      const existing = phaseModal.phaseId ? detail.phases.find((p) => p.id === phaseModal.phaseId) : undefined;
      const minExterne = Math.min(phaseModal.minExterne, phaseModal.minDoublures);
      const saved = await upsertCursusPhase({
        ...(phaseModal.phaseId ? { id: phaseModal.phaseId } : {}),
        cursus_id: detail.id,
        label: phaseModal.label.trim(),
        sub: phaseModal.sub.trim() || null,
        min_doublures: phaseModal.minDoublures,
        min_externe: minExterne,
        order_idx: existing?.order_idx ?? detail.phases.length,
      });
      setDetail((d) => {
        if (!d) return d;
        if (phaseModal.phaseId) {
          return { ...d, phases: d.phases.map((p) => p.id === phaseModal.phaseId ? { ...saved, competences: p.competences } : p) };
        }
        return { ...d, phases: [...d.phases, { ...saved, competences: [] }] };
      });
      setPhaseModal(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingPhase(false);
    }
  }

  async function deletePhase(phase: CursusPhase) {
    if (!detail) return;
    try {
      await deleteCursusPhase(phase.id);
      setDetail((d) => d ? { ...d, phases: d.phases.filter((p) => p.id !== phase.id) } : d);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handlePhaseDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !detail) return;
    const ordered = [...detail.phases].sort((a, b) => a.order_idx - b.order_idx);
    const oldIndex = ordered.findIndex((p) => p.id === active.id);
    const newIndex = ordered.findIndex((p) => p.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(ordered, oldIndex, newIndex).map((p, i) => ({ ...p, order_idx: i }));
    setDetail((d) => d ? { ...d, phases: next } : d);
    try {
      await reorderCursusPhases(next.map((p) => ({ id: p.id, order_idx: p.order_idx })));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function openAddComp(phaseId: string) {
    setCompModal({ phaseId, name: '', description: '', gardeOnly: false });
  }

  function openEditComp(phaseId: string, comp: CursusCompetence) {
    setCompModal({ phaseId, compId: comp.id, name: comp.name, description: comp.description ?? '', gardeOnly: comp.garde_only });
  }

  async function submitComp() {
    if (!compModal || !compModal.name.trim()) return;
    setSavingComp(true);
    try {
      const phase = detail?.phases.find((p) => p.id === compModal.phaseId);
      const existing = compModal.compId ? phase?.competences?.find((c) => c.id === compModal.compId) : undefined;
      const saved = await upsertCursusCompetence({
        ...(compModal.compId ? { id: compModal.compId } : {}),
        phase_id: compModal.phaseId,
        name: compModal.name.trim(),
        description: compModal.description.trim() || null,
        garde_only: compModal.gardeOnly,
        order_idx: existing?.order_idx ?? (phase?.competences?.length ?? 0),
      });
      setDetail((d) => {
        if (!d) return d;
        return {
          ...d,
          phases: d.phases.map((p) => {
            if (p.id !== compModal.phaseId) return p;
            const comps = p.competences ?? [];
            if (compModal.compId) return { ...p, competences: comps.map((c) => c.id === compModal.compId ? saved : c) };
            return { ...p, competences: [...comps, saved] };
          }),
        };
      });
      setCompModal(null);
    } finally {
      setSavingComp(false);
    }
  }

  async function deleteComp(phaseId: string, compId: string) {
    await deleteCursusCompetence(compId);
    setDetail((d) => d ? { ...d, phases: d.phases.map((p) => p.id !== phaseId ? p : { ...p, competences: (p.competences ?? []).filter((c) => c.id !== compId) }) } : d);
  }

  if (allowed === null) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-ink-3">Chargement…</p>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="rounded-lg border border-bad/30 bg-bad-soft p-4 text-sm text-bad">
        Accès refusé.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-ink-3">Chargement…</p>
      </div>
    );
  }

  const orderedPhases = [...(detail?.phases ?? [])].sort((a, b) => a.order_idx - b.order_idx);

  return (
    <div className="pb-20">

      {/* Page heading */}
      <PageHeader
        title="Cursus de doublure"
        subtitle="Définissez les cursus, leurs règles, puis composez librement leurs phases : nom, description, doublures requises et compétences à valider. L'ordre des phases et des compétences détermine leur progression dans la fiche."
      />

      {error ? (
        <div className="mb-4 rounded-[10px] border border-bad/30 bg-bad-soft px-4 py-3 text-[13px] text-bad">
          {error}
        </div>
      ) : null}

      {/* Cursus tabs */}
      <div className="mb-[18px] flex flex-wrap items-center gap-2">
        {allCursus.map((c) => {
          const isActive = selectedId === c.id;
          return (
            <button key={c.id} type="button" onClick={() => setSelectedId(c.id)}
              className={cn(
                'inline-flex cursor-pointer items-center gap-2 rounded-full border px-[15px] py-2 text-[13px] font-bold',
                isActive ? 'border-brand bg-brand text-white' : 'border-line bg-surface-card text-ink-2'
              )}
            >
              <span className={cn('h-2 w-2 shrink-0 rounded-full', isActive ? 'bg-white' : 'bg-engage')} />
              <span>{c.code}</span>
              <span className={cn('font-semibold', isActive ? 'text-white/70' : 'text-ink-3')}>{c.name}</span>
            </button>
          );
        })}
        <button type="button" onClick={() => { setShowNewModal(true); setNewSkill(null); }}
          className="cursor-pointer rounded-full border border-dashed border-line-field bg-surface-card px-[15px] py-2 text-[13px] font-bold text-ink-2">
          + Nouveau cursus
        </button>
      </div>

      {!detail ? (
        <div className="rounded-[18px] border-[1.5px] border-dashed border-line bg-surface-card px-6 py-[60px] text-center">
          <p className="text-[15px] text-ink-3">Sélectionnez un cursus ou créez-en un.</p>
        </div>
      ) : (
        <>
          {/* ── Identity card ── */}
          <div className="mb-4 rounded-2xl border border-line bg-surface-card px-[22px] py-5 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-[18px]">
              <div className="min-w-[300px] flex-1">
                <div className="mb-[9px] text-xs font-extrabold uppercase tracking-[.04em] text-ink-3">
                  Compétence du cursus
                </div>
                <SkillPicker chosenSkillId={detail.skill_id} chosenSkill={linkedSkill} onPick={handleLinkSkill} />
                {savingSkill ? <p className="mt-2 text-xs text-ink-3">Enregistrement…</p> : null}
                {!detail.skill_id ? <p className="mt-2 text-xs text-ink-3">Associez une compétence du référentiel pour lier ce cursus aux profils bénévoles.</p> : null}
              </div>
              <div className="flex flex-col items-end gap-3">
                <div className="flex gap-[18px] text-right">
                  <div>
                    <div className="text-2xl font-extrabold leading-none text-ink">{totalComps}</div>
                    <div className="mt-[3px] text-[11px] font-semibold text-ink-3">compétences</div>
                  </div>
                  <div>
                    <div className="text-2xl font-extrabold leading-none text-ink">{totalMinDoublures}</div>
                    <div className="mt-[3px] text-[11px] font-semibold text-ink-3">doublures min.</div>
                  </div>
                </div>
                <button type="button" onClick={handleDeleteCursus} disabled={deletingCursus || allCursus.length <= 1}
                  title={allCursus.length <= 1 ? 'Impossible de supprimer le dernier cursus' : undefined}
                  className="cursor-pointer rounded-[9px] border border-bad/30 bg-surface-card px-[13px] py-[7px] text-[12.5px] font-bold text-bad disabled:cursor-not-allowed disabled:opacity-50">
                  {deletingCursus ? 'Suppression…' : 'Supprimer le cursus'}
                </button>
              </div>
            </div>
          </div>

          {/* ── Rules ── */}
          <div className="mb-4 rounded-2xl border border-line bg-surface-card px-[22px] py-[18px] shadow-card">
            <div className="mb-[13px] flex items-center justify-between gap-3">
              <span className="text-xs font-extrabold uppercase tracking-[.04em] text-ink-3">Règles du cursus</span>
              <span className="text-[11.5px] text-ink-3">Le badge <strong className="text-[#1E3C87]">Auto</strong> = vérifiée automatiquement par l&apos;app</span>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleRuleDragEnd}>
              <SortableContext items={rules.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                <div className="mb-3 flex flex-col gap-2">
                  {rules.length === 0 ? (
                    <div className="p-0.5 text-[12.5px] text-ink-3">Aucune règle pour l&apos;instant.</div>
                  ) : rules.map((r) => (
                    <SortableRuleRow key={r.id} rule={r} onToggleAuto={() => toggleRuleAuto(r)} onRemove={() => removeRule(r.id)} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            <div className="flex gap-[9px]">
              <input value={ruleDraft} onChange={(e) => setRuleDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRule(); } }} placeholder="Ajouter une règle…"
                className="flex-1 rounded-[9px] border border-line-field px-3 py-[9px] text-[13.5px] text-ink outline-none" />
              <Button variant="primary" onClick={addRule} disabled={addingRule || !ruleDraft.trim()}>
                Ajouter
              </Button>
            </div>
          </div>

          {/* ── Phases ── */}
          <div className="mb-[13px] flex items-center justify-between gap-3">
            <span className="text-xs font-extrabold uppercase tracking-[.04em] text-ink-3">
              Phases du cursus
            </span>
            <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-3">Glissez les phases <Icon name="drag_indicator" size={16} className="text-ink-3" /> pour changer leur ordre</span>
          </div>

          {orderedPhases.length === 0 ? (
            <div className="mb-4 rounded-2xl border-[1.5px] border-dashed border-line bg-surface-card px-6 py-9 text-center">
              <p className="text-[13.5px] text-ink-3">Aucune phase pour l&apos;instant. Ajoutez-en une pour commencer.</p>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handlePhaseDragEnd}>
              <SortableContext items={orderedPhases.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                {orderedPhases.map((phase, index) => (
                  <SortablePhaseCard
                    key={phase.id}
                    phase={phase}
                    index={index}
                    sensors={sensors}
                    onEditPhase={() => openEditPhase(phase)}
                    onDeletePhase={() => deletePhase(phase)}
                    onCompDragEnd={(e) => handleCompDragEnd(phase.id, e)}
                    onAddComp={() => openAddComp(phase.id)}
                    onEditComp={(c) => openEditComp(phase.id, c)}
                    onRemoveComp={(compId) => deleteComp(phase.id, compId)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}

          {/* Add phase */}
          <div className="mb-4">
            <button type="button" onClick={openAddPhase}
              className="w-full cursor-pointer rounded-[10px] border border-dashed border-line-field bg-surface-card px-4 py-[11px] text-[13.5px] font-bold text-brand">
              + Nouvelle phase
            </button>
          </div>
        </>
      )}

      {/* ── New cursus modal ── */}
      {showNewModal ? (
        <Modal
          title="Nouveau cursus"
          subtitle="Choisissez la compétence du référentiel associée à ce cursus."
          onClose={() => { setShowNewModal(false); setNewSkill(null); }}
          onSubmit={createCursusFromSkill}
          submitLabel={creating ? 'Création…' : 'Créer le cursus'}
          submitDisabled={creating || !newSkill}
        >
          <div>
            <FieldLabel>Compétence du référentiel</FieldLabel>
            <SkillPicker chosenSkillId={newSkill?.id ?? null} chosenSkill={newSkill} onPick={setNewSkill} />
            <p className="mt-2 text-xs text-ink-3">Le code, le nom et la catégorie du cursus sont repris de la compétence choisie.</p>
          </div>
        </Modal>
      ) : null}

      {/* ── Competence modal ── */}
      {compModal ? (
        <Modal
          title={compModal.compId ? 'Modifier la compétence' : 'Ajouter une compétence'}
          subtitle={detail?.phases.find((p) => p.id === compModal.phaseId)?.label}
          onClose={() => setCompModal(null)}
          onSubmit={submitComp}
          submitLabel={savingComp ? 'Enregistrement…' : compModal.compId ? 'Enregistrer' : 'Ajouter'}
          submitDisabled={savingComp || !compModal.name.trim()}
        >
          <div>
            <FieldLabel>Intitulé de la compétence</FieldLabel>
            <input value={compModal.name} onChange={(e) => setCompModal((m) => m ? { ...m, name: e.target.value } : m)} placeholder="Ex : Transmission du bilan à l'IOA"
              className="w-full rounded-[9px] border border-line-field px-3 py-2.5 text-sm text-ink outline-none" />
          </div>
          <div>
            <FieldLabel>Description <span className="font-semibold text-ink-3">(critères d&apos;évaluation)</span></FieldLabel>
            <textarea value={compModal.description} onChange={(e) => setCompModal((m) => m ? { ...m, description: e.target.value } : m)} placeholder="Ex : maîtrise de la transmission du bilan à l'Infirmier Organisateur de l'Accueil." rows={3}
              className="w-full resize-y rounded-[9px] border border-line-field px-3 py-2.5 text-sm text-ink outline-none" />
          </div>
          <div className="flex items-center gap-[11px] rounded-[11px] border border-line-row bg-surface-sub px-[13px] py-[11px]">
            <Toggle value={compModal.gardeOnly} onChange={(v) => setCompModal((m) => m ? { ...m, gardeOnly: v } : m)} />
            <div>
              <div className="text-[13px] font-bold text-ink-2">Validable en garde uniquement</div>
              <div className="text-xs text-ink-3">Ne peut être validée que sur un événement de type Garde.</div>
            </div>
          </div>
        </Modal>
      ) : null}

      {/* ── Phase modal ── */}
      {phaseModal ? (
        <Modal
          title={phaseModal.phaseId ? 'Modifier la phase' : 'Nouvelle phase'}
          subtitle="Une phase regroupe des doublures à réaliser et des compétences à valider."
          onClose={() => setPhaseModal(null)}
          onSubmit={submitPhase}
          submitLabel={savingPhase ? 'Enregistrement…' : phaseModal.phaseId ? 'Enregistrer' : 'Ajouter la phase'}
          submitDisabled={savingPhase || !phaseModal.label.trim()}
        >
          <div>
            <FieldLabel>Nom de la phase</FieldLabel>
            <input value={phaseModal.label} onChange={(e) => setPhaseModal((m) => m ? { ...m, label: e.target.value } : m)} placeholder="Ex : Pré-doublure, Doublures opérationnelles…"
              className="w-full rounded-[9px] border border-line-field px-3 py-2.5 text-sm text-ink outline-none" />
          </div>
          <div>
            <FieldLabel>Description <span className="font-semibold text-ink-3">(optionnelle)</span></FieldLabel>
            <textarea value={phaseModal.sub} onChange={(e) => setPhaseModal((m) => m ? { ...m, sub: e.target.value } : m)} placeholder="Ex : Doublures d'observation avant la formation." rows={2}
              className="w-full resize-y rounded-[9px] border border-line-field px-3 py-2.5 text-sm text-ink outline-none" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[13px] font-bold text-ink-2">Nombre minimum de doublures</span>
            <Stepper value={phaseModal.minDoublures} onChange={(v) => setPhaseModal((m) => m ? { ...m, minDoublures: v, minExterne: Math.min(m.minExterne, v) } : m)} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[13px] font-bold text-ink-2">dont à l&apos;extérieur</span>
            <Stepper value={phaseModal.minExterne} onChange={(v) => setPhaseModal((m) => m ? { ...m, minExterne: v } : m)} max={phaseModal.minDoublures} />
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
