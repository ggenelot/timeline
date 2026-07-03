'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { AppSettings } from '@/lib/types';
import { FALLBACK_SETTINGS, getEnvSettings } from '@/lib/branding/constants';
import { buildBrandCssVars, buildCustomFontsHref } from '@/lib/branding/css-vars';

type AppSettingsRow = {
  logo_url: string | null;
  brand_color: string | null;
  accent_color: string | null;
  font_sans: string | null;
  font_display: string | null;
  font_hand: string | null;
  org_name: string | null;
  org_tagline: string | null;
  login_greeting: string | null;
};

const CUSTOM_FONTS_LINK_ID = 'branding-custom-fonts';

// Repli immédiat (avant que le fetch Supabase n'aboutisse) : variables
// d'environnement puis, à défaut, la charte d'origine de la maquette #397.
const INITIAL_SETTINGS: AppSettings = { ...FALLBACK_SETTINGS, ...getEnvSettings() };

const BrandingContext = createContext<AppSettings>(INITIAL_SETTINGS);

function applyToDocument(settings: AppSettings) {
  const root = document.documentElement;
  Object.entries(buildBrandCssVars(settings)).forEach(([property, value]) => {
    root.style.setProperty(property, value);
  });

  const href = buildCustomFontsHref(settings);
  const existingLink = document.getElementById(CUSTOM_FONTS_LINK_ID) as HTMLLinkElement | null;

  if (!href) {
    existingLink?.remove();
    return;
  }

  if (existingLink) {
    existingLink.href = href;
    return;
  }

  const link = document.createElement('link');
  link.id = CUSTOM_FONTS_LINK_ID;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

/**
 * Résolue côté client (lecture publique RLS sur `app_settings`) plutôt que
 * côté serveur : l'app est rendue en pages statiques/client components, un
 * fetch serveur dans le layout figerait la charte au moment du build.
 */
export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(INITIAL_SETTINGS);

  useEffect(() => {
    let cancelled = false;

    // Posé immédiatement (repli env/maquette) : si le fetch échoue ou que la
    // table n'est pas encore migrée, la charte par défaut reste appliquée au
    // lieu de laisser les variables CSS indéfinies.
    applyToDocument(INITIAL_SETTINGS);

    async function load() {
      const { data, error } = await supabase
        .from('app_settings')
        .select('logo_url,brand_color,accent_color,font_sans,font_display,font_hand,org_name,org_tagline,login_greeting')
        .eq('id', 1)
        .maybeSingle<AppSettingsRow>();

      if (cancelled || error || !data) return;

      const resolved: AppSettings = {
        logoUrl: data.logo_url || INITIAL_SETTINGS.logoUrl,
        brandColor: data.brand_color || INITIAL_SETTINGS.brandColor,
        accentColor: data.accent_color || INITIAL_SETTINGS.accentColor,
        fontSans: data.font_sans || INITIAL_SETTINGS.fontSans,
        fontDisplay: data.font_display || INITIAL_SETTINGS.fontDisplay,
        fontHand: data.font_hand || INITIAL_SETTINGS.fontHand,
        orgName: data.org_name || INITIAL_SETTINGS.orgName,
        orgTagline: data.org_tagline || INITIAL_SETTINGS.orgTagline,
        loginGreeting: data.login_greeting || INITIAL_SETTINGS.loginGreeting
      };

      setSettings(resolved);
      applyToDocument(resolved);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return <BrandingContext.Provider value={settings}>{children}</BrandingContext.Provider>;
}

/** Accès côté client (Header, sidebar, login…) aux réglages de charte graphique. */
export function useBranding(): AppSettings {
  return useContext(BrandingContext);
}
