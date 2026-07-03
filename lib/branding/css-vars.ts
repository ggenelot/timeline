import { AppSettings } from '@/lib/types';

/**
 * "#RRGGBB" → "R G B" (canaux décimaux). Nécessaire pour piloter les
 * utilitaires Tailwind avec opacité (`ring-brand/30`) : Tailwind ne peut
 * substituer `<alpha-value>` que si le thème référence des canaux bruts via
 * `rgb(var(--x) / <alpha-value>)`, pas une couleur déjà résolue (hex ou var()).
 */
function hexToRgbChannels(hex: string, fallback: string): string {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) return fallback;

  const int = parseInt(match[1], 16);
  return `${(int >> 16) & 255} ${(int >> 8) & 255} ${int & 255}`;
}

/**
 * Dérive les nuances (hover, texte, fond adouci…) des deux couleurs de marque
 * via color-mix() plutôt que de stocker une palette complète en base : un
 * admin ne choisit que deux couleurs, le reste suit automatiquement.
 */
export function buildBrandCssVars(settings: AppSettings): Record<string, string> {
  const { brandColor, accentColor } = settings;

  return {
    '--color-brand': brandColor,
    '--color-brand-rgb': hexToRgbChannels(brandColor, '0 45 116'),
    '--color-brand-for': `color-mix(in srgb, white 14%, ${brandColor})`,
    '--color-brand-shadow': `color-mix(in srgb, transparent 50%, ${brandColor})`,
    '--color-accent': accentColor,
    '--color-accent-rgb': hexToRgbChannels(accentColor, '255 127 48'),
    '--color-accent-text': `color-mix(in srgb, black 30%, ${accentColor})`,
    '--color-accent-soft': `color-mix(in srgb, white 91%, ${accentColor})`,
    '--color-accent-ring': `color-mix(in srgb, white 72%, ${accentColor})`,
    '--font-sans-active': settings.fontSans ? `"${settings.fontSans}", var(--font-source-sans), sans-serif` : 'var(--font-source-sans)',
    '--font-display-active': settings.fontDisplay ? `"${settings.fontDisplay}", var(--font-anton), sans-serif` : 'var(--font-anton)',
    '--font-hand-active': settings.fontHand ? `"${settings.fontHand}", var(--font-beth-ellen), cursive` : 'var(--font-beth-ellen)'
  };
}

/**
 * URL Google Fonts CSS2 pour les polices personnalisées (repli next/font par
 * défaut sinon — voir branding-context.tsx). Même mécanisme que Material Symbols.
 */
export function buildCustomFontsHref(settings: AppSettings): string | null {
  const families = [settings.fontSans, settings.fontDisplay, settings.fontHand]
    .filter((f): f is string => Boolean(f?.trim()))
    .map((f) => f.trim());

  if (families.length === 0) return null;

  const unique = Array.from(new Set(families));
  const query = unique
    .map((family) => `family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@400;600;700`)
    .join('&');

  return `https://fonts.googleapis.com/css2?${query}&display=swap`;
}
