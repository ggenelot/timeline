import { AppSettings } from '@/lib/types';

// Valeurs d'origine de la maquette (#397), utilisées quand aucun réglage
// n'est présent en base ni en variable d'environnement.
export const FALLBACK_SETTINGS: AppSettings = {
  logoUrl: '/logo.png',
  brandColor: '#002D74',
  accentColor: '#FF7F30',
  fontSans: null,
  fontDisplay: null,
  fontHand: null,
  orgName: 'Protec du 8 & du 9',
  orgTagline: 'Protection Civile Paris Seine',
  loginGreeting: 'contente de te revoir'
};

// Repli « variable d'environnement » (issue #398) : permet de personnaliser
// l'appli sans passer par la page d'admin, par ex. avant la première
// connexion ou sur un déploiement sans interface d'admin exposée.
//
// N'inclut que les clés réellement définies : un spread `{ ...FALLBACK, ...X }`
// où X porte des clés à `undefined` écraserait les valeurs par défaut.
export function getEnvSettings(): Partial<AppSettings> {
  const raw: Partial<AppSettings> = {
    logoUrl: process.env.NEXT_PUBLIC_BRAND_LOGO_URL,
    brandColor: process.env.NEXT_PUBLIC_BRAND_COLOR,
    accentColor: process.env.NEXT_PUBLIC_ACCENT_COLOR,
    fontSans: process.env.NEXT_PUBLIC_BRAND_FONT_SANS,
    fontDisplay: process.env.NEXT_PUBLIC_BRAND_FONT_DISPLAY,
    fontHand: process.env.NEXT_PUBLIC_BRAND_FONT_HAND,
    orgName: process.env.NEXT_PUBLIC_ORG_NAME,
    orgTagline: process.env.NEXT_PUBLIC_ORG_TAGLINE,
    loginGreeting: process.env.NEXT_PUBLIC_LOGIN_GREETING
  };

  return Object.fromEntries(Object.entries(raw).filter(([, value]) => Boolean(value))) as Partial<AppSettings>;
}
