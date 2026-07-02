'use client';

import { useEffect, useState } from 'react';
import { MissionMaterielVerificationItemStatus, VerificationTreeItemNode } from '@/lib/types';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';

export type FlattenedVerificationItem = VerificationTreeItemNode & { containerName: string };

export type VerificationDecision = {
  item: FlattenedVerificationItem;
  status: MissionMaterielVerificationItemStatus;
  quantityPresent: number;
};

type VerificationCardFlowProps = {
  items: FlattenedVerificationItem[];
  rootName: string;
  onBack: () => void;
  onFinish: (decisions: VerificationDecision[]) => void;
  onDecide: (item: FlattenedVerificationItem, status: MissionMaterielVerificationItemStatus, quantityPresent: number) => Promise<boolean>;
};

export function VerificationCardFlow({ items, rootName, onBack, onFinish, onDecide }: VerificationCardFlowProps) {
  const [idx, setIdx] = useState(0);
  const item = items[idx] as FlattenedVerificationItem | undefined;

  const [have, setHave] = useState(item?.quantity ?? 0);
  const [pulse, setPulse] = useState<'present' | 'missing' | null>(null);
  const [decisions, setDecisions] = useState<VerificationDecision[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prevContainerName = idx > 0 ? items[idx - 1].containerName : rootName;
  const enteringNew = Boolean(item && item.containerName !== prevContainerName);

  useEffect(() => {
    setHave(item ? item.quantity : 0);
  }, [idx, item]);

  async function decide(kind: 'present' | 'missing') {
    if (pulse || saving || !item) return;
    const quantityPresent = kind === 'missing' ? 0 : have;
    const status: MissionMaterielVerificationItemStatus =
      quantityPresent === 0 ? 'missing' : quantityPresent >= item.quantity ? 'present' : 'partial';

    setSaving(true);
    setError(null);
    setPulse(kind);

    const ok = await onDecide(item, status, quantityPresent);

    if (!ok) {
      setPulse(null);
      setSaving(false);
      setError('Impossible d’enregistrer ce pointage.');
      return;
    }

    setTimeout(() => {
      setDecisions((current) => [...current, { item, status, quantityPresent }]);
      setPulse(null);
      setSaving(false);
      setIdx((i) => i + 1);
    }, 160);
  }

  useEffect(() => {
    if (!item) return;
    const currentItem = item;
    function onKey(event: KeyboardEvent) {
      if (saving || pulse) return;
      if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'p') void decide('present');
      else if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'm') void decide('missing');
      else if (event.key === '+' || event.key === 'ArrowUp') setHave((h) => Math.min(currentItem.quantity, h + 1));
      else if (event.key === '-' || event.key === 'ArrowDown') setHave((h) => Math.max(0, h - 1));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, have, saving, pulse]);

  if (!item) {
    const toReport = decisions.filter((d) => d.status !== 'present');
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface-card p-5">
        <div className={cn('rounded-2xl border p-4', toReport.length === 0 ? 'border-ok-line bg-ok-soft' : 'border-warn-line bg-warn-soft')}>
          <p className={cn('text-sm font-extrabold', toReport.length === 0 ? 'text-ok-text' : 'text-warn-text')}>Vérification terminée</p>
          <p className={cn('mt-1 text-sm', toReport.length === 0 ? 'text-ok-text' : 'text-warn-text')}>
            {toReport.length === 0 ? 'Tout le matériel était présent.' : `${toReport.length} item(s) à signaler.`}
          </p>
        </div>
        {toReport.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {toReport.map((d) => (
              <li key={d.item.id} className="rounded-2xl border border-line bg-surface p-3 text-sm text-ink">
                <span className="font-bold">{d.item.name}</span> —{' '}
                {d.status === 'missing' ? 'manquant' : `${d.quantityPresent}/${d.item.quantity} présents`}
              </li>
            ))}
          </ul>
        ) : null}
        <button
          type="button"
          onClick={() => onFinish(decisions)}
          className="self-start rounded-[11px] bg-brand px-4 py-2 text-sm font-bold text-white transition hover:bg-[#013A8F]"
        >
          Retour à l’arborescence
        </button>
      </div>
    );
  }

  const confirmLabel = have >= item.quantity ? 'Présent' : `Confirmer ${have}/${item.quantity}`;

  return (
    <div
      className={cn(
        'flex flex-col gap-5 rounded-2xl border border-line p-5 transition-colors duration-150',
        pulse === 'present' ? 'bg-ok-soft' : pulse === 'missing' ? 'bg-bad-soft' : 'bg-surface'
      )}
    >
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} aria-label="Retour à l’arborescence" className="rounded-lg p-1 text-ink-2 hover:bg-[#F4F6FB]">
          <Icon name="arrow_back" size={20} />
        </button>
        <span className="truncate text-xs font-semibold text-ink-3">{rootName}</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="text-xs font-bold text-ink-2">
          {idx} / {items.length} vérifiés
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-brand transition-[width] duration-200" style={{ width: `${(idx / items.length) * 100}%` }} />
        </div>
      </div>

      {enteringNew ? (
        <div className="flex flex-col gap-0.5 rounded-xl border border-[#CFDDF6] bg-[#EAF0FB] px-3.5 py-2.5">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.04em] text-brand">Vous entrez dans</span>
          <span className="text-[15px] font-extrabold text-brand">{item.containerName}</span>
        </div>
      ) : null}

      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-6">
        <span className="text-center text-xl font-extrabold text-ink">{item.name}</span>

        {item.quantity > 1 ? (
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => setHave((h) => Math.max(0, h - 1))}
              className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-brand text-2xl font-black text-brand"
            >
              –
            </button>
            <div className="min-w-[64px] text-center text-3xl font-black text-ink">
              {have}
              <span className="text-lg text-ink-3">/{item.quantity}</span>
            </div>
            <button
              type="button"
              onClick={() => setHave((h) => Math.min(item.quantity, h + 1))}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-2xl font-black text-white"
            >
              +
            </button>
          </div>
        ) : null}

        <div className="flex items-start gap-8">
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              aria-label="Manquant"
              disabled={saving}
              onClick={() => void decide('missing')}
              className="flex h-[84px] w-[84px] items-center justify-center rounded-full border-[3px] border-bad text-bad transition disabled:opacity-50"
            >
              <Icon name="close" size={32} />
            </button>
            <span className="text-xs font-bold text-bad">Manquant</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              aria-label={confirmLabel}
              disabled={saving}
              onClick={() => void decide('present')}
              className="flex h-[84px] w-[84px] items-center justify-center rounded-full border-[3px] border-ok-bar bg-ok-bar text-white transition disabled:opacity-50"
            >
              <Icon name="check" size={32} />
            </button>
            <span className="text-xs font-bold text-ok-text">{confirmLabel}</span>
          </div>
        </div>

        <span className="text-xs font-semibold text-ink-3">{items.length - idx} item(s) restant(s) ici</span>
        {error ? <span className="text-xs text-bad">{error}</span> : null}
        <span className="hidden text-xs text-ink-3 md:block">← Manquant · ↑ ↓ Quantité · → Présent</span>
      </div>
    </div>
  );
}
