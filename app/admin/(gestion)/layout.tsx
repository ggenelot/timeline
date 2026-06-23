// La navigation entre les pages de gestion se fait désormais via le menu latéral
// (barre latérale). L'ancienne barre d'onglets horizontale a été retirée.
export default function AdminGestionLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-w-0">{children}</div>;
}
