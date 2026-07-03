import type { Metadata } from 'next';
import { Source_Sans_3, Anton, Beth_Ellen } from 'next/font/google';
import './globals.css';
import { AppShell } from '@/components/app-shell';
import { AuthGuard } from '@/components/auth-guard';
import { HelpButton } from '@/components/help-button';
import { BrandingProvider } from '@/lib/branding/branding-context';

const sourceSans = Source_Sans_3({
  subsets: ['latin'],
  variable: '--font-source-sans',
  display: 'swap',
});

const anton = Anton({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-anton',
  display: 'swap',
});

const bethEllen = Beth_Ellen({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-beth-ellen',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Timeline',
  description: 'Gestion simple des missions de bénévoles'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="fr"
      className={`${sourceSans.variable} ${anton.variable} ${bethEllen.variable}`}
    >
      <head>
        {/* Material Symbols Rounded — police d'icônes (non dispo via next/font pour cette version). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font, @next/next/google-font-display -- police d'icônes chargée globalement (App Router root layout) ; display:block volontaire pour éviter le FOUT des ligatures */}
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20,400,0,0&display=block"
          rel="stylesheet"
        />
      </head>
      <body>
        {/* Logo/couleurs/polices personnalisables — voir lib/branding/. Appliquées côté client (CSS custom properties) une fois lues depuis `app_settings`. */}
        <BrandingProvider>
          <AuthGuard>
            <AppShell>{children}</AppShell>
            <HelpButton />
          </AuthGuard>
        </BrandingProvider>
      </body>
    </html>
  );
}
