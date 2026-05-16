'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { HelpPage } from '@/lib/types';

function inlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code class="rounded bg-slate-100 px-1 font-mono text-xs">$1</code>');
}

function MarkdownContent({ content }: { content: string }) {
  const nodes: React.ReactNode[] = [];
  let listItems: string[] = [];
  let key = 0;

  function flushList() {
    if (listItems.length === 0) return;
    nodes.push(
      <ul key={key++} className="list-disc space-y-1 pl-5">
        {listItems.map((item, i) => (
          <li key={i} className="text-sm text-slate-700" dangerouslySetInnerHTML={{ __html: inlineMarkdown(item) }} />
        ))}
      </ul>,
    );
    listItems = [];
  }

  for (const line of content.split('\n')) {
    if (line.startsWith('### ')) {
      flushList();
      nodes.push(<h3 key={key++} className="mt-4 mb-1 text-sm font-semibold text-slate-800">{line.slice(4)}</h3>);
    } else if (line.startsWith('## ')) {
      flushList();
      nodes.push(<h2 key={key++} className="mt-4 mb-1 text-base font-semibold text-slate-900">{line.slice(3)}</h2>);
    } else if (line.startsWith('# ')) {
      flushList();
      nodes.push(<h1 key={key++} className="mb-2 text-lg font-bold text-slate-900">{line.slice(2)}</h1>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      listItems.push(line.slice(2));
    } else if (line.trim() === '') {
      flushList();
    } else {
      flushList();
      nodes.push(
        <p key={key++} className="text-sm leading-relaxed text-slate-700" dangerouslySetInnerHTML={{ __html: inlineMarkdown(line) }} />,
      );
    }
  }
  flushList();

  return <div className="space-y-2">{nodes}</div>;
}

export function HelpButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [helpPage, setHelpPage] = useState<HelpPage | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setHelpPage(undefined);
  }, [pathname]);

  async function openHelp() {
    setOpen(true);
    if (helpPage !== undefined) return;

    setLoading(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token ?? '';
    const res = await fetch(`/api/help?path=${encodeURIComponent(pathname)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const json = (await res.json()) as { helpPage: HelpPage | null };
      setHelpPage(json.helpPage);
    } else {
      setHelpPage(null);
    }
    setLoading(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={openHelp}
        aria-label="Aide"
        className="fixed bottom-6 right-6 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-md transition-colors hover:bg-slate-50 hover:text-slate-800"
      >
        <span className="text-base font-semibold leading-none">?</span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-end p-6 sm:items-center sm:justify-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 className="text-base font-semibold text-slate-900">
                {loading ? 'Chargement…' : (helpPage?.title ?? 'Aide')}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {loading ? (
                <p className="text-sm text-slate-400">Chargement…</p>
              ) : helpPage ? (
                <MarkdownContent content={helpPage.content} />
              ) : (
                <p className="text-sm text-slate-400">Aucune aide disponible pour cette page.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
