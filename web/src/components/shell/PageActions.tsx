"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/**
 * Pages register their top-bar actions by rendering <PageActions>…</PageActions>
 * anywhere in their tree; TopBar renders the registered node in its actions slot.
 */
type Ctx = { node: ReactNode; setNode: (n: ReactNode) => void };

const PageActionsContext = createContext<Ctx | null>(null);

export function PageActionsProvider({ children }: { children: ReactNode }) {
  const [node, setNode] = useState<ReactNode>(null);
  return (
    <PageActionsContext.Provider value={{ node, setNode }}>
      {children}
    </PageActionsContext.Provider>
  );
}

export function PageActions({ children }: { children: ReactNode }) {
  const ctx = useContext(PageActionsContext);
  useEffect(() => {
    if (!ctx) return;
    ctx.setNode(children);
    return () => ctx.setNode(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children]);
  return null;
}

export function usePageActions(): ReactNode {
  return useContext(PageActionsContext)?.node ?? null;
}
