import type { CSSProperties, ButtonHTMLAttributes, ReactNode } from 'react';

// ── Shared admin design tokens (aligned with the Cursus admin page) ──────────
// White rounded cards, soft shadows, slate palette, emerald primary.

export const adminInputStyle: CSSProperties = {
  width: '100%',
  border: '1px solid #cbd5e1',
  borderRadius: 9,
  padding: '10px 12px',
  fontSize: 14,
  color: '#0f172a',
  outline: 'none',
  fontFamily: 'inherit',
  background: '#fff',
};

export const adminTextareaStyle: CSSProperties = {
  ...adminInputStyle,
  minHeight: 96,
  resize: 'vertical',
  lineHeight: 1.5,
};

export const adminSelectStyle: CSSProperties = {
  ...adminInputStyle,
  cursor: 'pointer',
};

export const cardStyle: CSSProperties = {
  background: '#fff',
  border: '1px solid #e7e9ee',
  borderRadius: 16,
  boxShadow: '0 2px 10px rgba(15,23,42,.05)',
};

export const primaryButtonStyle: CSSProperties = {
  cursor: 'pointer',
  border: 'none',
  background: '#059669',
  color: '#fff',
  borderRadius: 9,
  padding: '10px 18px',
  fontSize: 13.5,
  fontWeight: 700,
  fontFamily: 'inherit',
};

export const ghostButtonStyle: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid #e2e8f0',
  background: '#fff',
  color: '#475569',
  borderRadius: 9,
  padding: '9px 16px',
  fontSize: 13,
  fontWeight: 700,
  fontFamily: 'inherit',
  textDecoration: 'none',
  display: 'inline-block',
};

export const dangerButtonStyle: CSSProperties = {
  cursor: 'pointer',
  border: 'none',
  background: '#dc2626',
  color: '#fff',
  borderRadius: 9,
  padding: '10px 18px',
  fontSize: 13.5,
  fontWeight: 700,
  fontFamily: 'inherit',
};

export function pillStyle(active: boolean): CSSProperties {
  return {
    cursor: 'pointer',
    borderRadius: 999,
    padding: '7px 15px',
    fontSize: 13,
    fontWeight: 700,
    fontFamily: 'inherit',
    transition: 'background .12s, border-color .12s',
    border: `1px solid ${active ? '#6ee7b7' : '#e2e8f0'}`,
    background: active ? '#d1fae5' : '#fff',
    color: active ? '#047857' : '#334155',
  };
}

export function AdminCard({
  children,
  style,
  padding = '20px 22px',
}: {
  children: ReactNode;
  style?: CSSProperties;
  padding?: number | string;
}) {
  return <div style={{ ...cardStyle, padding, ...style }}>{children}</div>;
}

export function AdminPageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ margin: 0, fontSize: 25, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>{title}</h1>
        {subtitle ? (
          <p style={{ margin: '7px 0 0', fontSize: 13.5, color: '#64748b', lineHeight: 1.5, maxWidth: 680 }}>{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{actions}</div> : null}
    </div>
  );
}

export function AdminSectionLabel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: '#94a3b8', ...style }}>
      {children}
    </div>
  );
}

export function AdminFieldLabel({ children, hint, htmlFor }: { children: ReactNode; hint?: ReactNode; htmlFor?: string }) {
  const labelStyle: CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 7 };
  const content = (
    <>
      {children}
      {hint ? <span style={{ color: '#94a3b8', fontWeight: 600 }}> {hint}</span> : null}
    </>
  );
  // Render a real <label htmlFor> when an input id is provided so the control is
  // programmatically named for screen readers / voice control; fall back to <div>.
  return htmlFor ? (
    <label htmlFor={htmlFor} style={labelStyle}>{content}</label>
  ) : (
    <div style={labelStyle}>{content}</div>
  );
}

export function AdminBanner({ tone, children }: { tone: 'error' | 'success'; children: ReactNode }) {
  const isError = tone === 'error';
  return (
    <div
      style={{
        background: isError ? '#fef2f2' : '#ecfdf5',
        border: `1px solid ${isError ? '#fecaca' : '#a7f3d0'}`,
        borderRadius: 10,
        padding: '12px 16px',
        fontSize: 13,
        color: isError ? '#dc2626' : '#047857',
      }}
    >
      {children}
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' };

export function AdminButton({ variant = 'primary', style, disabled, ...rest }: ButtonProps) {
  const base = variant === 'ghost' ? ghostButtonStyle : variant === 'danger' ? dangerButtonStyle : primaryButtonStyle;
  return <button {...rest} disabled={disabled} style={{ ...base, ...(disabled ? { opacity: 0.55, cursor: 'not-allowed' } : null), ...style }} />;
}
