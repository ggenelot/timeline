'use client';

import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

// react-markdown n'interprète pas le HTML brut : le contenu saisi par les
// bénévoles ne peut donc pas injecter de balises.
const components: Components = {
  p: ({ children }) => <p className="my-1 first:mt-0 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-bold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className="my-1 list-disc pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-1 list-decimal pl-5">{children}</ol>,
  li: ({ children }) => <li className="my-0.5">{children}</li>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent-text underline">
      {children}
    </a>
  ),
  code: ({ children }) => <code className="rounded bg-surface px-1 font-mono text-[0.92em]">{children}</code>,
  blockquote: ({ children }) => <blockquote className="my-1 border-l-2 border-line-field pl-2.5 text-ink-3">{children}</blockquote>,
  h1: ({ children }) => <div className="my-1 font-extrabold">{children}</div>,
  h2: ({ children }) => <div className="my-1 font-extrabold">{children}</div>,
  h3: ({ children }) => <div className="my-1 font-bold">{children}</div>,
  img: () => null,
};

export function MarkdownText({ children, className }: { children: string; className?: string }) {
  return (
    <div className={`break-words ${className ?? ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
