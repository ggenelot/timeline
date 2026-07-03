import type { CSSProperties, ButtonHTMLAttributes, ReactNode } from 'react';

// ── Shared admin design tokens (aligned with the refonte UI palette) ─────────
// White rounded cards, soft shadows, ink text palette, brand primary.

export const adminInputStyle: CSSProperties = {
  width: '100%',
  border: '1px solid #DCE2EC',
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: 14,
  color: '#16203A',
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
  border: '1px solid #E6EAF2',
  borderRadius: 16,
  boxShadow: '0 6px 18px -12px rgba(20,32,58,.2)',
};

export const primaryButtonStyle: CSSProperties = {
  cursor: 'pointer',
  border: 'none',
  background: 'var(--color-brand, #002D74)',
  color: '#fff',
  borderRadius: 11,
  padding: '10px 18px',
  fontSize: 13.5,
  fontWeight: 700,
  fontFamily: 'inherit',
};

export const ghostButtonStyle: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid #DCE2EC',
  background: '#fff',
  color: '#5B6478',
  borderRadius: 11,
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
  background: '#D14343',
  color: '#fff',
  borderRadius: 11,
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
    border: `1px solid ${active ? 'var(--color-accent-ring, #FBDCC4)' : '#DCE2EC'}`,
    background: active ? 'var(--color-accent-soft, #FFF1E7)' : '#fff',
    color: active ? 'var(--color-accent-text, #B4590F)' : '#5B6478',
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
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, color: '#16203A', letterSpacing: '-0.02em' }}>{title}</h1>
        {subtitle ? (
          <p style={{ margin: '7px 0 0', fontSize: 13.5, color: '#5B6478', lineHeight: 1.5, maxWidth: 680 }}>{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{actions}</div> : null}
    </div>
  );
}

export function AdminSectionLabel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: '#8A93A6', ...style }}>
      {children}
    </div>
  );
}

export function AdminFieldLabel({ children, hint, htmlFor }: { children: ReactNode; hint?: ReactNode; htmlFor?: string }) {
  const labelStyle: CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 700, color: '#5B6478', marginBottom: 7 };
  const content = (
    <>
      {children}
      {hint ? <span style={{ color: '#8A93A6', fontWeight: 600 }}> {hint}</span> : null}
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
        background: isError ? '#FDEAEA' : '#E9F7EF',
        border: `1px solid ${isError ? '#F3C7C7' : '#BDE7CE'}`,
        borderRadius: 10,
        padding: '12px 16px',
        fontSize: 13,
        color: isError ? '#D14343' : '#12805A',
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
