'use client';

import { useEffect, useRef, useState } from 'react';

export type SelectOption = {
  value: string;
  label: string;
};

type SearchableSelectProps = {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  className?: string;
};

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Sélectionner…',
  emptyLabel,
  disabled = false,
  className = '',
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);
  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  const handleSelect = (val: string) => {
    onChange(val);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) { setOpen((o) => !o); setQuery(''); } }}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm transition hover:border-slate-300 hover:bg-slate-50/80 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={selected ? 'text-slate-800' : 'text-slate-400'}>
          {selected ? selected.label : (emptyLabel ?? placeholder)}
        </span>
        <svg
          className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1.5 w-full min-w-[200px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-black/5">
          {/* Search input */}
          <div className="border-b border-slate-100 p-2">
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
              <svg className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher…"
                className="w-full bg-transparent text-sm text-slate-700 placeholder-slate-400 focus:outline-none"
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} className="flex-shrink-0 text-slate-400 hover:text-slate-600">
                  <svg className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Options list */}
          <div className="max-h-56 overflow-y-auto p-1">
            {emptyLabel && (
              <button
                type="button"
                onClick={() => handleSelect('')}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50 ${value === '' ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-400'}`}
              >
                {emptyLabel}
              </button>
            )}
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-slate-400">Aucun résultat</p>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelect(opt.value)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50 ${opt.value === value ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-700'}`}
                >
                  {opt.label}
                  {opt.value === value && (
                    <svg className="h-4 w-4 flex-shrink-0 text-slate-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
