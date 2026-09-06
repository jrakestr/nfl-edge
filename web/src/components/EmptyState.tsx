import type { ReactNode } from "react";

/** One-line empty state naming what fills the screen. */
export function EmptyState({
  title,
  children,
  className,
}: {
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card flex flex-col gap-1 p-4 ${className ?? ""}`}>
      <h2 className="t-title text-[15px] leading-5">{title}</h2>
      {children ? <p className="t-sentence text-muted-foreground">{children}</p> : null}
    </section>
  );
}
