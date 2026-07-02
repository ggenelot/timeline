import type { Metadata } from 'next';
import { Source_Sans_3, Anton, Beth_Ellen } from 'next/font/google';
import './globals.css';
import { AppShell } from '@/components/app-shell';
import { AuthGuard } from '@/components/auth-guard';
import { HelpButton } from '@/components/help-button';

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
      <body>
        <AuthGuard>
          <AppShell>{children}</AppShell>
          <HelpButton />
        </AuthGuard>
      </body>
    </html>
  );
}
