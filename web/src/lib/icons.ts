import {
  Calendar,
  CircleDollarSign,
  CircleSlash,
  ClipboardCheck,
  Crosshair,
  Layers,
  LayoutDashboard,
  Lock,
  Percent,
  Ratio,
  Target,
  Trophy,
  UnfoldVertical,
  Users,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { createElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Lucide map for the sidebar. Same 14px / stroke 1.5 as MetricIcon. */
export const NAV_ICONS = {
  board: LayoutDashboard,
  games: Calendar,
  players: Users,
  optimize: Wand2,
  props: Crosshair,
  lineups: Layers,
  grading: ClipboardCheck,
} as const satisfies Record<string, LucideIcon>;

export type NavIcon = keyof typeof NAV_ICONS;

/** Lucide map for DFS / edge metrics. */
export const METRICS = {
  projection: Target,
  salary: CircleDollarSign,
  value: Ratio,
  ownership: Users,
  leverage: UnfoldVertical,
  winPct: Trophy,
  roi: Percent,
  edge: Crosshair,
  stack: Layers,
  lock: Lock,
  exclude: CircleSlash,
} as const satisfies Record<string, LucideIcon>;

export type Metric = keyof typeof METRICS;

export const METRIC_KEYS = Object.keys(METRICS) as Metric[];

/** 14px, stroke 1.5. Sits immediately before a header or tile label. Decorative. */
export function MetricIcon({ metric, className }: { metric: Metric; className?: string }) {
  return createElement(METRICS[metric], {
    size: 14,
    strokeWidth: 1.5,
    className: cn("shrink-0", className),
    "aria-hidden": true,
  });
}

export function MetricLabel({
  metric,
  children,
  className,
}: {
  metric: Metric;
  children: ReactNode;
  className?: string;
}) {
  return createElement(
    "span",
    { className: cn("inline-flex items-center gap-1", className) },
    createElement(MetricIcon, { metric }),
    children,
  );
}
