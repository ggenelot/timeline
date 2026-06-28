'use client';

import { useMemo, useState } from 'react';
import { MissionVerificationCard, MissionMaterielVerificationItemStatus } from '@/lib/types';

type PendingDecision = { status: MissionMaterielVerificationItemStatus; note: string };

type VerificationCardStackProps = {
  cards: MissionVerificationCard[];
  onDecide: (card: MissionVerificationCard, status: MissionMaterielVerificationItemStatus, note: string | null) => Promise<void>;
  saving: boolean;
};

function cardKey(card: MissionVerificationCard) {
  return `${card.mission_required_materiel_id}:${card.occurrence_index}:${card.child_type_id}`;
}

export function VerificationCardStack({ cards, onDecide, saving }: VerificationCardStackProps) {
  const pending = useMemo(() => cards.filter((card) => !card.check), [cards]);
  const current = pending[0] ?? null;

  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [missingDraft, setMissingDraft] = useState<PendingDecision | null>(null);

  if (!current) {
    return null;
  }

  const swipeThreshold = 90;

  function resetDrag() {
    setDragX(0);
    setDragging(false);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (saving) return;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging || saving) return;
    setDragX((value) => value + event.movementX);
  }

  function handlePointerUp() {
    if (!dragging) return;
    if (dragX >= swipeThreshold) {
      void commitPresent();
    } else if (dragX <= -swipeThreshold) {
      openMissingDraft();
    } else {
      resetDrag();
    }
  }

  async function commitPresent() {
    resetDrag();
    await onDecide(current, 'present', null);
  }

  function openMissingDraft() {
    resetDrag();
    setMissingDraft({ status: 'missing', note: '' });
  }

  async function commitMissing() {
    if (!missingDraft) return;
    await onDecide(current, 'missing', missingDraft.note.trim() || null);
    setMissingDraft(null);
  }

  const rotation = Math.max(-12, Math.min(12, dragX / 10));

  return (
    <div className="relative mx-auto flex w-full max-w-sm flex-col items-center gap-4">
      <div className="relative h-72 w-full">
        {pending.slice(1, 3).reverse().map((card, idx) => (
          <div
            key={cardKey(card)}
            className="absolute inset-0 rounded-2xl border border-slate-200 bg-white shadow-sm"
            style={{ transform: `scale(${0.95 + idx * 0.025}) translateY(${(2 - idx) * 6}px)`, zIndex: idx }}
          />
        ))}
        <div
          role="group"
          aria-label={`Vérifier : ${current.child_name}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={resetDrag}
          className="absolute inset-0 z-10 flex cursor-grab flex-col justify-between rounded-2xl border border-slate-300 bg-white p-5 shadow-md select-none touch-none"
          style={{
            transform: `translateX(${dragX}px) rotate(${rotation}deg)`,
            transition: dragging ? 'none' : 'transform 200ms ease'
          }}
        >
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
              {current.container_name}
              {current.occurrence_count > 1 ? ` #${current.occurrence_index + 1}/${current.occurrence_count}` : ''}
            </span>
            <span className="text-xl font-semibold text-slate-900">{current.child_name}</span>
            {current.expected_quantity > 1 ? (
              <span className="text-sm text-slate-500">Quantité attendue : {current.expected_quantity}</span>
            ) : null}
          </div>

          {dragX > 30 ? (
            <span className="self-end rounded-full border-2 border-emerald-500 px-3 py-1 text-sm font-bold text-emerald-600">
              PRÉSENT
            </span>
          ) : null}
          {dragX < -30 ? (
            <span className="self-start rounded-full border-2 border-rose-500 px-3 py-1 text-sm font-bold text-rose-600">
              MANQUANT
            </span>
          ) : null}
        </div>
      </div>

      {missingDraft ? (
        <div className="w-full rounded-lg border border-rose-200 bg-rose-50 p-3">
          <label className="mb-1 block text-xs font-medium text-rose-700">Note (optionnelle)</label>
          <textarea
            value={missingDraft.note}
            onChange={(event) => setMissingDraft({ ...missingDraft, note: event.target.value })}
            placeholder="Pourquoi est-il manquant ?"
            className="mb-2 w-full rounded border border-rose-300 bg-white p-2 text-sm text-slate-800"
            rows={2}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setMissingDraft(null)}
              disabled={saving}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => void commitMissing()}
              disabled={saving}
              className="rounded border border-rose-400 bg-rose-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Confirmer manquant
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-6">
          <button
            type="button"
            aria-label="Manquant"
            onClick={openMissingDraft}
            disabled={saving}
            className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-rose-500 text-2xl font-bold text-rose-600 disabled:opacity-50"
          >
            ✕
          </button>
          <button
            type="button"
            aria-label="Présent"
            onClick={() => void commitPresent()}
            disabled={saving}
            className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-emerald-500 text-2xl font-bold text-emerald-600 disabled:opacity-50"
          >
            ✓
          </button>
        </div>
      )}

      <span className="text-xs text-slate-400">{pending.length} item(s) restant(s)</span>
    </div>
  );
}
