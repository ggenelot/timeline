'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { EVENT_TEMPLATES } from '@/lib/event-templates';
import { Icon } from '@/components/ui/icon';

export function NewMissionSplitButton() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative inline-flex">
      <Link
        href="/admin/missions/create"
        className="rounded-l-[11px] bg-brand px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-for"
      >
        Nouvel événement
      </Link>

      <button
        type="button"
        aria-label="Choisir un template d'événement"
        aria-haspopup="menu"
        aria-expanded={isMenuOpen}
        onClick={() => setIsMenuOpen((previous) => !previous)}
        className="flex items-center rounded-r-[11px] border-l border-brand-for bg-brand px-2 text-white hover:bg-brand-for"
      >
        <Icon name="expand_more" size={18} />
      </button>

      {isMenuOpen ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-10 mt-1 min-w-44 rounded-xl border border-line bg-surface-card py-1 shadow-lift"
        >
          {EVENT_TEMPLATES.map((template) => (
            <Link
              key={template.id}
              href={`/admin/missions/create?template=${template.id}`}
              role="menuitem"
              className="block px-3 py-2 text-sm text-ink-2 hover:bg-surface-sub"
              onClick={() => setIsMenuOpen(false)}
            >
              {template.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
