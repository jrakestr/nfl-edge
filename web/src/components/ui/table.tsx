"use client"

import * as React from "react"
import { cn } from "cn"

function Table({
  className,
  containerRef,
  ...props
}: React.ComponentProps<"table"> & { containerRef?: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={containerRef}
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

const MIN_COLUMN_WIDTH = 48

function TableHead({
  className,
  style,
  children,
  resizable = true,
  onResizeWidth,
  ...props
}: React.ComponentProps<"th"> & {
  resizable?: boolean
  onResizeWidth?: (widthPx: number | null) => void
}) {
  const thRef = React.useRef<HTMLTableCellElement>(null)
  const [widthPx, setWidthPx] = React.useState<number | null>(null)
  const [resizing, setResizing] = React.useState(false)

  const applyWidth = (next: number | null) => {
    setWidthPx(next)
    onResizeWidth?.(next)
  }

  const startResize = (e: React.PointerEvent<HTMLSpanElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const th = thRef.current
    if (!th) return
    const startX = e.clientX
    const startWidth = th.getBoundingClientRect().width
    setResizing(true)

    const onMove = (ev: PointerEvent) => {
      const next = Math.max(MIN_COLUMN_WIDTH, Math.round(startWidth + (ev.clientX - startX)))
      applyWidth(next)
    }

    const onUp = () => {
      setResizing(false)
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
    }

    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
  }

  const resetWidth = (e: React.MouseEvent<HTMLSpanElement>) => {
    e.preventDefault()
    e.stopPropagation()
    applyWidth(null)
  }

  const sizeStyle: React.CSSProperties | undefined =
    widthPx != null
      ? { ...style, width: `${widthPx}px`, minWidth: `${widthPx}px`, maxWidth: `${widthPx}px` }
      : style

  const showHandle = resizable && (props.colSpan ?? 1) === 1

  return (
    <th
      ref={thRef}
      data-slot="table-head"
      data-resizing={resizing ? "true" : undefined}
      style={sizeStyle}
      className={cn(
        "group/th relative h-auto min-h-12 px-2 py-2 text-left align-bottom font-medium whitespace-normal text-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    >
      {children}
      {showHandle ? (
        <span
          aria-hidden="true"
          title="Drag to resize; double-click to reset"
          data-slot="column-resizer"
          onPointerDown={startResize}
          onDoubleClick={resetWidth}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "absolute top-0 right-0 z-20 h-full w-1.5 cursor-col-resize select-none touch-none border-r-2 border-transparent transition-colors hover:border-border-strong group-hover/th:border-border",
            resizing && "border-border-strong"
          )}
        />
      ) : null}
    </th>
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
