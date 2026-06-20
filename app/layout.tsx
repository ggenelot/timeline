import type { Metadata } from 'next';
import { Hanken_Grotesk } from 'next/font/google';
import './globals.css';
import { Header } from '@/components/header';
import { AuthGuard } from '@/components/auth-guard';
import { HelpButton } from '@/components/help-button';

const hanken = Hanken_Grotesk({
  subsets: ['latin'],
  variable: '--font-hanken',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Timeline',
  description: 'Gestion simple des missions de bénévoles'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={hanken.variable}>
      <body>
        <AuthGuard>
          <Header />
          <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
          <HelpButton />
        </AuthGuard>
      </body>
    </html>
  );
}
