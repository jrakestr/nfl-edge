"use client";

import { Suspense, useLayoutEffect, useMemo, useRef } from "react";
import { flexRender, type SortingState } from "@tanstack/react-table";
import {
  getCoreRowModel,
  getSortedRowModel,
  useLegacyTable as useReactTable,
  type LegacyColumnDef as ColumnDef,
} from "@tanstack/react-table/legacy";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { MetricLabel, type Metric } from "@/lib/icons";
import { useTableState, type TableState } from "@/lib/table-state";
import { cn } from "@/lib/utils";

export type DataColumn<T> = {
  id: string;
  header: string;
  sortable?: boolean;
  align?: "left" | "right";
  metric?: Metric;
  sortValue?: (row: T) => string | number | null | undefined;
  cell: (row: T) => React.ReactNode;
  className?: string;
  headClassName?: string;
};

export type FilterAccess<T> = {
  search?: (row: T, q: string) => boolean;
  position?: (row: T) => string | null | undefined;
  team?: (row: T) => string | null | undefined;
  game?: (row: T) => string | null | undefined;
  salary?: (row: T) => number | null | undefined;
  minProj?: (row: T) => number | null | undefined;
  hideUnproj?: (row: T) => number | null | undefined;
  pool?: (row: T) => string | null | undefined;
  health?: (row: T) => string | null | undefined;
};

export type DataTableProps<T> = {
  data: T[];
  columns: DataColumn<T>[];
  getRowId: (row: T) => string;
  empty: string;
  ariaLabel: string;
  filters?: FilterAccess<T>;
  searchPlaceholder?: string;
  minProjLabel?: string;
  syncUrl?: boolean;
  defaultSort?: { id: string; dir: "asc" | "desc" };
  toolbar?: React.ReactNode;
  /** Keeps the column header (and optional note) under the top bar while the page scrolls. */
  stickyHeader?: boolean;
  headerNote?: React.ReactNode;
  onRowClick?: (row: T) => void;
  rowProps?: (row: T, index: number) => React.ComponentProps<typeof TableRow>;
};

