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

// ── Toggle switch ─────────────────────────────────────────────

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      style={{
        position: 'relative',
        flexShrink: 0,
        width: 40,
        height: 23,
        border: 'none',
        borderRadius: 99,
        cursor: 'pointer',
        background: value ? '#059669' : '#cbd5e1',
      }}
      aria-checked={value}
      role="switch"
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: value ? 19 : 2,
          width: 19,
          height: 19,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 2px rgba(0,0,0,.25)',
          transition: 'left 0.15s',
        }}
      />
    </button>
  );
}

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
      style={{ flexShrink: 0, cursor: 'grab', color: '#cbd5e1', fontSize: 13, lineHeight: 1, letterSpacing: -3, touchAction: 'none', ...style }}
    >
      ⠿⠿
    </span>
  );
}

// ── Stepper ────────────────────────────────────────────────────

function Stepper({ value, onChange, max }: { value: number; onChange: (v: number) => void; max?: number }) {
  const atMax = max !== undefined && value >= max;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid #cbd5e1', borderRadius: 9, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        style={{ cursor: 'pointer', border: 'none', background: '#f8fafc', color: '#475569', width: 32, height: 34, fontSize: 17, fontWeight: 700 }}
      >
        −
      </button>
      <span style={{ minWidth: 38, textAlign: 'center', fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
        {value}
      </span>
      <button
        type="button"
        onClick={() => { if (!atMax) onChange(value + 1); }}
        disabled={atMax}
        style={{ cursor: atMax ? 'not-allowed' : 'pointer', border: 'none', background: '#f8fafc', color: '#475569', width: 32, height: 34, fontSize: 17, fontWeight: 700, opacity: atMax ? 0.4 : 1 }}
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
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '56px 18px', overflowY: 'auto' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: '100%', maxWidth: 520, background: '#fff', borderRadius: 18, boxShadow: '0 24px 60px rgba(15,23,42,.3)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '18px 20px 14px', borderBottom: '1px solid #eef1f5' }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a' }}>{title}</div>
            {subtitle ? <div style={{ marginTop: 3, fontSize: 12.5, color: '#64748b' }}>{subtitle}</div> : null}
          </div>
          <button type="button" onClick={onClose} style={{ flexShrink: 0, cursor: 'pointer', border: 'none', background: '#f1f5f9', color: '#64748b', width: 30, height: 30, borderRadius: 8, fontSize: 16 }}>✕</button>
        </div>
        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid #eef1f5', background: '#fafbfc' }}>
          <button type="button" onClick={onClose} style={{ cursor: 'pointer', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>Annuler</button>
          <button type="button" onClick={onSubmit} disabled={submitDisabled} style={{ cursor: submitDisabled ? 'not-allowed' : 'pointer', border: 'none', background: submitDisabled ? '#94a3b8' : '#059669', color: '#fff', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', opacity: submitDisabled ? 0.6 : 1 }}>{submitLabel}</button>
        </div>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 7 }}>{children}</div>;
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
          dot: cat?.color ?? '#64748b',
        };
      })
    );
  }

  if (chosenSkillId && chosenSkill && !open) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, flexWrap: 'wrap', border: '1.5px solid #bfdbfe', background: '#f6f9ff', borderRadius: 13, padding: '13px 15px' }}>
        <span style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 800, color: '#fff', background: chosenSkill.dot }}>
          {chosenSkill.code ?? '?'}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>{chosenSkill.name}</div>
          <div style={{ marginTop: 2, fontSize: 12.5, color: '#64748b' }}>
            {chosenSkill.code} · {chosenSkill.catLabel}{chosenSkill.level ? ` · Niveau ${chosenSkill.level}` : ''}
          </div>
        </div>
        <button type="button" onClick={() => { setOpen(true); setQuery(''); }} style={{ marginLeft: 'auto', cursor: 'pointer', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', borderRadius: 8, padding: '7px 13px', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit' }}>Changer</button>
      </div>
    );
  }

  return (
    <div>
      <input
        value={query}
        onChange={(e) => search(e.target.value)}
        placeholder="Rechercher : code ou nom (ex : CE, Chef d'Équipe)…"
        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 9, padding: '10px 12px', fontSize: 14, color: '#0f172a', outline: 'none', fontFamily: 'inherit' }}
      />
      {results.length > 0 ? (
        <div style={{ marginTop: 7, display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 248, overflowY: 'auto' }}>
          {results.map((o) => (
            <button key={o.id} type="button" onClick={() => { onPick(o); setOpen(false); setQuery(''); }} style={{ cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 11, border: '1px solid #e7e9ee', background: '#fff', borderRadius: 9, padding: '8px 11px', fontFamily: 'inherit' }}>
              <span style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff', background: o.dot }}>{o.code ?? '?'}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, color: '#475569' }}><span style={{ fontWeight: 700, color: '#0f172a' }}>{o.code ?? o.name}</span>{o.code ? ` — ${o.name}` : ''}</div>
                <div style={{ fontSize: 11.5, color: '#94a3b8' }}>{o.catLabel}{o.level ? ` · Niveau ${o.level}` : ''}</div>
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
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        border: '1px solid #eef1f5',
        borderRadius: 11,
        padding: '10px 13px',
        background: '#fcfcfd',
        opacity: isDragging ? 0.6 : 1,
        boxShadow: isDragging ? '0 6px 18px rgba(15,23,42,.12)' : 'none',
        zIndex: isDragging ? 1 : 'auto',
      }}
    >
      <DragHandle attributes={attributes} listeners={listeners} />
      <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, background: rule.auto ? '#4338ca' : '#e2e8f0', color: rule.auto ? '#fff' : '#94a3b8' }}>
        {rule.auto ? '⚡' : '·'}
      </span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#334155', lineHeight: 1.45 }}>{rule.text}</span>
      <button type="button" onClick={onToggleAuto} style={{ flexShrink: 0, cursor: 'pointer', border: `1px solid ${rule.auto ? '#6d28d9' : '#e2e8f0'}`, background: rule.auto ? '#f5f3ff' : '#fff', color: rule.auto ? '#6d28d9' : '#94a3b8', borderRadius: 6, padding: '3px 9px', fontSize: 11, fontWeight: 800, fontFamily: 'inherit' }}>Auto</button>
      <button type="button" onClick={onRemove} style={{ flexShrink: 0, cursor: 'pointer', border: 'none', background: 'transparent', color: '#dc2626', fontSize: 15, padding: '3px 6px' }} aria-label="Supprimer">✕</button>
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
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        border: '1px solid #eef1f5',
        borderRadius: 12,
        padding: '11px 13px',
        background: '#fcfcfd',
        opacity: isDragging ? 0.6 : 1,
        boxShadow: isDragging ? '0 6px 18px rgba(15,23,42,.12)' : 'none',
        zIndex: isDragging ? 1 : 'auto',
      }}
    >
      <DragHandle attributes={attributes} listeners={listeners} style={{ marginTop: 3 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{comp.name}</span>
          {comp.garde_only ? (
            <span style={{ fontSize: 10.5, fontWeight: 700, color: '#6d28d9', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 5, padding: '1px 7px' }}>Garde uniquement</span>
          ) : null}
        </div>
        {comp.description ? <div style={{ marginTop: 3, fontSize: 12.5, color: '#64748b', lineHeight: 1.45 }}>{comp.description}</div> : null}
      </div>
      <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <button type="button" onClick={onEdit}
          style={{ cursor: 'pointer', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>
          Modifier
        </button>
        <button type="button" onClick={onRemove} aria-label="Supprimer"
          style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: '#dc2626', fontSize: 15, padding: '4px 6px' }}>✕</button>
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
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        background: '#fff',
        border: '1px solid #e7e9ee',
        borderRadius: 16,
        boxShadow: isDragging ? '0 12px 30px rgba(15,23,42,.16)' : '0 2px 10px rgba(15,23,42,.05)',
        marginBottom: 16,
        overflow: 'hidden',
        opacity: isDragging ? 0.85 : 1,
        zIndex: isDragging ? 5 : 'auto',
        position: 'relative',
      }}
    >
      {/* Phase header */}
      <div style={{ padding: '16px 22px 15px', borderBottom: '1px solid #eef1f5' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, flexWrap: 'wrap' }}>
          <DragHandle attributes={attributes} listeners={listeners} />
          <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, background: '#0f172a', color: '#fff' }}>
            {index + 1}
          </span>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{phase.label}</span>
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginRight: 4 }}>
              {comps.length} compétence{comps.length !== 1 ? 's' : ''}
            </span>
            <button type="button" onClick={onEditPhase}
              style={{ cursor: 'pointer', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>
              Modifier
            </button>
            <button type="button" onClick={onDeletePhase} aria-label="Supprimer la phase"
              style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: '#dc2626', fontSize: 15, padding: '4px 6px' }}>✕</button>
          </span>
        </div>
        {phase.sub ? (
          <div style={{ marginTop: 9, fontSize: 12.5, color: '#64748b', lineHeight: 1.5 }}>{phase.sub}</div>
        ) : null}
        {/* Doublure requirements summary */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#334155', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 7, padding: '4px 10px' }}>
            {phase.min_doublures} doublure{phase.min_doublures !== 1 ? 's' : ''} min.
          </span>
          {phase.min_externe > 0 ? (
            <span style={{ fontSize: 12, fontWeight: 700, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 7, padding: '4px 10px' }}>
              dont {phase.min_externe} extérieure{phase.min_externe !== 1 ? 's' : ''}
            </span>
          ) : null}
        </div>
      </div>

      {/* Competences */}
      <div style={{ padding: '14px 22px 18px' }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 11 }}>
          Compétences à valider
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onCompDragEnd}>
          <SortableContext items={comps.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {comps.length === 0 ? (
                <div style={{ fontSize: 12.5, color: '#94a3b8', padding: '2px' }}>Aucune compétence dans cette phase.</div>
              ) : comps.map((c) => (
                <SortableCompetenceRow key={c.id} comp={c} onEdit={() => onEditComp(c)} onRemove={() => onRemoveComp(c.id)} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <button type="button" onClick={onAddComp}
          style={{ marginTop: 11, cursor: 'pointer', border: '1px dashed #cbd5e1', background: '#fff', color: '#2563eb', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', width: '100%', textAlign: 'left' }}>
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
                dot: cat?.color ?? '#64748b',
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
      <div style={{ display: 'flex', minHeight: '40vh', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#94a3b8' }}>Chargement…</p>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Accès refusé.
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '40vh', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#94a3b8' }}>Chargement…</p>
      </div>
    );
  }

  const orderedPhases = [...(detail?.phases ?? [])].sort((a, b) => a.order_idx - b.order_idx);

  return (
    <div style={{ paddingBottom: 80 }}>

      {/* Page heading */}
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 25, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
          Cursus de doublure
        </h1>
        <p style={{ margin: '7px 0 0', fontSize: 13.5, color: '#64748b', lineHeight: 1.5, maxWidth: 680 }}>
          Définissez les cursus, leurs règles, puis composez librement leurs phases : nom, description, doublures requises et compétences à valider. L&apos;ordre des phases et des compétences détermine leur progression dans la fiche.
        </p>
      </div>

      {error ? (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#dc2626' }}>
          {error}
        </div>
      ) : null}

      {/* Cursus tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        {allCursus.map((c) => {
          const isActive = selectedId === c.id;
          return (
            <button key={c.id} type="button" onClick={() => setSelectedId(c.id)}
              style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, border: `1px solid ${isActive ? '#0f172a' : '#e2e8f0'}`, background: isActive ? '#0f172a' : '#fff', color: isActive ? '#fff' : '#334155', borderRadius: 99, padding: '8px 15px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: isActive ? '#fff' : '#059669', flexShrink: 0 }} />
              <span>{c.code}</span>
              <span style={{ fontWeight: 600, color: isActive ? 'rgba(255,255,255,.7)' : '#94a3b8' }}>{c.name}</span>
            </button>
          );
        })}
        <button type="button" onClick={() => { setShowNewModal(true); setNewSkill(null); }}
          style={{ cursor: 'pointer', border: '1px dashed #cbd5e1', background: '#fff', color: '#475569', borderRadius: 99, padding: '8px 15px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>
          + Nouveau cursus
        </button>
      </div>

      {!detail ? (
        <div style={{ textAlign: 'center', background: '#fff', border: '1.5px dashed #e2e8f0', borderRadius: 18, padding: '60px 24px' }}>
          <p style={{ color: '#94a3b8', fontSize: 15 }}>Sélectionnez un cursus ou créez-en un.</p>
        </div>
      ) : (
        <>
          {/* ── Identity card ── */}
          <div style={{ background: '#fff', border: '1px solid #e7e9ee', borderRadius: 16, boxShadow: '0 2px 10px rgba(15,23,42,.05)', padding: '20px 22px', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 300 }}>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 9 }}>
                  Compétence du cursus
                </div>
                <SkillPicker chosenSkillId={detail.skill_id} chosenSkill={linkedSkill} onPick={handleLinkSkill} />
                {savingSkill ? <p style={{ marginTop: 8, fontSize: 12, color: '#94a3b8' }}>Enregistrement…</p> : null}
                {!detail.skill_id ? <p style={{ marginTop: 8, fontSize: 12, color: '#94a3b8' }}>Associez une compétence du référentiel pour lier ce cursus aux profils bénévoles.</p> : null}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12 }}>
                <div style={{ display: 'flex', gap: 18, textAlign: 'right' }}>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{totalComps}</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginTop: 3 }}>compétences</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{totalMinDoublures}</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginTop: 3 }}>doublures min.</div>
                  </div>
                </div>
                <button type="button" onClick={handleDeleteCursus} disabled={deletingCursus || allCursus.length <= 1}
                  title={allCursus.length <= 1 ? 'Impossible de supprimer le dernier cursus' : undefined}
                  style={{ cursor: allCursus.length <= 1 || deletingCursus ? 'not-allowed' : 'pointer', border: '1px solid #fecaca', background: '#fff', color: '#dc2626', borderRadius: 9, padding: '7px 13px', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', opacity: allCursus.length <= 1 ? 0.5 : 1 }}>
                  {deletingCursus ? 'Suppression…' : 'Supprimer le cursus'}
                </button>
              </div>
            </div>
          </div>

          {/* ── Rules ── */}
          <div style={{ background: '#fff', border: '1px solid #e7e9ee', borderRadius: 16, boxShadow: '0 2px 10px rgba(15,23,42,.05)', padding: '18px 22px', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 13 }}>
              <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: '#94a3b8' }}>Règles du cursus</span>
              <span style={{ fontSize: 11.5, color: '#94a3b8' }}>Le badge <strong style={{ color: '#4338ca' }}>Auto</strong> = vérifiée automatiquement par l&apos;app</span>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleRuleDragEnd}>
              <SortableContext items={rules.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  {rules.length === 0 ? (
                    <div style={{ fontSize: 12.5, color: '#94a3b8', padding: '2px' }}>Aucune règle pour l&apos;instant.</div>
                  ) : rules.map((r) => (
                    <SortableRuleRow key={r.id} rule={r} onToggleAuto={() => toggleRuleAuto(r)} onRemove={() => removeRule(r.id)} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            <div style={{ display: 'flex', gap: 9 }}>
              <input value={ruleDraft} onChange={(e) => setRuleDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRule(); } }} placeholder="Ajouter une règle…"
                style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: 9, padding: '9px 12px', fontSize: 13.5, color: '#0f172a', outline: 'none', fontFamily: 'inherit' }} />
              <button type="button" onClick={addRule} disabled={addingRule || !ruleDraft.trim()}
                style={{ cursor: addingRule || !ruleDraft.trim() ? 'not-allowed' : 'pointer', border: 'none', background: addingRule || !ruleDraft.trim() ? '#cbd5e1' : '#0f172a', color: '#fff', borderRadius: 9, padding: '9px 17px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>
                Ajouter
              </button>
            </div>
          </div>

          {/* ── Phases ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 13 }}>
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: '#94a3b8' }}>
              Phases du cursus
            </span>
            <span style={{ fontSize: 11.5, color: '#94a3b8' }}>Glissez les phases <strong>⠿⠿</strong> pour changer leur ordre</span>
          </div>

          {orderedPhases.length === 0 ? (
            <div style={{ textAlign: 'center', background: '#fff', border: '1.5px dashed #e2e8f0', borderRadius: 16, padding: '36px 24px', marginBottom: 16 }}>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: 13.5 }}>Aucune phase pour l&apos;instant. Ajoutez-en une pour commencer.</p>
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
          <div style={{ marginBottom: 16 }}>
            <button type="button" onClick={openAddPhase}
              style={{ cursor: 'pointer', border: '1px dashed #cbd5e1', background: '#fff', color: '#2563eb', borderRadius: 10, padding: '11px 16px', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit', width: '100%' }}>
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
            <p style={{ marginTop: 8, fontSize: 12, color: '#94a3b8' }}>Le code, le nom et la catégorie du cursus sont repris de la compétence choisie.</p>
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
              style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 9, padding: '10px 12px', fontSize: 14, color: '#0f172a', outline: 'none', fontFamily: 'inherit' }} />
          </div>
          <div>
            <FieldLabel>Description <span style={{ color: '#94a3b8', fontWeight: 600 }}>(critères d&apos;évaluation)</span></FieldLabel>
            <textarea value={compModal.description} onChange={(e) => setCompModal((m) => m ? { ...m, description: e.target.value } : m)} placeholder="Ex : maîtrise de la transmission du bilan à l'Infirmier Organisateur de l'Accueil." rows={3}
              style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 9, padding: '10px 12px', fontSize: 14, color: '#0f172a', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 13px', border: '1px solid #eef1f5', borderRadius: 11, background: '#fcfcfd' }}>
            <Toggle value={compModal.gardeOnly} onChange={(v) => setCompModal((m) => m ? { ...m, gardeOnly: v } : m)} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>Validable en garde uniquement</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Ne peut être validée que sur un événement de type Garde.</div>
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
              style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 9, padding: '10px 12px', fontSize: 14, color: '#0f172a', outline: 'none', fontFamily: 'inherit' }} />
          </div>
          <div>
            <FieldLabel>Description <span style={{ color: '#94a3b8', fontWeight: 600 }}>(optionnelle)</span></FieldLabel>
            <textarea value={phaseModal.sub} onChange={(e) => setPhaseModal((m) => m ? { ...m, sub: e.target.value } : m)} placeholder="Ex : Doublures d'observation avant la formation." rows={2}
              style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 9, padding: '10px 12px', fontSize: 14, color: '#0f172a', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>Nombre minimum de doublures</span>
            <Stepper value={phaseModal.minDoublures} onChange={(v) => setPhaseModal((m) => m ? { ...m, minDoublures: v, minExterne: Math.min(m.minExterne, v) } : m)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>dont à l&apos;extérieur</span>
            <Stepper value={phaseModal.minExterne} onChange={(v) => setPhaseModal((m) => m ? { ...m, minExterne: v } : m)} max={phaseModal.minDoublures} />
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
