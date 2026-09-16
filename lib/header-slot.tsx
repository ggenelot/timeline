'use client';

import { createContext, useContext, useEffect, useState } from 'react';

// Permet à une page de glisser un contenu compact dans le header sticky mobile,
// sous la ligne logo/titre (ex. mini-sélecteur de peinture de « Mes dispos »).
// Le header vit dans `AppShell`, hors de l'arbre des pages : ce contexte fait le
// pont sans lever l'état jusqu'au layout.
type HeaderSlotContextValue = {
  content: React.ReactNode;
  setContent: (node: React.ReactNode) => void;
};

const HeaderSlotContext = createContext<HeaderSlotContextValue | null>(null);

export function HeaderSlotProvider({ children }: { children: React.ReactNode }) {
  const [content, setContent] = useState<React.ReactNode>(null);
  return <HeaderSlotContext.Provider value={{ content, setContent }}>{children}</HeaderSlotContext.Provider>;
}

/** Contenu courant du slot — consommé par le header pour l'afficher. */
export function useHeaderSlotOutlet(): React.ReactNode {
  return useContext(HeaderSlotContext)?.content ?? null;
}

/**
 * Injecte `node` dans le header sticky ; `null` = rien. Le contenu est retiré au
 * démontage (navigation) pour ne pas fuiter sur les autres pages. Mémoriser
 * `node` côté appelant (useMemo) évite de reposer le slot à chaque rendu.
 */
export function useHeaderSlot(node: React.ReactNode): void {
  const setContent = useContext(HeaderSlotContext)?.setContent;
  useEffect(() => {
    if (!setContent) return;
    setContent(node);
    return () => setContent(null);
  }, [node, setContent]);
}
