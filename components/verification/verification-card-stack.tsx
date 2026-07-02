'use client';

import { useMemo, useState } from 'react';
import { MissionVerificationCard, MissionMaterielVerificationItemStatus } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';

type PendingDecision = { status: MissionMaterielVerificationItemStatus; note: string };

type VerificationCardStackProps = {
  cards: MissionVerificationCard[];
  onDecide: (card: MissionVerificationCard, status: MissionMaterielVerificationItemStatus, note: string | null) => Promise<void>;
  saving: boolean;
};

function cardKey(card: MissionVerificationCard) {
  return `${card.mission_materiel_assignment_id}:${card.child_type_id}`;
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
            className="absolute inset-0 rounded-2xl border border-line bg-surface-card shadow-card"
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
          className="absolute inset-0 z-10 flex cursor-grab flex-col justify-between rounded-2xl border border-line-field bg-surface-card p-5 shadow-lift select-none touch-none"
          style={{
            transform: `translateX(${dragX}px) rotate(${rotation}deg)`,
            transition: dragging ? 'none' : 'transform 200ms ease'
          }}
        >
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.04em] text-ink-3">
              {current.category_name} — {current.container_name}
            </span>
            <span className="text-xl font-bold text-ink">{current.child_name}</span>
            {current.expected_quantity > 1 ? (
              <span className="text-sm text-ink-2">Quantité attendue : {current.expected_quantity}</span>
            ) : null}
          </div>

          {dragX > 30 ? (
            <span className="self-end rounded-full border-2 border-ok-bar px-3 py-1 text-sm font-bold text-ok-text">
              PRÉSENT
            </span>
          ) : null}
          {dragX < -30 ? (
            <span className="self-start rounded-full border-2 border-bad px-3 py-1 text-sm font-bold text-bad">
              MANQUANT
            </span>
          ) : null}
        </div>
      </div>

      {missingDraft ? (
        <div className="w-full rounded-2xl border border-bad/30 bg-bad-soft p-3">
          <label className="mb-1 block text-xs font-semibold text-bad">Note (optionnelle)</label>
          <textarea
            value={missingDraft.note}
            onChange={(event) => setMissingDraft({ ...missingDraft, note: event.target.value })}
            placeholder="Pourquoi est-il manquant ?"
            className="mb-2 w-full rounded-[11px] border border-line-field bg-surface-card p-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none"
            rows={2}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setMissingDraft(null)}
              disabled={saving}
            >
              Annuler
            </Button>
            <Button
              variant="danger"
              onClick={() => void commitMissing()}
              disabled={saving}
            >
              Confirmer manquant
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-6">
          <button
            type="button"
            aria-label="Manquant"
            onClick={openMissingDraft}
            disabled={saving}
            className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-bad text-bad transition disabled:opacity-50"
          >
            <Icon name="close" size={26} />
          </button>
          <button
            type="button"
            aria-label="Présent"
            onClick={() => void commitPresent()}
            disabled={saving}
            className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-ok-bar text-ok-text transition disabled:opacity-50"
          >
            <Icon name="check" size={26} />
          </button>
        </div>
      )}

      <span className="text-xs text-ink-3">{pending.length} item(s) restant(s)</span>
    </div>
  );
}
