'use client';

import { useRef, useState } from 'react';
import { MarkdownText } from '@/components/ui/markdown-text';

type Action = { label: string; title: string; className?: string; apply: (selected: string) => { text: string; cursor: [number, number] } };

const wrap = (marker: string, placeholder: string) => (selected: string) => {
  const inner = selected || placeholder;
  return { text: `${marker}${inner}${marker}`, cursor: [marker.length, marker.length + inner.length] as [number, number] };
};

const prefixLines = (prefix: (i: number) => string, placeholder: string) => (selected: string) => {
  const lines = (selected || placeholder).split('\n');
  const text = lines.map((l, i) => `${prefix(i)}${l}`).join('\n');
  return { text, cursor: [selected ? 0 : prefix(0).length, text.length] as [number, number] };
};

const ACTIONS: Action[] = [
  { label: 'G', title: 'Gras', className: 'font-extrabold', apply: wrap('**', 'texte en gras') },
  { label: 'I', title: 'Italique', className: 'italic font-serif', apply: wrap('*', 'texte en italique') },
  { label: '•', title: 'Liste à puces', apply: prefixLines(() => '- ', 'élément') },
  { label: '1.', title: 'Liste numérotée', apply: prefixLines((i) => `${i + 1}. `, 'élément') },
  {
    label: 'Lien',
    title: 'Lien',
    apply: (selected) => {
      const label = selected || 'texte du lien';
      const text = `[${label}](https://)`;
      return { text, cursor: [label.length + 3, text.length - 1] };
    },
  },
];

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function runAction(action: Action) {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const { text, cursor } = action.apply(value.slice(start, end));
    onChange(value.slice(0, start) + text + value.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + cursor[0], start + cursor[1]);
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key === 'b' || key === 'i') {
      e.preventDefault();
      runAction(ACTIONS[key === 'b' ? 0 : 1]);
    }
  }

  return (
    <div className="overflow-hidden rounded-[9px] border border-ink-4 bg-surface-card focus-within:border-ink-2">
      <div className="flex items-center gap-0.5 border-b border-line-row bg-surface-sub px-1.5 py-1">
        {(['write', 'preview'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`cursor-pointer rounded-md border-none px-2 py-1 text-xs font-bold ${
              mode === m ? 'bg-surface-card text-ink shadow-sm' : 'bg-transparent text-ink-3'
            }`}
          >
            {m === 'write' ? 'Écrire' : 'Aperçu'}
          </button>
        ))}
        {mode === 'write' ? (
          <div className="ml-auto flex items-center gap-0.5">
            {ACTIONS.map((a) => (
              <button
                key={a.title}
                type="button"
                title={a.title}
                aria-label={a.title}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => runAction(a)}
                className={`min-w-[26px] cursor-pointer rounded-md border-none bg-transparent px-1.5 py-1 text-xs text-ink-2 hover:bg-line-row ${a.className ?? 'font-bold'}`}
              >
                {a.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {mode === 'write' ? (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          rows={rows}
          className="block w-full resize-y border-none bg-transparent px-3 py-2.5 font-[inherit] text-sm text-ink outline-none"
        />
      ) : (
        <div className="px-3 py-2.5 text-sm text-ink" style={{ minHeight: `${rows * 1.5 + 1.25}rem` }}>
          {value.trim() ? <MarkdownText>{value}</MarkdownText> : <span className="text-ink-3">Rien à prévisualiser.</span>}
        </div>
      )}
    </div>
  );
}
