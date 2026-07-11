'use client';

import { useState } from 'react';
import type { BoardDragPayload } from '@/lib/mission-board';
import { cn } from '@/lib/cn';

// Point de dépôt HTML5 générique (bénévole ou matériel) : gère uniquement le
// survol visuel + le décodage du payload JSON, la logique métier (affecter,
// vérifier l'éligibilité…) reste côté appelant via `onDrop`.
export function DropZone<K extends BoardDragPayload['kind']>({
  kind,
  onDrop,
  disabled,
  className,
  activeClassName,
  children,
}: {
  kind: K;
  onDrop: (payload: Extract<BoardDragPayload, { kind: K }>) => void;
  disabled?: boolean;
  className?: string;
  activeClassName?: string;
  children?: React.ReactNode;
}) {
  const [over, setOver] = useState(false);

  if (disabled) return <div className={className}>{children}</div>;

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        let payload: BoardDragPayload | null = null;
        try {
          payload = JSON.parse(e.dataTransfer.getData('text/plain') || '{}');
        } catch {
          return;
        }
        if (!payload || payload.kind !== kind) return;
        onDrop(payload as Extract<BoardDragPayload, { kind: K }>);
      }}
      className={cn(className, over && activeClassName)}
    >
      {children}
    </div>
  );
}

export function dragStartHandler(payload: BoardDragPayload) {
  return (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'move';
  };
}
