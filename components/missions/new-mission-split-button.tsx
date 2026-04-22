'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { EVENT_TEMPLATES } from '@/lib/event-templates';

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
        className="rounded-l-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
      >
        Nouvel événement
      </Link>

      <button
        type="button"
        aria-label="Choisir un template d'événement"
        aria-haspopup="menu"
        aria-expanded={isMenuOpen}
        onClick={() => setIsMenuOpen((previous) => !previous)}
        className="rounded-r-md border-l border-slate-700 bg-slate-900 px-2 text-white hover:bg-slate-800"
      >
        <span aria-hidden="true">▾</span>
      </button>

      {isMenuOpen ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-10 mt-1 min-w-44 rounded-md border border-slate-200 bg-white py-1 shadow-lg"
        >
          {EVENT_TEMPLATES.map((template) => (
            <Link
              key={template.id}
              href={`/admin/missions/create?template=${template.id}`}
              role="menuitem"
              className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
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
