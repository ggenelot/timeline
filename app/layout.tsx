import type { Metadata } from 'next';
import './globals.css';
import { Header } from '@/components/header';
import { AuthGuard } from '@/components/auth-guard';

export const metadata: Metadata = {
  title: 'Timeline',
  description: 'Gestion simple des missions de bénévoles'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <AuthGuard>
          <Header />
          <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
        </AuthGuard>
      </body>
    </html>
  );
}