function numOrNull(raw: string): number | null {
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function applyViewFilters<T>(rows: T[], state: TableState, access?: FilterAccess<T>): T[] {
  if (!access) return rows;
  const q = state.q.trim().toLowerCase();
  const salMin = numOrNull(state.salMin);
  const salMax = numOrNull(state.salMax);
  const minProj = numOrNull(state.minProj);
  return rows.filter((row) => {
    if (q && access.search && !access.search(row, q)) return false;
    if (state.pos && access.position && (access.position(row) ?? "") !== state.pos) return false;
    if (state.team && access.team && (access.team(row) ?? "") !== state.team) return false;
    if (state.game && access.game && (access.game(row) ?? "") !== state.game) return false;
    if (access.salary) {
      const s = access.salary(row);
      if (salMin != null && (s == null || s < salMin)) return false;
      if (salMax != null && (s == null || s > salMax)) return false;
    }
    if (minProj != null && access.minProj) {
      const p = access.minProj(row);
      if (p == null || p < minProj) return false;
    }
    if (state.pool && access.pool && (access.pool(row) ?? "") !== state.pool) return false;
    if (state.health && access.health && (access.health(row) ?? "") !== state.health) return false;
    return true;
  });
}

function applyHideUnproj<T>(rows: T[], state: TableState, access?: FilterAccess<T>): T[] {
  if (!access?.hideUnproj || state.showunproj) return rows;
  return rows.filter((row) => access.hideUnproj!(row) != null);
}

function unique<T>(rows: T[], pick: (row: T) => string | null | undefined): string[] {
  return [...new Set(rows.map(pick).filter((v): v is string => !!v))].sort();
}

export function DataTable<T extends object>(props: DataTableProps<T>) {
  return (
    <Suspense
      fallback={
        <section className="card p-4 t-caption" aria-label={props.ariaLabel}>
          {props.empty}
        </section>
      }
    >
      <DataTableInner {...props} />
    </Suspense>
  );
}

function DataTableInner<T extends object>({
  data,
  columns,
  getRowId,
  empty,
  ariaLabel,
  filters,
  searchPlaceholder = "Search",
  minProjLabel = "Min proj",
  syncUrl = true,
  defaultSort,
  toolbar,
  stickyHeader = false,
  headerNote,
  onRowClick,
  rowProps,
}: DataTableProps<T>) {
  const [state, setState] = useTableState(syncUrl);
  const viewed = useMemo(() => applyViewFilters(data, state, filters), [data, state, filters]);
  const unprojCount = filters?.hideUnproj
    ? viewed.filter((row) => filters.hideUnproj!(row) == null).length
    : 0;
  const filtered = useMemo(() => applyHideUnproj(viewed, state, filters), [viewed, state, filters]);

  const sortId = state.sort ?? defaultSort?.id ?? null;
  const sortDir = state.sort ? state.dir : (defaultSort?.dir ?? "desc");
  const sorting: SortingState = sortId ? [{ id: sortId, desc: sortDir === "desc" }] : [];

  const defs = useMemo<ColumnDef<T>[]>(
    () =>
      columns.map((col) => ({
        id: col.id,
        accessorFn: (row) => col.sortValue?.(row) ?? "",
        enableSorting: col.sortable !== false,
        header: col.header,
        cell: ({ row }) => col.cell(row.original),
        meta: col,
      })),
    [columns],
  );

  const table = useReactTable({
    data: filtered,
    columns: defs,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => getRowId(row),
    state: { sorting },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      const first = next[0];
      if (!first) setState({ sort: null });
      else setState({ sort: first.id, dir: first.desc ? "desc" : "asc" });
    },
  });

  const showBar = Boolean(
    filters &&
      (filters.search ||
        filters.position ||
        filters.team ||
        filters.game ||
        filters.salary ||
        filters.minProj ||
        filters.hideUnproj ||
        filters.pool ||
        filters.health),
  );
  const positions = filters?.position ? unique(data, filters.position) : [];
  const teams = filters?.team ? unique(data, filters.team) : [];
  const games = filters?.game ? unique(data, filters.game) : [];
  const pools = filters?.pool ? unique(data, filters.pool) : [];
  const healths = filters?.health ? unique(data, filters.health) : [];

  const scrollRef = useRef<HTMLDivElement>(null);
  const headTableRef = useRef<HTMLTableElement>(null);

  useLayoutEffect(() => {
    if (!stickyHeader) return;
    const scroller = scrollRef.current;
    const head = headTableRef.current;
    if (!scroller || !head) return;
    const bodyTable = scroller.querySelector("table");
    if (!bodyTable) return;

    const apply = () => {
      const src = bodyTable.querySelectorAll("thead tr:last-child th");
      const dst = head.querySelectorAll("thead tr:last-child th");
      head.style.width = `${bodyTable.offsetWidth}px`;
      head.style.transform = `translateX(${-scroller.scrollLeft}px)`;
      src.forEach((cell, i) => {
        const th = dst[i] as HTMLElement | undefined;
        if (!th) return;
        const w = `${cell.getBoundingClientRect().width}px`;
        th.style.width = w;
        th.style.minWidth = w;
        th.style.maxWidth = w;
      });
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(bodyTable);
    scroller.addEventListener("scroll", apply, { passive: true });
    window.addEventListener("resize", apply);
    return () => {
      ro.disconnect();
      scroller.removeEventListener("scroll", apply);
      window.removeEventListener("resize", apply);
    };
  }, [stickyHeader, filtered, columns, sortId, sortDir]);

  const headerRows = (mode: "frozen" | "layout" | "normal") => (
    <TableHeader
      inert={mode === "layout" ? true : undefined}
      aria-hidden={mode === "layout" ? true : undefined}
      className={cn("bg-muted", mode === "frozen" && "sticky")}
      style={mode === "layout" ? { visibility: "collapse" } : undefined}
    >
      {mode !== "layout" && headerNote ? (
        <TableRow className="hover:bg-transparent">
          <TableHead colSpan={columns.length} className="h-auto bg-muted py-2">
            {headerNote}
          </TableHead>
        </TableRow>
      ) : null}
      {table.getHeaderGroups().map((hg) => (
        <TableRow key={hg.id} className="hover:bg-transparent">
          {hg.headers.map((h) => {
            const col = columns.find((c) => c.id === h.id);
            const sortable = col?.sortable !== false;
            const active = sortId === h.id;
            const label = (
              <span className={cn("inline-flex items-center gap-1", col?.align === "right" && "justify-end")}>
                {col?.metric ? <MetricLabel metric={col.metric}>{col.header}</MetricLabel> : col?.header}
                {sortable ? (
                  active ? (
                    sortDir === "asc" ? (
                      <ArrowUp size={14} strokeWidth={1.5} aria-hidden />
                    ) : (
                      <ArrowDown size={14} strokeWidth={1.5} aria-hidden />
                    )
                  ) : (
                    <ChevronsUpDown size={14} strokeWidth={1.5} aria-hidden />
                  )
                ) : null}
              </span>
            );
            return (
              <TableHead
                key={h.id}
                className={cn(
                  "t-colhead text-muted-foreground",
                  mode !== "layout" && "bg-muted",
                  col?.align === "right" && "text-right",
                  col?.headClassName,
                )}
              >
                {sortable ? (
                  <button
                    type="button"
                    className="inline-flex items-center"
                    onClick={h.column.getToggleSortingHandler()}
                    tabIndex={mode === "layout" ? -1 : undefined}
                  >
                    {label}
                  </button>
                ) : (
                  label
                )}
              </TableHead>
            );
          })}
        </TableRow>
      ))}
    </TableHeader>
  );

  return (
    <div className="flex flex-col gap-4">
      {showBar ? (
        <div className="flex flex-wrap items-end gap-3">
          {filters?.search ? (
            <label className="flex max-w-sm flex-col gap-1">
              <span className="t-colhead text-muted-foreground">Search</span>
              <Input
                placeholder={searchPlaceholder}
                value={state.q}
                onChange={(e) => setState({ q: e.target.value })}
              />
            </label>
          ) : null}
          {filters?.position ? (
            <SelectFilter label="Position" value={state.pos} options={positions} onChange={(pos) => setState({ pos })} />
          ) : null}
          {filters?.team ? (
            <SelectFilter label="Team" value={state.team} options={teams} onChange={(team) => setState({ team })} />
          ) : null}
          {filters?.game ? (
            <SelectFilter label="Game" value={state.game} options={games} onChange={(game) => setState({ game })} />
          ) : null}
          {filters?.salary ? (
            <span className="flex items-end gap-2">
              <label className="flex w-24 flex-col gap-1">
                <span className="t-colhead text-muted-foreground">Salary min</span>
                <Input inputMode="numeric" value={state.salMin} onChange={(e) => setState({ salMin: e.target.value })} />
              </label>
              <label className="flex w-24 flex-col gap-1">
                <span className="t-colhead text-muted-foreground">Salary max</span>
                <Input inputMode="numeric" value={state.salMax} onChange={(e) => setState({ salMax: e.target.value })} />
              </label>
            </span>
          ) : null}
          {filters?.pool ? (
            <SelectFilter label="Pool" value={state.pool} options={pools} onChange={(pool) => setState({ pool })} />
          ) : null}
          {filters?.health ? (
            <SelectFilter label="Status" value={state.health} options={healths} onChange={(health) => setState({ health })} />
          ) : null}
          {filters?.minProj ? (
            <label className="flex w-36 flex-col gap-1">
              <span className="t-colhead text-muted-foreground">{minProjLabel}</span>
              <Input inputMode="decimal" value={state.minProj} onChange={(e) => setState({ minProj: e.target.value })} />
            </label>
          ) : null}
          {filters?.hideUnproj ? (
            <span className="flex items-end gap-2 pb-1">
              <label className="flex items-center gap-2 t-body text-foreground">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={!state.showunproj}
                  onChange={(e) => setState({ showunproj: e.target.checked ? "" : "1" })}
                />
                Hide unprojected
              </label>
              <span className="t-caption text-muted-foreground">
                {state.showunproj
                  ? `${unprojCount} with no projection`
                  : `hiding ${unprojCount} with no projection`}
              </span>
            </span>
          ) : null}
        </div>
      ) : null}
      <section
        className={stickyHeader ? "card" : "card overflow-x-auto"}
        aria-label={ariaLabel}
      >
        {toolbar}
        {stickyHeader ? (
          <div
            data-slot="sticky-head"
            className="sticky top-[var(--topbar-height)] z-[9] overflow-hidden border-b border-border bg-muted"
          >
            <table ref={headTableRef} className="caption-bottom text-sm">
              {headerRows("frozen")}
            </table>
          </div>
        ) : null}
        <Table containerRef={stickyHeader ? scrollRef : undefined}>
          {headerRows(stickyHeader ? "layout" : "normal")}
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-6 text-center t-caption">
                  {empty}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row, i) => {
                const extra = rowProps?.(row.original, i) ?? {};
                return (
                  <TableRow
                    key={row.id}
                    {...extra}
                    onClick={onRowClick ? () => onRowClick(row.original) : extra.onClick}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const col = columns.find((c) => c.id === cell.column.id);
                      return (
                        <TableCell
                          key={cell.id}
                          className={cn(col?.align === "right" && "text-right", col?.className)}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}

function SelectFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="t-colhead text-muted-foreground">{label}</span>
      <select
        className="h-8 rounded-md border border-border bg-card px-2 t-body"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
