"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/**
 * Shell slots. Pages register content for the top bar's actions slot and the sidebar footer
 * (where the RunBadge is pinned) by rendering <PageActions> / <SidebarFooter> anywhere in
 * their tree; the shell renders whatever is registered. Pages stay server components; the
 * registered nodes are the only client boundary.
 */
type Slots = { actions: ReactNode; footer: ReactNode };
type Ctx = Slots & { set: (patch: Partial<Slots>) => void };

const SlotContext = createContext<Ctx | null>(null);

export function PageActionsProvider({ children }: { children: ReactNode }) {
  const [slots, setSlots] = useState<Slots>({ actions: null, footer: null });
  const set = (patch: Partial<Slots>) => setSlots((s) => ({ ...s, ...patch }));
  return <SlotContext.Provider value={{ ...slots, set }}>{children}</SlotContext.Provider>;
}

function useRegister(key: keyof Slots, node: ReactNode) {
  const ctx = useContext(SlotContext);
  useEffect(() => {
    if (!ctx) return;
    ctx.set({ [key]: node });
    return () => ctx.set({ [key]: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node]);
}

export function PageActions({ children }: { children: ReactNode }) {
  useRegister("actions", children);
  return null;
}

export function SidebarFooter({ children }: { children: ReactNode }) {
  useRegister("footer", children);
  return null;
}

export function usePageActions(): ReactNode {
  return useContext(SlotContext)?.actions ?? null;
}

export function useSidebarFooter(): ReactNode {
  return useContext(SlotContext)?.footer ?? null;
}
